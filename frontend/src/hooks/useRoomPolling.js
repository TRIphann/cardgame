// useRoomPolling — polls the backend at a fixed baseline interval while the
// room is in lobby state. The interval expands when no state change is
// observed (exponential backoff, capped at POLL_INTERVAL_MAX_MS) and resets
// to POLL_INTERVAL_MS as soon as the response differs from the previous one.
//
// Why exponential backoff
// -----------------------
// A lobby can sit in `waiting` for several minutes with no activity, and
// every open tab polls /snapshot on the same cadence. Polling at 3s
// forever burns ~20 reads/min/tab from the Firestore free tier (50K/day).
// When 5 players each have the lobby tab open, that is 100 reads/min —
// 6000/hour — which exhausts the daily budget in <9h. The backend's 5s
// snapshot cache deduplicates back-to-back polls within 2s, but tabs that
// arrive later (join lobby, refresh) still hit fresh Firestore reads on
// each 3s tick.
//
// Exponential backoff keeps the lobby feeling "live" right after the last
// change (3s) but settles to a low-traffic cadence (~12s) once things are
// quiet. The cap is short enough that real activity (another player
// joining, host starting the game) is detected within a few seconds.

import { useCallback, useEffect, useRef, useState } from "react";
import { roomsApi } from "@shared/api/roomsApi.js";
import { loadSession } from "@config/env.js";

const POLL_INTERVAL_MS = 3000;
const POLL_INTERVAL_MAX_MS = 12000;
const POLL_BACKOFF_FACTOR = 2;

export function useRoomPolling(roomId, { enabled = true, memberId = null } = {}) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const stoppedRef = useRef(false);
  const intervalRef = useRef(POLL_INTERVAL_MS);
  const lastSerializedRef = useRef("");
  // Use refs to always get the latest roomId/enabled/memberId without causing re-renders.
  const roomIdRef = useRef(roomId);
  const enabledRef = useRef(enabled);
  const memberIdRef = useRef(memberId);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    memberIdRef.current = memberId;
  }, [memberId]);

  const refresh = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    const currentMemberId = memberIdRef.current;
    if (!currentRoomId || !enabledRef.current) return;
    try {
      // /snapshot also marks stale (offline) members on the server, so this
      // single call drives both UI freshness and the "ghost player" cleanup.
      // Pass the local memberId so the server keeps us marked online and the
      // snapshot is scoped to our viewer (avoids stale-member prune races).
      const myId = currentMemberId || loadSession()?.playerId || null;
      const body = await roomsApi.snapshot(currentRoomId, myId);
      const next = body.room ?? body;
      // Detect a state change cheaply by hashing the serialized payload. The
      // server already filters out members' LastSeenAt churn via the 5s
      // snapshot cache, but in-tab heartbeat refreshes still bump it; we
      // strip those volatile fields before hashing so heartbeats don't
      // reset the backoff timer.
      const serialized = serializeForChangeDetection(next);
      if (serialized !== lastSerializedRef.current) {
        lastSerializedRef.current = serialized;
        intervalRef.current = POLL_INTERVAL_MS;
      }
      setRoom(next);
      setError(null);
      if (next?.status === "playing") stoppedRef.current = true;
      return next;
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    if (!roomId || !enabled) return undefined;
    intervalRef.current = POLL_INTERVAL_MS;
    lastSerializedRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refresh();

    let timerId = null;
    const schedule = () => {
      if (stoppedRef.current) return;
      timerId = setTimeout(async () => {
        await refresh();
        // After a successful tick where nothing changed, slow the next
        // poll down. After a change, refresh() already reset the interval
        // back to POLL_INTERVAL_MS.
        intervalRef.current = Math.min(
          Math.max(intervalRef.current, POLL_INTERVAL_MS) * POLL_BACKOFF_FACTOR,
          POLL_INTERVAL_MAX_MS,
        );
        schedule();
      }, intervalRef.current);
    };
    schedule();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [roomId, enabled, refresh]);

  return { room, error, refresh };
}

// Cheap structural hash of the snapshot — used to detect user-visible
// changes (member join/leave, status flip, ready state, etc.) without
// re-running deep equality on every poll. Strips per-tab heartbeat fields
// (LastSeenAt) so a single member's heartbeat doesn't reset backoff when
// the lobby hasn't actually changed.
function serializeForChangeDetection(room) {
  if (!room) return "";
  const memberSig = (room.members || [])
    .map((m) => `${m.id}:${m.isReady ? 1 : 0}:${m.isOnline ? 1 : 0}:${m.isHost ? 1 : 0}`)
    .join("|");
  const gameSig = room.gameState
    ? `${room.gameState.currentTurnMemberId || ""}:${(room.gameState.turnOrder || []).join(",")}:${room.gameState.status || ""}`
    : "nogame";
  return `${room.status || ""}#${(room.members || []).length}#${memberSig}#${gameSig}`;
}