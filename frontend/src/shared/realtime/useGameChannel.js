// useGameChannel — hooks a React component up to the GameHub realtime
// channel. When the server broadcasts "room-updated" for any room, the
// server has ALREADY pushed the full snapshot (gameState, members, etc.)
// in the payload — clients just use the snapshot and call onUpdate. No
// extra Firestore read required.
//
// Latency: server pushes within ~50ms of mutation. Polling fallback fires
// every FALLBACK_POLL_MS if the hub disconnects so we never get stuck.

import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_BASE_URL, API_HUB_URL } from "@config/env.js";
import { roomsApi } from "@shared/api/roomsApi.js";

const FALLBACK_POLL_MS = 1500; // Reduced from 3000 for more responsive updates
const HUB_RETRY_MS = 3000;     // Reduced from 5000 for faster reconnection
const IMMEDIATE_POLL_DELAY_MS = 50; // first poll fires almost immediately

// Unified 10-second rule: every committed action resets the turn timer
// back to 10s. Matches GameService.TurnTimeLimitSeconds (TurnClockService
// + NopeTimeoutService + FuturePeekSweeperService all read from this).
const TURN_TIME_LIMIT_SEC = 10;

// Normalize backend Room entity to client RoomDto format.
// Handles: Members (PascalCase) -> members (camelCase), etc.
// Normalize backend Room entity to client RoomDto format.
// viewerId: optional memberId of the viewer so myHand can be populated from
// GameState.Hands for SignalR payloads (where no top-level myHand exists).
function normalizeRoom(data, viewerId) {
  if (!data) return null;
  // Already camelCase (RoomDto from REST/snapshot endpoint)
  if (data.members && Array.isArray(data.members)) {
    return data;
  }
  // PascalCase Room entity from SignalR broadcast
  if (data.Members && Array.isArray(data.Members)) {
    // Extract hands from GameState.Hands (Dictionary<memberId, List<cardKey>>)
    const gsHands = data.GameState?.Hands ?? {};
    const handsById = typeof gsHands === "object" && !Array.isArray(gsHands)
      ? Object.fromEntries(
          Object.entries(gsHands).map(([k, v]) => [k, Array.isArray(v) ? v : []])
        )
      : {};

    // Compute handCounts from the Hands dictionary so Seat components show
    // correct counts even when the Room entity doesn't carry Members.
    const handCounts = Object.fromEntries(
      Object.keys(handsById).map((k) => [k, handsById[k].length])
    );

    const result = {
      ...data,
      members: data.Members.map((m) => ({
        id: m.Id,
        name: m.Name,
        isHost: m.IsHost,
        isReady: m.IsReady,
        isOnline: m.IsOnline,
        joinedAt: m.JoinedAt,
        lastSeenAt: m.LastSeenAt,
        hand: handsById[m.Id] ?? m.hand ?? [],
      })),
      gameState: data.GameState ? normalizeGameState(data.GameState) : null,
    };

    // Inject handCounts into gameState so Seat components render correctly.
    // This fixes the "all seats show 0 cards" bug where SignalR broadcasts
    // the Room entity without HandCounts (it's a computed DTO field, not an entity prop).
    if (result.gameState) {
      result.gameState = { ...result.gameState, handCounts };
    }

    // Populate myHand from GameState.Hands so safeSetRoom always has an
    // authoritative hand for the current viewer, even for SignalR payloads.
    // If viewerId is not available, fall back to the host's hand (the human
    // player in a test room) so hand state is never lost on the first render
    // before myId is populated from the room snapshot.
    if (viewerId) {
      result.myHand = handsById[viewerId] ?? null;
    } else if (result.members?.length > 0) {
      // Fallback: use the first non-bot member's hand (the human player).
      // safeSetRoom also needs the viewer's ID to match member hands, so
      // we set a synthetic viewerId field that safeSetRoom can fall back to.
      const human = result.members.find(m => !m.isBot);
      if (human) {
        result.myHand = handsById[human.id] ?? null;
        // This lets safeSetRoom derive myId when it's still undefined.
        result._viewerId = human.id;
      }
    }
    return result;
  }
  // Detection: if the payload looks like an error envelope (has `code` or
  // `message` but no `members` array), drop it so the consumer's dedupe
  // logic doesn't get tricked into "no update".
  if (data.code || data.message) return null;
  return data;
}

// Normalize a REST API RoomDto response that has MyHand (PascalCase) but no Members.
// Converts to camelCase so safeSetRoom can read myHand correctly.
export function normalizeRestRoom(roomData, memberId) {
  if (!roomData) return null;

  // Already camelCase
  if (roomData.members && Array.isArray(roomData.members)) {
    return roomData;
  }

  // REST RoomDto: Members (PascalCase) but already flattened
  if (roomData.Members && Array.isArray(roomData.Members)) {
    const gsHands = roomData.GameState?.Hands ?? {};
    const handsById = typeof gsHands === "object" && !Array.isArray(gsHands)
      ? Object.fromEntries(Object.entries(gsHands).map(([k, v]) => [k, Array.isArray(v) ? v : []]))
      : {};

    const members = roomData.Members.map((m) => ({
      id: m.Id,
      name: m.Name,
      isHost: m.IsHost,
      isReady: m.IsReady,
      isOnline: m.IsOnline,
      joinedAt: m.JoinedAt,
      lastSeenAt: m.LastSeenAt,
      hand: handsById[m.Id] ?? [],
    }));

    // REST always has top-level MyHand (PascalCase) from MapToDto
    const myHand = roomData.MyHand || null;

    // Normalize GameState if present
    let gameState = null;
    if (roomData.GameState) {
      const gs = roomData.GameState;
      // GameStateDto has camelCase properties already (from System.Text.Json default)
      // but might have some PascalCase fields. Normalize just the critical ones.
      gameState = {
        ...gs,
        currentTurnMemberId: gs.CurrentTurnMemberId || gs.currentTurnMemberId,
        attackCounter: gs.AttackCounter ?? gs.attackCounter,
        handCounts: gs.HandCounts || gs.handCounts,
        alive: gs.Alive || gs.alive,
        discardCount: gs.DiscardCount || gs.discardCount,
        pendingAction: gs.PendingAction || gs.pendingAction,
        lastDrawnBy: gs.LastDrawnBy || gs.lastDrawnBy,
        lastDrawnCardKey: gs.LastDrawnCardKey || gs.lastDrawnCardKey,
        lastDrawnAt: gs.LastDrawnAt || gs.lastDrawnAt,
        bombRevealActive: gs.BombRevealActive ?? gs.bombRevealActive,
        lastPlayedCardKey: gs.LastPlayedCardKey || gs.lastPlayedCardKey,
        lastPlayedBy: gs.LastPlayedBy || gs.lastPlayedBy,
        lastPlayedAt: gs.LastPlayedAt || gs.lastPlayedAt,
        lastPlayedByNope: gs.LastPlayedByNope || gs.lastPlayedByNope,
        turnStartedAt: gs.TurnStartedAt || gs.turnStartedAt,
        turnTimeLimitSec: (gs.TurnTimeLimitSec ?? gs.turnTimeLimitSec) || TURN_TIME_LIMIT_SEC,
        turnRemainingSec: (gs.TurnRemainingSec ?? gs.turnRemainingSec),
        turnOrder: gs.TurnOrder || gs.turnOrder,
        futurePeek: gs.FuturePeek || gs.futurePeek,
        pendingFavorPick: gs.PendingFavorPick || gs.pendingFavorPick,
        afkMemberIds: gs.AfkMemberIds || gs.afkMemberIds,
        clientReady: gs.ClientReady ?? gs.clientReady,
        botTurnSeconds: gs.BotTurnSeconds ?? gs.botTurnSeconds,
        // REST GameStateDto already has MyHand at the gameState level
        myHand: gs.MyHand || gs.myHand || null,
      };
    }

    const result = {
      id: roomData.Id,
      code: roomData.Code,
      hostId: roomData.HostId,
      hostName: roomData.HostName,
      status: roomData.Status,
      maxPlayers: roomData.MaxPlayers,
      currentPlayers: roomData.CurrentPlayers,
      createdAt: roomData.CreatedAt,
      members,
      gameState,
      myHand,
      _viewerId: memberId || null,
    };

    return result;
  }

  return roomData;
}

function normalizeGameState(gs) {
  if (!gs) return gs;
  // Already camelCase (REST GameStateDto — MapToDto maps all properties to camelCase).
  // BUG-FIX: The old check `currentTurnMemberId !== undefined` matched camelCase but
  // SignalR sends PascalCase (CurrentTurnMemberId), so it fell through to the final
  // `return gs` with a hybrid object where only some fields were camelCase.
  // The new check correctly identifies SignalR's PascalCase payload by testing the
  // canonical PascalCase field, which guarantees the entire normalize block runs.
  if (gs.CurrentTurnMemberId !== undefined) {
    return {
      discardCount: gs.DiscardCount,
      handCounts: gs.HandCounts,
      turnsTaken: gs.TurnsTaken,
      cardsPlayed: gs.CardsPlayed,
      alive: gs.Alive,
      diedAt: gs.DiedAt,
      currentTurnMemberId: gs.CurrentTurnMemberId,
      attackCounter: gs.AttackCounter,
      winnerId: gs.WinnerId,
      startedAt: gs.StartedAt,
      endedAt: gs.EndedAt,
      pendingAction: gs.PendingAction,
      lastDrawnBy: gs.LastDrawnBy,
      lastDrawnCardKey: gs.LastDrawnCardKey,
      lastDrawnAt: gs.LastDrawnAt,
      bombRevealActive: gs.BombRevealActive,
      lastPlayedCardKey: gs.LastPlayedCardKey,
      lastPlayedBy: gs.LastPlayedBy,
      lastPlayedAt: gs.LastPlayedAt,
      lastPlayedByNope: gs.LastPlayedByNope,
      turnStartedAt: gs.TurnStartedAt,
      turnTimeLimitSec: gs.TurnTimeLimitSec,
      turnRemainingSec: gs.TurnRemainingSec,
      turnOrder: gs.TurnOrder,
      futurePeek: gs.FuturePeek,
      pendingFavorPick: gs.PendingFavorPick,
      afkMemberIds: gs.AfkMemberIds,
      clientReady: gs.ClientReady,
      // Bot turn override: seconds bots take to act. 0 = use 60s default.
      botTurnSeconds: gs.BotTurnSeconds,
    };
  }
  // Fallback: return as-is for unknown structure.
  return gs;
}

function hubUrl() {
  // REST proxies through Netlify but the SignalR hub talks WebSockets, which
  // Netlify redirect rules can't proxy. We send the hub straight to the
  // Render URL (`API_HUB_URL`), keeping the REST API on a same-origin path.
  const base = (API_HUB_URL || API_BASE_URL).replace(/\/+$/, "");
  return `${base}/hubs/game`;
}

export function useGameChannel({ roomId, memberId, onUpdate, onToast, enabled, testMode }) {
  const [connected, setConnected] = useState(false);
  const connRef = useRef(null);
  const pollTimerRef = useRef(null);
  const retryTimerRef = useRef(null);

  // Keep callback refs in sync so listeners installed by startHub always see
  // the freshest onUpdate/onToast without rebuilding the SignalR connection
  // on every render.
  const onUpdateRef = useRef(onUpdate);
  const onToastRef = useRef(onToast);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onToastRef.current = onToast; }, [onToast]);

  useEffect(() => {
    if (!enabled || !roomId) return undefined;
    let disposed = false;

    const safeFetch = async () => {
      try {
        const data = testMode
          ? await roomsApi.snapshotTest(roomId)
          : await roomsApi.snapshotWithViewer(roomId, memberId);
        return data;
      } catch (_) {
        return null;
      }
    };

    const startPoll = () => {
      if (pollTimerRef.current) return;
      let useInterval = false;
      const tick = async () => {
        if (disposed) return;
        const data = await safeFetch();
        if (!disposed && data) onUpdateRef.current?.(data);
      };
      // First poll fires nearly immediately so the UI doesn't sit on a
      // spinner for the 3s fallback interval after a fresh mount. Subsequent
      // polls use the slower interval.
      pollTimerRef.current = setTimeout(() => {
        if (disposed) return;
        pollTimerRef.current = setInterval(tick, FALLBACK_POLL_MS);
        useInterval = true;
        tick();
      }, IMMEDIATE_POLL_DELAY_MS);
      void useInterval;
    };

    const stopPoll = () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const stopRetry = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const startHub = async () => {
      stopRetry();
      try {
        const conn = new signalR.HubConnectionBuilder()
          .withUrl(hubUrl())
          .withAutomaticReconnect([1000, 2000, 5000, 10000])
          .configureLogging(signalR.LogLevel.Warning)
          .build();

        conn.on("room-updated", (payload) => {
          const data = payload?.snapshot ?? payload;
          if (data && !disposed) {
            const normalized = normalizeRoom(data, memberId);
            if (normalized) onUpdateRef.current?.(normalized);
          }
        });

        conn.on("room-snapshot", (data) => {
          if (data && !disposed) {
            const normalized = normalizeRoom(data, memberId);
            if (normalized) onUpdateRef.current?.(normalized);
          }
        });

        conn.on("room-toast", (payload) => {
          if (!payload || disposed) return;
          const text = payload.text;
          const excludes = Array.isArray(payload.excludeMemberIds) ? payload.excludeMemberIds : [];
          if (memberId && excludes.includes(memberId)) return;
          if (typeof text === "string" && text.length > 0) {
            onToastRef.current?.(text);
          }
        });

        conn.onreconnecting(() => {
          if (disposed) return;
          setConnected(false);
          startPoll();
        });
        conn.onreconnected(() => {
          if (disposed) return;
          setConnected(true);
          stopPoll();
          conn.invoke("JoinRoom", roomId, memberId).catch(() => {});
        });
        conn.onclose(() => {
          if (disposed) return;
          setConnected(false);
          startPoll();
        });

        await conn.start();
        if (disposed) {
          await conn.stop();
          return;
        }
        connRef.current = conn;
        await conn.invoke("JoinRoom", roomId, memberId);
        setConnected(true);
        stopPoll();
      } catch (_) {
        if (!disposed) {
          startPoll();
          retryTimerRef.current = setTimeout(() => {
            if (!disposed) startHub();
          }, HUB_RETRY_MS);
        }
      }
    };

    startPoll();
    startHub();

    return () => {
      disposed = true;
      stopPoll();
      stopRetry();
      if (connRef.current) {
        try {
          connRef.current.invoke("LeaveRoom", roomId).catch(() => {});
        } catch (_) {}
        connRef.current.stop().catch(() => {});
        connRef.current = null;
      }
    };
  }, [enabled, roomId, memberId]);

  return { connected };
}