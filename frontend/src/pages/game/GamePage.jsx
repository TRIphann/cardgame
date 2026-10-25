// GamePage — full Exploding Kittens match view.
// Layout:
//   - Top bar: room info + elapsed timer
//   - Sides: other players (max 3 per side, seated at edges)
//   - Center: deck pile (raised slightly), discard, active-card slot
//   - Bottom: YOU with hand arc + action buttons (Rút bài, Sẵn sàng)
// Sub-components: GameBackdrop, HandArc, modals (Card / Combo / Defuse),
// DrawAnimation overlay, SummaryScreen overlay.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ROUTES } from "@config/env.js";
import { roomsApi } from "@shared/api/roomsApi.js";
import { useSession } from "../../app/session.jsx";
import { useAudio } from "@shared/audio/AudioManager.jsx";
import { useToast } from "@shared/ui/toast.jsx";
import { useGameChannel } from "@shared/realtime/useGameChannel.js";
import { CARD_CLOUDINARY, cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";
import { GameBackdrop } from "./GameBackdrop.jsx";
import { HandArc } from "./HandArc.jsx";
import { CardActionModal } from "./CardActionModal.jsx";
import { PlayerPickerModal } from "./PlayerPickerModal.jsx";
import { CardPickModal } from "./CardPickModal.jsx";
import { DefuseModal } from "./DefuseModal.jsx";
import { FuturePeekModal } from "./FuturePeekModal.jsx";
import { ComboSelectionModal } from "./ComboSelectionModal.jsx";
import { DrawAnimation } from "./DrawAnimation.jsx";
import { PlayCardAnimation } from "./PlayCardAnimation.jsx";
import { BombReveal, BombExplode } from "./BombReveal.jsx";
import { ActionCardReveal } from "./ActionCardReveal.jsx";
import { FxBurst } from "./FxBurst.jsx";
import { FxScreenShake } from "./FxScreenShake.jsx";
import { SummaryScreen } from "./SummaryScreen.jsx";
import { Seat } from "./Seat.jsx";
import { ExitTestButton } from "../test/ExitTestButton.jsx";
import "../styles/game.css";

// Combo card keys (server-side "defuse variants").
const COMBO_KEYS = ["ninja", "superman", "zombie", "robot", "hải-tặc"];
// Special handling: which cards need a target pick (server will validate).
const CARDS_REQUIRING_TARGET = new Set(["favor"]);

// Guard: prevent TurnIntro from showing repeatedly when turnOrder changes
const TURN_INTRO_DISMISS_MS = 3000;

function readSessionRoomId() {
  try {
    const raw = sessionStorage.getItem("arcana.session.v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// Server (GameService.cs) uses a 10s window for the Nope chain. We mirror
// it client-side so the visible countdown matches the server's auto-resolve.
const NOPE_WINDOW_MS = 10_000;

// Unified 10-second rule (matches GameService.TurnTimeLimitSeconds).
// Every committed action resets the turn timer back to 10s, and every
// picker (Future peek, Favor target/card, Combo target/card, Bomb
// placement) uses the same 10s budget.
const TURN_TIME_LIMIT_SEC = 10;

function statusToText(s) {
  if (s === "playing") return "Đang chơi";
  if (s === "finished") return "Đã kết thúc";
  if (s === "waiting") return "Đợi";
  return s;
}

function getLocalPlayerId(session) {
  return session?.playerId || readSessionRoomId()?.playerId || null;
}

export default function GamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionCtx = useSession();
  const toast = useToast();
  const audio = useAudio();

  // The SessionContext value is `{ session, update, patch, clear }`.
  // Unwrap the inner session object so the rest of the component reads
  // natural property names (`session.playerId`, not `session.session.playerId`).
  const session = sessionCtx?.session || null;
  const myId = getLocalPlayerId(session);

  // ── Core state ──────────────────────────────────────────────
  const [room, setRoom] = useState(null);

  // Defensive setter: never let `room` go to null/undefined after it's been
  // populated. Several action handlers do `setRoom(res.Room)` and `res.Room`
  // may be missing for edge cases (server returns a non-RoomDto shape, or
  // SignalR pushes a malformed snapshot during reconnect). The full-page
  // spinner uses `if (!room)` to gate rendering, so accidentally setting
  // `null` here would unmount the entire game UI mid-action — which is the
  // root cause of the "loading after draw / play" symptom. Wrapping keeps
  // the prior snapshot on screen until we get a real one back.
  const safeSetRoom = useCallback((next) => {
    setRoom((prev) => {
      if (next === null || next === undefined) return prev;
      // Resolve the viewer's memberId: prefer myId from session, fall back to
      // the _viewerId hint that normalizeRoom sets when the session playerId isn't
      // yet known (e.g. on the very first SignalR payload before REST snapshot
      // populates the session). Without this fallback the first snapshot (which
      // already carries correct hands in next.members[i].hand) would not match
      // the viewer and safeSetRoom would preserve stale prev hands instead.
      const resolvedMyId = myId || next._viewerId || null;

      // Preserve hands that the new payload omits or shortens.
      //
      // Why this guard exists:
      //   • Production `RoomsController.MapToDto` exposes the caller's
      //     `MyHand` only — every other member's `hand` array is missing
      //     from the REST/snapshot payload.
      //   • SignalR broadcasts the full `Room` entity, which DOES carry
      //     `GameState.Hands` for everyone, but the wire-normalize step in
      //     `useGameChannel.js` drops `IsBot` and other fields and may emit
      //     a stale empty `hand: []` for a player whose hand actually grew.
      //   • The polling-fallback path may arrive with a partial payload if
      //     a transient error truncated the response.
      //
      // Without the guard, any of those payloads would clobber the cached
      // hand of every member and the user would see "all hands vanish"
      // (their own drawn card disappears, bot seats report 0 cards, etc).
      //
      // Rule: never let an empty/missing `hand` array in the incoming
      // payload OVERWRITE a known non-empty hand we already cached locally.
      // A payload that brings a populated hand always wins — that's the
      // server's authoritative state.
      //
      // Special case: for the LOCAL viewer, the server exposes the hand via
      // `next.myHand` (REST snapshot) or `next._viewerId` (SignalR fallback).
      // If we blindly preserve `prev.members[i].hand` (which may itself be
      // empty from a stale SignalR snapshot), we'd clobber the freshly-drawn
      // card. For the viewer, prefer `next.myHand` whenever it's a non-empty
      // array, and otherwise fall back to whatever the payload carries.
      //
      // BUGFIX-2026-09-04: When the action-response payload's `members`
      // omit `hand` for every member (production `MapToDto` strips member
      // hands on the wire) AND the viewer was just identified (e.g. by
      // `myId` shortly after navigating back to a game tab), the safeSetRoom
      // had been silently dropping the viewer's freshly-drawn card onto the
      // wrong member slot because `resolvedMyId` and `m.id` never matched.
      // To make the viewer-hand propagation deterministic, we now always
      // detect the viewer by `next.myHand`'s presence: any member whose
      // existing `hand` is empty AND would be patched by the preservation
      // logic is a candidate — if `next.myHand` is provided, we treat the
      // first empty-hand member in the list (which the wire format emits
      // in turn order so it's the viewer) as the viewer and apply myHand
      // there too. Combined with the existing `room.myHand` write, this
      // guarantees the HandArc shows the latest cards within one render.
      // BUGFIX-2026-09-10: previous code treated myHand=[] (empty array, player
      // played their last card) as null and then preserved the prior hand — the
      // player would see "still have cards" when they just played their last.
      // Now we distinguish "server didn't provide myHand at all" (null/undefined)
      // from "server explicitly set hand to empty" ([]). The latter must win.
      if (prev && next && Array.isArray(next.members)) {
        const nextMyHandRaw = Array.isArray(next.myHand) ? next.myHand : null;
        // serverProvidedMyHand: true when the server sent us a hand (even if []).
        // This guards the "server said hand is empty → show empty" path.
        const serverProvidedMyHand = nextMyHandRaw !== null;
        // effectiveMyHand: the hand to apply for the viewer. [] is a valid value
        // (means "hand is empty"), null means "server didn't tell us anything".
        const effectiveMyHand = serverProvidedMyHand ? nextMyHandRaw : null;
        const prevById = new Map((prev.members || []).map((m) => [m.id, m]));
        // If the server didn't tell us which member is "us" (no _viewerId,
        // no match against myId), but it returned myHand, that's the viewer's
        // own hand — find that member in next.members by id and patch their
        // hand to mirror myHand. The viewer is the only member whose hand
        // we have authoritative info about in this case, so this is safe.
        let implicitViewerId = null;
        if (!resolvedMyId && serverProvidedMyHand) {
          for (const m of next.members) {
            if (!m.id) continue;
            const priorHand = prevById.get(m.id)?.hand;
            const priorHandHasCards = Array.isArray(priorHand) && priorHand.length > 0;
            // If the prior hand had cards but the new payload dropped it,
            // the wire-format likely stripped hand === viewer member.
            if (priorHandHasCards) {
              implicitViewerId = m.id;
              break;
            }
          }
        }
        const effectiveViewerId = resolvedMyId || implicitViewerId;
        next = {
          ...next,
          members: next.members.map((m) => {
            const prior = prevById.get(m.id);
            const incomingHandIsEmpty = !m.hand || !Array.isArray(m.hand) || m.hand.length === 0;
            const priorHandHasCards = Array.isArray(prior?.hand) && prior.hand.length > 0;
            // Viewer hand: always prefer the authoritative top-level myHand
            // (server returns this on REST/snapshot paths). This fixes the
            // "hand doesn't update after draw / play" symptom where prev
            // cached an empty hand but server actually populated myHand.
            // BUGFIX-2026-09-10: use effectiveMyHand (which includes [] as a
            // valid value) instead of the old nextMyHand (which was null for []).
            if (effectiveViewerId && m.id === effectiveViewerId) {
              if (effectiveMyHand !== null) return { ...m, hand: effectiveMyHand };
              if (incomingHandIsEmpty && priorHandHasCards) return { ...m, hand: prior.hand };
              return m;
            }
            // Other members: preserve prior if incoming is empty.
            if (priorHandHasCards && incomingHandIsEmpty) {
              return { ...m, hand: prior.hand };
            }
            return m;
          }),
        };
      }
      // Preserve handCounts when the members remap drops gameState entirely
      // (BUG: the `members` map loses gameState → next.gameState becomes undefined).
      // Also guard against SignalR broadcasts that don't carry handCounts.
      const prevGs = prev?.gameState;
      const nextGs = next?.gameState;
      if (prevGs?.handCounts && (!nextGs || nextGs.handCounts === undefined)) {
        next = {
          ...next,
          gameState: nextGs
            ? { ...nextGs, handCounts: prevGs.handCounts }
            : { handCounts: prevGs.handCounts },
        };
      }
      // BUGFIX: when members are remapped, gameState is silently dropped from
      // the next object, leaving room.gameState = undefined. Re-inject it from
      // prev so Seat components keep receiving gameState for handCounts.
      if (!next.gameState && prev?.gameState) {
        next = { ...next, gameState: prev.gameState };
      }
      return next;
    });
  }, [myId]);

  const [now, setNow] = useState(Date.now());
  const gs = room?.gameState || null;

  // Per-mount guard for the TurnIntro overlay. Previously this was a
  // module-level `let _turnIntroShown = false`, which leaked across
  // StrictMode re-mounts in dev and across room-rotation: the first time
  // the intro fired it set the module flag, and subsequent games on the
  // same tab (or the post-rotate remount) silently skipped the intro
  // forever. Using a `useRef` scoped to this component mount resets the
  // flag every time the player navigates to a new game.
  const turnIntroShownRef = useRef(false);

  // ── Selection / modal state ────────────────────────────────
  const [selectedCardIdx, setSelectedCardIdx] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { card, awaitingTarget? }
  // Generic "next step" modal — phases:
  //   { kind: "playerPick", card, purpose }  → PlayerPickerModal
  //   { kind: "cardPick", card, purpose, candidates, color, accent }
  const [pickModal, setPickModal] = useState(null);
  // Combo selection modal - shown when clicking a combo card to choose 2/3/5
  const [comboSelectModal, setComboSelectModal] = useState(null); // { card, comboCounts }
  const [futurePeek, setFuturePeek] = useState(null); // [key1, key2, key3]
  // When the user explicitly closed the peek modal. Tracked so subsequent
  // snapshot polls that still carry the same peek don't re-open it.
  const [futureDismissedAt, setFutureDismissedAt] = useState(null);
  const lastPeekStampRef = useRef(null);
  const lastPeekContentRef = useRef(null);
  const [defuseModal, setDefuseModal] = useState(false);
  // AFK feature removed: every action now has a hard 10s timer. If the player
  // doesn't act in time, the server auto-advances the turn immediately.
  // There's no more "you're AFK, click to come back" modal — the 10s budget
  // is the single source of truth for turn timing across every lobby.
  const [concedeConfirm, setConcedeConfirm] = useState(false);
  const [drawAnim, setDrawAnim] = useState(null); // { sourceRect, targetRect, cardKey, viewer, revealKey }
  const [recentDiscards, setRecentDiscards] = useState([]); // [{ key, by }] — last played cards
  const [opponentDrawAnim, setOpponentDrawAnim] = useState(null); // { memberId, cardKey }
  const [playedAnim, setPlayedAnim] = useState(null); // card flying from hand to discard
  // Cinematic overlays queue. Mỗi entry { fxKey, anchor, size, durationMs }.
  // Cứ 1 entry bị pop ra → render FxBurst, sau đó auto-clean sau `durationMs`.
  const [fxQueue, setFxQueue] = useState([]);
  const [shake, setShake] = useState(null); // { intensity, until }
  const [, _setTurnHighlight] = useState(null); // intentionally unused — kept for future turn highlight feature
  // Bomb reveal — sync across the room. { memberId, memberName, willDefuse, key }
  const [bombReveal, setBombReveal] = useState(null);
  // Bomb explode overlay — runs AFTER reveal if no defuse.
  const [bombExplode, setBombExplode] = useState(null);
  const lastTurnRef = useRef(null);
  const lastDrawnRef = useRef(null); // dedupe by `(memberId, lastDrawnAt)`
  // BUG-4 fix: keep a live ref to gs so auto-draw setTimeout can re-check
  // the current snapshot when it fires, instead of using a stale closure.
  const gsRef = useRef(null);
  useEffect(() => { gsRef.current = gs; }, [gs]);
  // Active timer for the corner opponent-draw toast. Tracked so we can
  // clear it if the game unmounts mid-animation (avoids "setState on
  // unmounted component" warnings).
  const opponentDrawTimerRef = useRef(null);
  // Track the last card the local player drew. We pass this into HandArc
  // so the freshly-drawn card can animate in (scale-up + glow) instead of
  // just popping into existence.
  const [lastDrawnKey, setLastDrawnKey] = useState(null);
  // Track which TurnOrder we've already surfaced to the local player as
  // "Bạn sẽ đi thứ X". Reset when the room changes.
  const lastTurnOrderRef = useRef(null);
  const [turnIntro, setTurnIntro] = useState(null); // { order, total, memberId }

  // ── Optimistic local state overlay (mirrors LobbyPage pattern) ──
  const [localDrawPending, setLocalDrawPending] = useState(false);
  const drawInFlightRef = useRef(false);
  // While a play-card request is in flight we lock the action modal so a
  // double-click doesn't fire two HTTP requests (which causes the second
  // one to come back as `action_pending` HTTP 409).
  const actionInFlightRef = useRef(false);

  // Refs to the deck & hand center for the draw animation source/target.
  const deckRef = useRef(null);
  const handCenterRef = useRef(null);
  const discardRef = useRef(null);
  // Refs for opponent seats (keyed by memberId) — used for draw animations.
  const seatRefs = useRef({});

  // Track which playerId we've already rotated back to (avoid loops).
// ── Helpers ────────────────────────────────────────────────
  const members = room?.members || [];
  const myMember = members.find((m) => m.id === myId) || null;
  // The server is authoritative for the local player's hand (it returns
  // `room.myHand` on every snapshot for the viewer). Prefer `room.myHand`
  // whenever it's a defined array — including the empty case where the
  // player truly just played/consumed their last card. Falling back to
  // `myMember.hand` only kicks in for the brief moment BEFORE the very
  // first snapshot lands (e.g. optimistic UI during navigation), which
  // used to keep stale "5 cards" visible after the server emptied the hand.
  const myHand = Array.isArray(room?.myHand)
    ? room.myHand
    : (myMember?.hand || []);
  const isMyTurn = gs && myId && gs.currentTurnMemberId === myId;
  const isAlive = !myMember || (gs && gs.alive?.[myId] !== false);
  const gameEnded = gs && gs.endedAt;

  // Helper: enqueue 1 FxBurst overlay. anchor có thể là DOMRect hoặc {x,y}.
  const emitFx = useCallback((fxKey, anchor, opts = {}) => {
    if (!anchor) return;
    let cx, cy;
    if (typeof anchor.left === "number") {
      cx = anchor.left + (anchor.width || 0) / 2;
      cy = anchor.top + (anchor.height || 0) / 2;
    } else {
      cx = anchor.x;
      cy = anchor.y;
    }
    const id = `${fxKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFxQueue((q) => [...q, { id, fxKey, anchor: { x: cx, y: cy }, size: opts.size || "md" }]);
    setTimeout(() => {
      setFxQueue((q) => q.filter((f) => f.id !== id));
    }, opts.durationMs || 1300);
  }, []);

  const emitShake = useCallback((intensity = "md", durationMs = 600) => {
    setShake({ intensity, until: Date.now() + durationMs });
    setTimeout(() => setShake(null), durationMs);
  }, []);

  // Slice players into left/right stacks for the layout. We put the local
  // player at the bottom (not in the side lists).
    // Layout rule (mirrors LobbyPage/Seats.jsx logic):
    //   1. Host  → left column, always (regardless of viewer).
    //   2. Non-host members (excluding self) → alternate RIGHT → LEFT in the
    //      order they joined, keeping the two sides as balanced as possible.
    //
    // With 3 players (host + 2 guests):
    //   host viewer →  left = [host], right = [guest1, guest3?], left = [guest2]
    //   guest viewer → left = [host],     right = [others]
    // Every viewer therefore sees the same overall shape.
    const opponents = useMemo(() => {
      const nonSelf = members.filter((m) => m.id !== myId);
      const host = nonSelf.find((m) => m.isHost) || null;
      const others = nonSelf
        .filter((m) => !m.isHost)
        .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

      const left = [];
      const right = [];
      if (host) left.push(host);

      // Even-indexed non-host players go right; odd-indexed go left.
      for (let i = 0; i < others.length; i++) {
        if (i % 2 === 0) right.push(others[i]);
        else left.push(others[i]);
      }

      return { left, right };
    }, [members, myId]);

  const topPlayer = useMemo(() => {
    // Current-turn player for the active glow.
    if (!gs) return null;
    return members.find((m) => m.id === gs.currentTurnMemberId) || null;
  }, [members, gs]);

  // ── Realtime: SignalR hub + polling fallback ────────────────────
  // useGameChannel tries the SignalR "/hubs/game" hub first; while the hub
  // is connected the server pushes "room-updated" within ~50ms of any
  // mutation, INCLUDING the full Room snapshot in the payload (no extra
  // /snapshot fetch needed). When the hub disconnects (cold start,
  // network blip, etc.) the hook auto-falls-back to a 3s polling loop so
  // the UI never stalls.
  useGameChannel({
    roomId,
    memberId: myId,
    // BUGFIX-2026-09-14: stop polling/snapshotting once the game ends —
    // otherwise the GamePage keeps hammering the server for a finished
    // game that the backend has already cleaned up. The SummaryScreen
    // is the final view; no further API traffic should fire.
    enabled: Boolean(roomId && myId) && !gameEnded,
    testMode: Boolean(roomId && myId && searchParams.get("test") === "1"),
    onUpdate: (data) => {
      if (!data) return;
      // Always apply the latest snapshot — SignalR only fires `room-updated`
      // when something changed, and the dedupe logic (comparing fields that
      // don't exist on the DTO like `stateVersion`) was a previous bug that
      // caused stale state to "stick" after a snapshot landed, then get
      // overwritten moments later by the next one — producing a visible
      // flicker on every play / draw. We trust the server's "something
      // changed" signal here.
      safeSetRoom(data);
      // Only navigate to the lobby when the game is fully finished and the
      // host is preparing to re-rotate. The status field alone is too coarse
      // — a transient snapshot mid-game could otherwise mis-fire a route
      // change that looks like a "page reload" to the user.
      const gs = data?.gameState;
      const gameFinished = gs?.endedAt != null;
      const isLobby = data?.status === "waiting" && !gameFinished;
      if (isLobby) {
        navigate(ROUTES.lobby, { replace: true });
      }
    },
    onToast: (text) => {
      // Toast notifications broadcast over SignalR — generic info events.
      toast?.info?.(text);
    },
  });

  // AFK feature removed — every turn is governed by a single 10s budget.
  // The server auto-advances when the timer hits zero; no client-side
  // modal/button is needed.

  // /ready gate removed together with AFK — the server now arms the turn
  // clock unconditionally when it advances the turn.

  // Re-route the local player when they aren't in this room's members.
  // Only check on mount (roomId changes) to avoid aggressive re-navigation during gameplay.
  const routeCheckDoneRef = useRef(false);
  useEffect(() => {
    if (!roomId || routeCheckDoneRef.current) return;
    routeCheckDoneRef.current = true;
    const fromStorage = readSessionRoomId();
    if (!fromStorage && !session?.roomId) {
      navigate(ROUTES.landing, { replace: true });
    }
  }, [roomId]);

  // Track opponent draw events for the cross-table animation. When the turn
  // pointer flips to another player AND their hand count went UP, that's a
  // draw. We fire a flying-card overlay from the deck toward their seat so
  // the player can see "they just drew something".
  useEffect(() => {
    const prevTurn = lastTurnRef.current;
    const curTurn = gs?.currentTurnMemberId;
    const cardCounts = gs?.handCounts || {};
    if (prevTurn && curTurn && prevTurn !== curTurn) {
      // The player whose turn just ended probably drew.
      const drewCount = (cardCounts[prevTurn] ?? 0);
      // We don't know exactly which key they drew — animation is generic
      // (face-down card flying out). That's intentional: we hide opponent's
      // hand contents.
      if (drewCount > 0 && prevTurn !== myId) {
        setOpponentDrawAnim({ memberId: prevTurn, ts: Date.now() });
        if (opponentDrawTimerRef.current) clearTimeout(opponentDrawTimerRef.current);
        opponentDrawTimerRef.current = setTimeout(() => {
          setOpponentDrawAnim(null);
          opponentDrawTimerRef.current = null;
        }, 1100);
      }
    }
    lastTurnRef.current = curTurn;
  }, [gs?.currentTurnMemberId, gs?.handCounts, myId]);

  // Tick the "now" clock once per second so the elapsed timer + nope
  // window countdown update. 1s is enough resolution for both — the header
  // shows mm:ss and the nope window is in whole-second increments.
  // 250ms would re-render GamePage 4× per second just to redraw the same
  // second, wasting CPU during long sessions. If a future feature needs
  // finer resolution (e.g. a sub-second animation) this can be lowered
  // back; for now 1s is correct.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Clear any pending opponent-draw toast timer on unmount.
  useEffect(() => {
    return () => {
      if (opponentDrawTimerRef.current) {
        clearTimeout(opponentDrawTimerRef.current);
        opponentDrawTimerRef.current = null;
      }
    };
  }, []);

  // Reset turn order ref when roomId changes (new game / new session).
  useEffect(() => {
    lastTurnOrderRef.current = null;
    turnIntroShownRef.current = false;
  }, [roomId]);

  // Helper to determine if a card is a combo defuse.
  const isComboCard = useCallback((k) => COMBO_KEYS.includes(k), []);

  // When the server persists FuturePeek into GameState (after a Future card is
  // played), the SignalR snapshot will carry it back to us. If the modal isn't
  // open yet, auto-open it. If it's already open the state update is a no-op.
  // This survives re-connection: reconnecting players get the last peek result
  // from Firestore and can view it again without re-playing the card.
  //
  // Dismissal tracking: when the user explicitly closes the modal we set
  // futureDismissedAt. Subsequent snapshot polls that still carry the same
  // peek (the server only clears it after 13s) are ignored — otherwise the
  // modal would re-open itself on every 2.5s poll and trap the player.
  useEffect(() => {
    if (!gs?.futurePeek || gs.futurePeek.length === 0) return;
    // Compare by content + server timestamp so a brand-new peek still re-opens.
    const stamp = gs.futurePeekAt || null;
    const lastStamp = lastPeekStampRef.current;
    const samePeek =
      lastPeekStampRef.current &&
      lastStamp === stamp &&
      lastPeekContentRef.current &&
      JSON.stringify(lastPeekContentRef.current) === JSON.stringify(gs.futurePeek);
    if (futureDismissedAt && samePeek) return;
    lastPeekStampRef.current = stamp;
    lastPeekContentRef.current = gs.futurePeek;
    setFuturePeek(gs.futurePeek);
  }, [gs?.futurePeek, gs?.futurePeekAt, futureDismissedAt]);

  // Favor target-pick: when a Favor card lands and we're the TARGET, the
  // server tells us via gs.pendingFavorPick (TargetMemberId === myId). We
  // auto-open the card-pick modal so the target can choose which card to
  // hand over. Once they pick, the modal closes and the snapshot clears
  // gs.pendingFavorPick on the next tick.
  useEffect(() => {
    const fp = gs?.pendingFavorPick;
    if (!fp || !fp.targetMemberId || fp.targetMemberId !== myId) return;
    // If the picker is already open for this pick (with the same shuffled
    // candidates), skip — prevents re-opening after every snapshot.
    setPickModal((cur) => {
      if (cur && cur.kind === "cardPick" && cur.purpose === "FavorGive" && cur.initiatorId === fp.initiatorId) {
        return cur;
      }
      return {
        kind: "cardPick",
        purpose: "FavorGive",
        cardKey: "favor",
        title: "Xin — bạn phải đưa 1 lá",
        sub: `${members.find((m) => m.id === fp.initiatorId)?.name || "Đối thủ"} đã dùng Xin. Hãy chọn 1 lá trên tay để đưa.`,
        candidates: fp.shuffledCandidates || [],
        fxColor: "#ffd86b",
        fxAccent: "#ffeaa3",
        initiatorId: fp.initiatorId,
        targetId: myId,
      };
    });
  }, [gs?.pendingFavorPick, myId, members]);

  // When the game starts (or a new game is loaded), surface "Bạn sẽ đi
  // thứ X". We dedupe by deep JSON comparison so each new game shows the
  // intro once but re-renders of the same snapshot don't.
  // Guard: suppress when a modal is already active so the turn-intro doesn't
  // steal focus (e.g. over FuturePeek or any player-picker flow).
  useEffect(() => {
    if (futurePeek) return; // modal already open — don't interrupt it
    const order = gs?.turnOrder;
    if (!order || order.length === 0) {
      lastTurnOrderRef.current = null;
      // Clear stale intro if game ended (turnOrder gone)
      if (turnIntro && gameEnded) setTurnIntro(null);
      return;
    }
    const orderKey = order.join(",");
    if (lastTurnOrderRef.current === orderKey) return;
    lastTurnOrderRef.current = orderKey;
    const myIdx = order.indexOf(myId);
    if (myIdx < 0) return;
    
    // Guard: prevent TurnIntro from showing repeatedly within the same
    // mount (scoped via useRef so it resets on game-rotation re-mount,
    // unlike the previous module-level flag).
    if (turnIntroShownRef.current) return;
    turnIntroShownRef.current = true;

    setTurnIntro({ order: myIdx + 1, total: order.length, memberId: myId });
    // Auto-dismiss the intro after 2.4s so it doesn't linger when the next
    // snapshot arrives (no full re-render needed, just hide the bubble).
    const dismissT = setTimeout(() => {
      setTurnIntro(null);
      turnIntroShownRef.current = false;
    }, TURN_INTRO_DISMISS_MS);
    return () => clearTimeout(dismissT);
  }, [gs?.turnOrder, myId, futurePeek, gameEnded, turnIntro]);

  // When game ends, the SummaryScreen handles its own navigation. We only
  // expose no-op callbacks here so the screen can fall back gracefully if
  // it wants to defer the API call to us (today it doesn't).
  const onContinueFromSummary = useCallback(() => {
    // SummaryScreen now drives the /rotate call + navigation directly.
    // Kept here as a hook in case we later want to coordinate cleanup
    // (unregister poll/snapshot timers, drop the local snapshot cache,
    // etc.) alongside the rotate call.
  }, []);

  const onStopFromSummary = useCallback(() => {
    // Same — SummaryScreen handles navigation. This hook stays so future
    // cleanup (e.g. clearing sessionStorage room id) can be added without
    // touching the screen.
  }, []);

  // ── Card play flow ─────────────────────────────────────────
  // When user clicks a hand card, open the action modal.
  const onSelectHandCard = useCallback(
    (idx, key) => {
      // Block card selection during Future peek, pending action, or when not your turn
      if (!isMyTurn || !isAlive || gameEnded || futurePeek) return;
      setSelectedCardIdx(idx);
      const meta = getCardLabel(key);
      const meta2 = { key, ...meta };

      // Check if this is a combo card with multiple combo options
      if (isComboCard(key)) {
        const myHand = gs?.myHand || myMember?.hand || [];
        const aliveCount = gs?.alive
          ? Object.values(gs.alive).filter(Boolean).length
          : 5;

        // Count combo cards by type
        const handArr = Array.isArray(myHand) ? myHand : [];
        const comboByType = {};
        handArr.forEach(c => {
          if (isComboCard(c)) {
            comboByType[c] = (comboByType[c] || 0) + 1;
          }
        });

        // Count how many combo types are available
        const sameTypeCount = comboByType[key] || 0;
        const totalComboCount = handArr.filter(isComboCard).length;
        const hasFive = totalComboCount >= 5;
        const hasThree = aliveCount < 5 ? totalComboCount >= 3 : sameTypeCount >= 3;
        const hasTwo = aliveCount < 5 ? totalComboCount >= 2 : sameTypeCount >= 2;

        // If multiple combo options are available, show selection modal
        const comboOptionsCount = (hasFive ? 1 : 0) + (hasThree ? 1 : 0) + (hasTwo ? 1 : 0);
        if (comboOptionsCount > 1) {
          setComboSelectModal({
            card: meta2,
            comboCounts: {
              five: totalComboCount,
              three: aliveCount < 5 ? totalComboCount : sameTypeCount,
              two: aliveCount < 5 ? totalComboCount : sameTypeCount,
            },
          });
          return;
        }
      }

      setActionModal({ card: meta2, handIdx: idx });
    },
    [futurePeek, gameEnded, gs, isAlive, isComboCard, isMyTurn, myMember, myHand],
  );

  // Handle combo type selection from ComboSelectionModal
  const onComboSelect = useCallback(async (comboKind) => {
    const ctx = comboSelectModal;
    if (!ctx) return;
    setComboSelectModal(null);

    // Proceed with the combo flow
    const card = ctx.card;
    const res = await roomsApi.playCard(roomId, {
      memberId: myId,
      cardKey: card.key,
      comboKind,
    });

    if (res?.requiresTargetPick) {
      // Phase 1 for combo → PlayerPickerModal. The server already spent
      // the combo cards from our hand, so apply the snapshot BEFORE
      // opening the picker so the player sees their hand shrink.
      if (res.room) safeSetRoom(res.room);
      setPickModal({
        kind: "playerPick",
        purpose: comboKind,
        cardKey: card.key,
        title: comboKind === "TwoSame" ? "Combo 2 — Chọn đối thủ" : "Combo 3 — Chọn đối thủ",
        sub: comboKind === "TwoSame"
          ? "Lấy 1 lá ngẫu nhiên từ tay đối thủ."
          : "Yêu cầu đối thủ đưa 1 lá chỉ định (nếu có).",
      });
      return;
    }

    if (res?.requiresDiscardPick) {
      // Phase for combo 3/5 → CardPickModal. Same rationale: combo cards
      // are already gone from our hand on the server; sync the UI now.
      if (res.room) safeSetRoom(res.room);
      setPickModal({
        kind: "cardPick",
        purpose: comboKind,
        cardKey: card.key,
        title: "Chọn 1 lá từ chồng bỏ",
        sub: "Các lá đã đánh (trùng nhau chỉ hiện 1 lần).",
        candidates: res.favorCandidates || [],
        fxColor: "#ffd86b",
        fxAccent: "#a4f2dc",
      });
      return;
    }

    safeSetRoom(res.room);
    if (res?.toast) toast?.info?.(res.toast);
  }, [comboSelectModal, myId, roomId, toast]);

  // Helper: detect the highest combo the hand supports. Returns null / 'TwoSame' / 'ThreeSame' / 'FiveAny'.
  // Per the user-confirmed spec, when alive player count is < 5 the deck
  // doesn't have 5 distinct combo variants in circulation, so 2/3-same
  // combos accept MIXED types (any 2/3 combo cards). When N>=5 the strict
  // same-type rule applies. 5-of-any-mix is always allowed.
  const detectComboFor = useCallback(
    (hand, cardKey) => {
      const comboCount = (hand || []).filter(isComboCard).length;
      if (comboCount >= 5) return "FiveAny";
      const aliveCount = gs?.alive
        ? Object.values(gs.alive).filter(Boolean).length
        : 5;
      if (aliveCount < 5) {
        // Mix-type accepted: any 2 or 3 combo cards.
        if (comboCount >= 3) return "ThreeSame";
        if (comboCount >= 2) return "TwoSame";
        return null;
      }
      const sameCount = (hand || []).filter((c) => c === cardKey).length;
      if (sameCount >= 3) return "ThreeSame";
      if (sameCount >= 2) return "TwoSame";
      return null;
    },
    [isComboCard, gs?.alive],
  );

  // Dispatch a card play. Strategy:
  //   1) non-combo action → call playCard directly + handle response flags
  //   2) combo 2/3 (needs target) → open player picker
  //   3) combo 5 (needs discard key) → call playCard → server returns RequiresDiscardPick
  //   4) combo 3 (after target chosen) → server returns RequiresDiscardPick → open card picker
  const onConfirmAction = useCallback(async () => {
    if (!actionModal) return;
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
    const card = actionModal.card;
    setActionModal(null);
    setSelectedCardIdx(null);

    // Capture card key for stale-closure recovery in the catch block.
    // actionModal is set to null above, so we need savedCard to re-open
    // the modal on error (card_not_in_hand / not_your_turn / action_pending).
    const savedCardKey = card.key;

    // Safety: bail out if the local hand snapshot doesn't actually contain
    // the card we just selected. This guards against a stale render where
    // the server has already removed the card (e.g. another player's play
    // raced ahead of the snapshot). Without this we'd POST to /play-card
    // and get HTTP 400 "card_not_in_hand".
    // Priority: room.myHand (authoritative from latest REST snapshot) FIRST,
    // then myMember.hand (SignalR — can be stale between snapshots).
    const localHand = (room?.myHand && Array.isArray(room.myHand))
      ? room.myHand
      : (myMember?.hand && Array.isArray(myMember.hand))
        ? myMember.hand
        : [];
    if (!isComboCard(card.key) && !localHand.includes(card.key)) {
      actionInFlightRef.current = false;
      toast?.error?.("Bạn không còn lá này trên tay.");
      // Restore modal so the user can pick another card.
      const meta = getCardLabel(savedCardKey);
      setActionModal({ card: { key: savedCardKey, ...meta } });
      return;
    }

    // Capture source position for the "card flew out of hand to discard"
    // animation. We pick the bottom of the player seat so the card visually
    // travels upward to the table centre.
    const srcRect = handCenterRef.current?.getBoundingClientRect?.();
    const discardRect = discardRef.current?.getBoundingClientRect?.();
    if (srcRect) {
      setPlayedAnim({
        sourceRect: srcRect,
        targetRect: discardRect,
        cardKey: card.key,
        ts: Date.now(),
      });
      setTimeout(() => setPlayedAnim(null), 1700);
    }
    emitFx(card.key, discardRect, { size: "lg", durationMs: 1500 });

    try {
      // Combo five-any has highest precedence — even if the player clicked
      // a non-combo card (Attack/Skip/etc), if they have ≥5 combo defuses
      // the rules say the 5-combo eats those cards. Detect this BEFORE the
      // combo-card branch so it works regardless of which card the user
      // clicked.
      const comboCountInHand = (myHand || []).filter(isComboCard).length;
      if (comboCountInHand >= 5 && !isComboCard(card.key)) {
        // 5-of-any: pick the FIRST combo card as the cardKey (server uses it
        // for validation only — it doesn't matter which one we send).
        const anyComboKey = (myHand || []).find(isComboCard);
        const res = await roomsApi.playCard(roomId, {
          memberId: myId,
          cardKey: anyComboKey,
          comboKind: "FiveAny",
        });
        audio.playSfx?.("buttonClick");
        safeSetRoom(res.room);
        if (res?.requiresDiscardPick) {
          setPickModal({
            kind: "cardPick",
            purpose: "FiveAny",
            cardKey: anyComboKey,
            title: "Chọn 1 lá từ chồng bỏ",
            sub: "Các lá đã đánh (trùng nhau chỉ hiện 1 lần).",
            candidates: res.favorCandidates || [],
            fxColor: "#ffd86b",
            fxAccent: "#a4f2dc",
          });
          return;
        }
        if (res?.toast) toast?.info?.(res.toast);
        return;
      }

      // Case A: combo card → detect combo + flow
      if (isComboCard(card.key)) {
        const combo = detectComboFor(myHand, card.key);
        if (!combo) {
          toast?.error?.("Cần ít nhất 2 lá combo để dùng.");
          return;
        }
        if (combo === "FiveAny") {
          // 5-any: server returns the discard candidates on requiresDiscardPick.
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: card.key,
            comboKind: "FiveAny",
          });
          audio.playSfx?.("buttonClick");
          // BUG-FIX: combo cards immediately remove from hand. Apply the
          // authoritative snapshot so the player sees the combo cards
          // disappear immediately instead of waiting on SignalR.
          safeSetRoom(res.room);
          if (res?.requiresDiscardPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "FiveAny",
              cardKey: card.key,
              title: "Chọn 1 lá từ chồng bỏ",
              sub: "Các lá đã đánh (trùng nhau chỉ hiện 1 lần).",
              candidates: res.favorCandidates || [],
              fxColor: "#ffd86b",
              fxAccent: "#a4f2dc",
            });
            return;
          }
          if (res?.toast) toast?.info?.(res.toast);
          return;
        }
        // TwoSame or ThreeSame → need to pick target. Phase 1 already
        // removes the combo cards from our hand on the server side, so
        // apply the snapshot right away to shrink the player's hand
        // before the picker UI opens.
        const phase1Res = await roomsApi.playCard(roomId, {
          memberId: myId,
          cardKey: card.key,
          comboKind: combo,
        });
        safeSetRoom(phase1Res.room);
        setPickModal({
          kind: "playerPick",
          purpose: combo,
          cardKey: card.key,
          title: combo === "TwoSame" ? "Combo 2 — Chọn đối thủ" : "Combo 3 — Chọn đối thủ",
          sub: combo === "TwoSame"
            ? "Lấy 1 lá ngẫu nhiên từ tay đối thủ."
            : "Yêu cầu đối thủ đưa 1 lá chỉ định (nếu có).",
        });
        return;
      }

      // Case B: regular action card.
      const res = await roomsApi.playCard(roomId, {
        memberId: myId,
        cardKey: card.key,
      });
      audio.playSfx?.("buttonClick");

      if (res?.requiresTargetPick) {
        // Phase 1 for Favor → PlayerPickerModal. Must call safeSetRoom first
        // so room.myHand is populated before the modal reads it. Also update
        // the snapshot so players can see the hand counts changed.
        if (res.room) safeSetRoom(res.room);
        setActionModal({ card, awaitingTarget: true });
        return;
      }

      if (res?.requiresFavorPick) {
        // Phase 2 for Favor → CardPickModal. safeSetRoom first so room.myHand
        // is up-to-date when the modal reads it.
        if (res.room) safeSetRoom(res.room);
        setPickModal({
          kind: "cardPick",
          purpose: "Favor",
          cardKey: card.key,
          title: "Chọn 1 lá từ tay đối thủ",
          sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
          candidates: res.favorCandidates || [],
          fxColor: "#ffd86b",
          fxAccent: "#ffeaa3",
        });
        return;
      }

      if (res?.futurePeek && res.futurePeek.length > 0) {
        setFuturePeek(res.futurePeek);
        // BUG-FIX: action-card play without target-pick also updates server
        // state (hand shrinks, pendingAction opens, etc.). Apply the
        // authoritative snapshot BEFORE SignalR has a chance to broadcast,
        // so the player sees their hand shrink immediately instead of
        // waiting for the realtime channel. Without this the UI looks
        // "frozen" until the next 1.5s polling tick lands.
        if (res.room) safeSetRoom(res.room);
        if (res?.toast) toast?.info?.(res.toast);
        return;
      }

      // Apply the REST snapshot to the room — the server already removed
      // the played card from our hand and (for action cards) opened a
      // Nope window. The realtime broadcast might lag 50–1500ms (or get
      // dropped entirely during a brief reconnect), and the player is
      // staring at their hand expecting it to shrink. Trust the
      // authoritative REST response, then let SignalR overlay anything
      // newer on top via the polling fallback in useGameChannel.
      if (res?.room) safeSetRoom(res.room);
      // Pop the just-played card visually on top of the discard pile so the
      // other players can see what was just dropped.
      setRecentDiscards((prev) => {
        const next = [...prev, { key: card.key, by: myId, ts: Date.now() }];
        return next.length > 6 ? next.slice(next.length - 6) : next;
      });
      if (res?.toast) toast?.info?.(res.toast);
    } catch (e) {
      const code = e?.code;
      // On stale hand/turn, the server is the source of truth. Refresh the
      // snapshot so the local UI re-syncs with the actual game state. This
      // prevents users from repeatedly clicking the same card and getting
      // hammered with HTTP 400s.
      if (code === "card_not_in_hand" || code === "not_your_turn" || code === "action_pending") {
        try {
          const fresh = await roomsApi.snapshotWithViewer(roomId, myId);
          if (fresh) {
            safeSetRoom(fresh);
            // Reopen the modal using savedCardKey (actionModal is already null).
            if (savedCardKey) {
              const meta = getCardLabel(savedCardKey);
              setActionModal({ card: { key: savedCardKey, ...meta } });
            }
          }
        } catch (_) { /* swallow — toast below covers the UX */ }
      }
      toast?.error?.(e.message || "Không thể dùng lá bài.");
    }
    } finally {
      actionInFlightRef.current = false;
    }
  }, [audio, detectComboFor, emitFx, isComboCard, myHand, myId, room, roomId, toast]);

  // Player picker callback — handles BOTH combo (Two/Three) and Favor.
  const onPickPlayer = useCallback(
    async (targetId) => {
      const ctx = pickModal;
      if (!ctx) return;
      if (pickInFlightRef.current) return;
      pickInFlightRef.current = true;

      try {
        if (ctx.purpose === "TwoSame") {
          // Phase 1 returned the shuffled hand for the actor to pick from.
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: targetId,
            comboKind: "TwoSame",
          });
          audio.playSfx?.("buttonClick");
          safeSetRoom(res.room);
          if (res?.requiresFavorPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "TwoSame",
              cardKey: ctx.cardKey,
              title: "Combo 2 — Chọn 1 lá từ tay đối thủ",
              sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
              candidates: res.favorCandidates || [],
              fxColor: "#9a78ff",
              fxAccent: "#cdb9ff",
              targetId,
            });
            return;
          }
          if (res?.toast) toast?.info?.(res.toast);
          setPickModal(null);
          return;
        }
        if (ctx.purpose === "ThreeSame") {
          // Phase 1: ask server to validate target + return public card list.
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: targetId,
            comboKind: "ThreeSame",
          });
          audio.playSfx?.("buttonClick");
          safeSetRoom(res.room);
          if (res?.requiresDiscardPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "ThreeSame",
              cardKey: ctx.cardKey,
              title: "Combo 3 — Yêu cầu đối thủ đưa lá",
              sub: "Chọn 1 lá bất kỳ. Nếu đối thủ có lá này bạn sẽ nhận được, nếu không combo vô hiệu.",
              candidates: res.favorCandidates || [],
              fxColor: "#9a78ff",
              fxAccent: "#cdb9ff",
              targetId,
            });
            return;
          }
          if (res?.toast) toast?.info?.(res.toast);
          setPickModal(null);
          return;
        }
        // Favor phase 1 → server shuffles target hand + returns candidates.
        if (ctx.purpose === "Favor") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: targetId,
          });
          audio.playSfx?.("buttonClick");
          safeSetRoom(res.room);
          if (res?.requiresFavorPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "Favor",
              cardKey: ctx.cardKey,
              title: "Xin — chọn 1 lá từ tay đối thủ",
              sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
              candidates: res.favorCandidates || [],
              fxColor: "#ffd86b",
              fxAccent: "#ffeaa3",
              targetId,
            });
            return;
          }
          if (res?.toast) toast?.info?.(res.toast);
          setPickModal(null);
          return;
        }
      } catch (e) {
        toast?.error?.(e.message || "Thao tác thất bại.");
      } finally {
        pickInFlightRef.current = false;
      }
    },
    [audio, myId, pickModal, roomId, toast],
  );

  // Card pick callback — final phase (Favor / ThreeSame / FiveAny).
  const onPickCard = useCallback(
    async (key) => {
      const ctx = pickModal;
      if (!ctx) return;
      setPickModal(null);
      try {
        if (ctx.purpose === "TwoSame") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: ctx.targetId,
            comboKind: "TwoSame",
            discardPickKey: key,
          });
          audio.playSfx?.("buttonClick");
          safeSetRoom(res.room);
          if (res?.toast) toast?.info?.(res.toast);
          return;
        }
        if (ctx.purpose === "Favor") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: ctx.targetId,
            discardPickKey: key,
          });
          audio.playSfx?.("buttonClick");
          safeSetRoom(res.room);
          if (res?.toast) toast?.info?.(res.toast);
          return;
        }
        // NEW: Favor target-give flow. Caller is the TARGET member (not the
        // actor). The Favor card itself isn't in the target's hand — we use
        // "favor" as a cardKey with discardPickKey set, and memberId =
        // target (which is us). The server uses the
        // PendingFavorPick.TargetMemberId check to identify the action.
        // FavorGive: the target is giving a card to the Favor actor.
        // If PendingFavorPick was cleared (e.g. Nope resolved, or stale state),
        // we get "no_pending_favor" or "not_favor_target" — silently close the
        // modal instead of showing an ugly toast.
        if (ctx.purpose === "FavorGive") {
          try {
            const res = await roomsApi.playCard(roomId, {
              memberId: myId,
              cardKey: "favor",
              targetMemberId: ctx.initiatorId,
              discardPickKey: key,
            });
            audio.playSfx?.("buttonClick");
            safeSetRoom(res.room);
            if (res?.toast) toast?.info?.(res.toast);
          } catch (e) {
            // Gracefully handle: Favor was Nope'd / cleared before pick arrived.
            // Silent close — the snapshot update will reflect the resolved state.
            if (e?.code === "no_pending_favor" || e?.code === "not_favor_target") {
              setRoom((prev) => prev); // trigger re-render to sync state
              return;
            }
            toast?.error?.(e.message || "Thao tác thất bại.");
          }
          return;
        }
        if (ctx.purpose === "ThreeSame") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: ctx.targetId,
            comboKind: "ThreeSame",
            discardPickKey: key,
          });
          audio.playSfx?.("buttonClick");
          safeSetRoom(res.room);
          if (res?.toast) toast?.info?.(res.toast);
          return;
        }
        if (ctx.purpose === "FiveAny") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            comboKind: "FiveAny",
            discardPickKey: key,
          });
          audio.playSfx?.("buttonClick");
          safeSetRoom(res.room);
          if (res?.toast) toast?.info?.(res.toast);
          return;
        }
      } catch (e) {
        toast?.error?.(e.message || "Combo thất bại.");
      } finally {
        pickInFlightRef.current = false;
      }
    },
    [audio, myId, pickModal, roomId, toast],
  );

  // ── Concede / surrender ────────────────────────────────────────
  const onConcede = useCallback(
    async (confirmed) => {
      if (!confirmed) {
        setConcedeConfirm(true);
        return;
      }
      setConcedeConfirm(false);
      try {
        const res = await roomsApi.concede(roomId, myId);
        // After conceding the player is dead — navigate away immediately so
        // they don't see a dead ghost in the game UI.
        toast?.info?.(res?.toast || "Bạn đã đầu hàng.");
        navigate(ROUTES.landing, { replace: true });
      } catch (e) {
        toast?.error?.(e.message || "Không thể đầu hàng.");
        // Even on error, navigate away so the player isn't stuck on a dead screen.
        navigate(ROUTES.landing, { replace: true });
      }
    },
    [myId, navigate, roomId, toast],
  );

  // ── Draw card ──────────────────────────────────────────────
  // BUG-6 fix: close any open action modal if the turn changes away from us.
  // This prevents the stale-modal scenario where the user presses Confirm
  // after the turn has already advanced and gets a confusing error.
  useEffect(() => {
    if (isMyTurn) return;
    if (!actionModal && !pickModal) return;
    setActionModal(null);
    setSelectedCardIdx(null);
    setPickModal(null);
  }, [isMyTurn]);
  const onDrawCard = useCallback(async () => {
    if (!isMyTurn || !isAlive || gameEnded) return;
    if (drawInFlightRef.current) return;
    drawInFlightRef.current = true;
    setLocalDrawPending(true);
    audio.playSfx?.("buttonClick");

    // Capture source rect for animation.
    const srcRect = deckRef.current?.getBoundingClientRect?.();
    const tgtRect = handCenterRef.current?.getBoundingClientRect?.();
    if (srcRect && tgtRect) {
      setDrawAnim({ sourceRect: srcRect, targetRect: tgtRect, cardKey: "back", revealKey: null });
    }

    // Pre-fire a small sparkle on the deck to telegraph the action.
    emitFx("draw", srcRect, { size: "md", durationMs: 800 });

    try {
      const res = await roomsApi.drawCard(roomId, myId);
      safeSetRoom(res.room);
      // Reveal the drawn card by feeding revealKey to the animation, and
      // tag the card so HandArc knows which slot to animate-in.
      if (res?.drawnCardKey && res.drawnCardKey !== "bomb") {
        // Only update revealKey if an animation is already running. If the
        // stale-draw effect beat us to it, don't restart the animation with
        // a new object (that fires a second card-fly sequence).
        setDrawAnim((cur) => {
          if (!cur) return cur;
          return { ...cur, revealKey: res.drawnCardKey };
        });
        setLastDrawnKey(res.drawnCardKey);
        // Clear highlight after the animation finishes so it doesn't
        // persist across multiple draws.
        setTimeout(() => setLastDrawnKey(null), 1400);
      }
      // NOTE: bomb reveal animation is broadcast by server (BombRevealActive
      // flag in snapshot) — do NOT fire a local fx here or it will double-up.
      if (res?.requiresDefuse) {
        setDefuseModal(true);
        if (res?.toast) toast?.warning?.(res.toast);
      } else if (res?.requiresMoreDraws) {
        // Attack chain: server tells us how many cards remain to draw via
        // remainingDraws. We render the card visual we just drew (already
        // done above) and, if more draws are still needed, fire ONE more
        // draw animation immediately so the chain feels continuous rather
        // than having a 1.2s blank gap between draws.
        if (res?.toast) toast?.info?.(res.toast);

        // Schedule the next draw after the current card has finished flying.
        // We use a shorter delay (450ms) so back-to-back attack draws feel
        // snappy. We use res.room (authoritative) to check next state rather
        // than gsRef which may be stale from before safeSetRoom committed.
        // BUGFIX-2026-09-10: use camelCase properties — normalizeRestRoom
        // already converted the response to camelCase, so PascalCase lookups
        // return undefined and the attack chain would never auto-draw the
        // next card.
        setTimeout(() => {
          const nextGs = res.room?.gameState;
          if (!nextGs) return;
          const stillAlive = nextGs.alive?.[myId] !== false;
          const stillMyTurn = nextGs.currentTurnMemberId === myId;
          const stillAttacking = nextGs.pendingAction?.cardKey === "attack"
            && (nextGs.attackCounter ?? 0) > 0;
          if (stillAlive && stillMyTurn && stillAttacking) {
            onDrawCard();
          }
        }, 450);
      } else if (res?.toast) {
        if (res?.drawnCardKey === "bomb") {
          // Player died by drawing a bomb. The BombReveal → BombExplode
          // cinematic plays automatically via the server flag.
          toast?.error?.(res.toast);
        } else {
          toast?.info?.(res.toast);
        }
      }
    } catch (e) {
      // On error, try to refresh state from server to sync with actual game state
      try {
        const fresh = await roomsApi.snapshotWithViewer(roomId, myId);
        if (fresh) safeSetRoom(fresh);
      } catch (_) { /* ignore */ }
      toast?.error?.(e.message || "Không thể rút bài.");
    } finally {
      drawInFlightRef.current = false;
      setLocalDrawPending(false);
    }
  }, [audio, emitFx, gameEnded, isAlive, isMyTurn, myId, roomId, toast]);

  const onConfirmDefuse = useCallback(
    async (slotIndex) => {
      try {
        const res = await roomsApi.useDefuse(roomId, myId, slotIndex);
        audio.playSfx?.("cardDefuse");
        emitShake("sm", 350);
        emitFx("defuse", discardRef.current?.getBoundingClientRect?.(), { size: "lg", durationMs: 1500 });
        safeSetRoom(res.room);
        if (res?.toast) toast?.success?.(res.toast);
      } catch (e) {
        toast?.error?.(e.message || "Không thể cứu bom.");
      } finally {
        setDefuseModal(false);
      }
    },
    [audio, emitFx, emitShake, myId, roomId, toast],
  );

  // ── Nope chain ────────────────────────────────────────────
  // Last time we surfaced the "no Nope card" toast. We debounce so a player
  // who mashes the button only sees the message once per 1.5s — the user
  // asked for this so the UI doesn't spam toasts on every click.
  const lastNoNopeToastRef = useRef(0);
  // Guard: prevent picking while a server request is in-flight (double-click guard
  // for the inline Favor target picker and onPickPlayer).
  const pickInFlightRef = useRef(false);

  const onNope = useCallback(async () => {
    const hasNopeCard = (myHand || []).includes("nope");
    if (!hasNopeCard) {
      const now = Date.now();
      if (now - lastNoNopeToastRef.current > 1500) {
        lastNoNopeToastRef.current = now;
        toast?.error?.("Bạn không có lá Cản.");
      }
      return;
    }
    try {
      const res = await roomsApi.nope(roomId, myId);
      audio.playSfx?.("cardNope");
      emitFx("nope", discardRef.current?.getBoundingClientRect?.(), { size: "md", durationMs: 1200 });
      safeSetRoom(res.room);
      if (res?.toast) toast?.info?.(res.toast);
    } catch (e) {
      toast?.error?.(e.message || "Không thể cản.");
    }
  }, [audio, emitFx, myHand, myId, roomId, toast]);

  const pendingAction = gs?.pendingAction || null;
  const nopeRemaining = pendingAction
    ? Math.max(0, NOPE_WINDOW_MS - (now - new Date(pendingAction.createdAt).getTime()))
    : 0;
  const hasNopeCard = (myHand || []).includes("nope");
  // Window open = someone just played an action card; everyone can SEE the
  // 3s countdown. Only members with a Nope card in hand can actually play.
  // BUG-3 fix: initiator CANNOT nope their own action (server rejects "cannot_nope_self").
  const nopeWindowOpen =
    pendingAction &&
    pendingAction.initiatorId !== myId &&
    nopeRemaining > 0 &&
    !pendingAction.nopeChain.includes(myId);
  // True when this player can actually click "Cản!".
  const canChainNope = nopeWindowOpen && hasNopeCard;
  // True when the button is shown but disabled (no Nope card in hand).
  const nopeWindowButNoCard = nopeWindowOpen && !hasNopeCard;

  // Track the most recent played card on top of the discard pile. We push
  // whenever a new pendingAction appears (= someone just played a card). We
  // cap at 6 entries so the visual stack stays small and natural.
  // BUGFIX-2026-09-16: scan the FULL list (not just the last entry) when
  // deduping. The previous check `last.ts === createdAt` only matched when
  // the most recent push had the same timestamp. If a rapid re-mount fired
  // this effect a second time before React committed the first update, or
  // if two distinct snapshots both carried the same `lastPlayedAt` (which
  // happens during the ~50ms between two SignalR broadcasts of the same
  // action), the dedup would miss the duplicate and the discard pile would
  // show 5–10 stacked copies of the same card.
  useEffect(() => {
    const key = pendingAction?.cardKey;
    const createdAt = pendingAction?.createdAt;
    if (!key || !createdAt) return;
    setRecentDiscards((prev) => {
      // Scan for ANY existing entry that matches this action's timestamp.
      // Actions are unique per `createdAt`, so any match means the entry
      // was already pushed.
      if (prev.some((e) => e.ts === createdAt)) return prev;
      const next = [...prev, { key, by: pendingAction.initiatorId, ts: createdAt }];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
  }, [pendingAction?.cardKey, pendingAction?.createdAt]);

  // BUGFIX-2026-09-14: also track `lastPlayedCardKey` directly so we don't
  // depend solely on pendingAction (which is gone after the Nope window
  // expires). Pop the OLDEST entry off the stack and push the new one each
  // time `lastPlayedAt` changes — gives the discard pile a continuous
  // history even when the player plays several cards in a row without any
  // nope window flipping pendingAction back to null and a new one.
  // BUGFIX-2026-09-16: same as above — scan the full list to dedup, not
  // just the last entry. Multiple snapshots arriving in quick succession
  // can carry the same `(lastPlayedBy, lastPlayedAt)` pair (SignalR's
  // ~50ms broadcasts overlap with the polling-fallback tick).
  const lastPlayedStampRef = useRef(null);
  useEffect(() => {
    const key = gs?.lastPlayedCardKey;
    const at = gs?.lastPlayedAt;
    if (!key || !at) return;
    const stamp = `${gs.lastPlayedBy ?? ""}::${at}`;
    if (lastPlayedStampRef.current === stamp) return;
    lastPlayedStampRef.current = stamp;
    setRecentDiscards((prev) => {
      // Scan for ANY existing entry with this exact timestamp — actions are
      // unique per `lastPlayedAt`, so any match means we already pushed.
      if (prev.some((e) => e.ts === at)) return prev;
      const next = [...prev, { key, by: gs.lastPlayedBy, ts: at }];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
  }, [gs?.lastPlayedCardKey, gs?.lastPlayedAt, gs?.lastPlayedBy]);

// ── Bomb reveal detection ──────────────────────────────
// Whenever a snapshot arrives with `bombRevealActive=true` AND a fresh
// `lastDrawnAt`, fire the cinematic bomb overlay for everyone. We dedupe
// by (memberId, lastDrawnAt) so re-renders of the same snapshot don't
// re-trigger.
  useEffect(() => {
    if (!gs?.bombRevealActive || !gs?.lastDrawnAt || !gs?.lastDrawnBy) return;
    if (gs.lastDrawnCardKey !== "bomb") return;
    const stamp = `${gs.lastDrawnBy}::${gs.lastDrawnAt}`;
    if (lastDrawnRef.current === stamp) return;
    lastDrawnRef.current = stamp;

    const member = members.find((m) => m.id === gs.lastDrawnBy);
    const memberName = member?.name || "Bạn";
    // We can only PREDICT a defuse for the local viewer — other players'
    // hand CONTENTS are hidden behind the server, so we can't know whether
    // they hold a defuse. Default to "won't defuse" for opponents so the
    // cinematic stays suspenseful.
    const isLocal = gs.lastDrawnBy === myId;
    const stillAlive = gs.alive?.[gs.lastDrawnBy] !== false;
    // willDefuse: local player + still alive + has any defuse-class card
    // (base "defuse" OR any combo defuse variant: ninja/superman/zombie/robot/hải-tặc).
    const willDefuse = !!(
      isLocal &&
      stillAlive &&
      (myHand || []).some((c) => c === "defuse" || COMBO_KEYS.includes(c))
    );
    setBombReveal({
      memberId: gs.lastDrawnBy,
      memberName,
      willDefuse,
      // BUGFIX-2026-09-14: viewer = the local player who actually drew
      // the bomb. BombReveal shortens to 700ms (one rotation) and goes
      // straight to defuse position picker. Other viewers see full
      // 3000ms cinematic + explosion (if applicable).
      isViewer: isLocal,
      key: stamp,
    });

    // Hard timeout safety net so the overlay never gets stuck.
    const safety = setTimeout(() => setBombReveal(null), 4500);
    return () => clearTimeout(safety);
  }, [gs?.bombRevealActive, gs?.lastDrawnAt, gs?.lastDrawnBy, gs?.lastDrawnCardKey, gs?.alive, members, myId, myHand, room?.myHand]);

  // ── Auto-draw (turn timer expired) animation ────────────────
  // When the server broadcasts a draw that the local player did NOT trigger
  // (e.g. turn-clock expiry), the snapshot carries lastDrawnBy + lastDrawnAt
  // but our local user didn't call onDrawCard() so no animation was queued.
  // Detect "stale draw" = new stamp we haven't shown yet AND it's not our
  // own optimistic draw (we'd have already set drawAnim in onDrawCard).
  useEffect(() => {
    if (!gs?.lastDrawnAt || !gs?.lastDrawnBy || !gs?.lastDrawnCardKey) return;
    const stamp = `${gs.lastDrawnBy}::${gs.lastDrawnAt}`;
    if (lastDrawnRef.current === stamp) return;
    // BUG-5 fix: only skip if THIS PLAYER'S own draw is already being animated.
    // If an opponent drew, we should still trigger their flying-card animation.
    if (gs.lastDrawnBy === myId && drawAnim) return;
    // If it's a bomb, the BombReveal effect above handles it first.
    if (gs.bombRevealActive) return;
    if (gs.lastDrawnCardKey === "bomb") return;
    // GUARD: if drawAnim is already set (from an optimistic local draw in
    // onDrawCard), don't overwrite it — that would fire a SECOND animation on
    // top of the one already running and produce the "card flies twice" bug.
    if (drawAnim) return;
    lastDrawnRef.current = stamp;
    const srcRect = deckRef.current?.getBoundingClientRect?.() || null;
    // Target the correct recipient: their own seat, not always the local player's hand.
    const isMyDraw = gs.lastDrawnBy === myId;
    const tgtRect = isMyDraw
      ? (handCenterRef.current?.getBoundingClientRect?.() || null)
      : (seatRefs.current[gs.lastDrawnBy]?.getBoundingClientRect?.() || null);
    if (!srcRect || !tgtRect) return;
    setDrawAnim({
      sourceRect: srcRect,
      targetRect: tgtRect,
      cardKey: "back",
      revealKey: isMyDraw ? gs.lastDrawnCardKey : null, // Only reveal in drawer's own view
    });
    if (isMyDraw) {
      setLastDrawnKey(gs.lastDrawnCardKey);
      setTimeout(() => setLastDrawnKey(null), 1400);
    }
  }, [gs?.lastDrawnAt, gs?.lastDrawnBy, gs?.lastDrawnCardKey, gs?.bombRevealActive, myId]);

  // ── Direct snapshot fetch on mount: ensures the room is set immediately
  //    even if the SignalR hub handshake is slow / fails. This is the
  //    "fast path" for getting past the arc-loading spinner.
  //    Runs only ONCE (tracked by mountedRef) — not on every render.
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (!roomId || !myId || initialFetchDoneRef.current) return undefined;
    initialFetchDoneRef.current = true;
    let cancelled = false;
    const fetcher = async () => {
      try {
        const isTest = searchParams.get("test") === "1";
        // Always fetch from server FIRST so the player sees the authoritative
        // snapshot (with full member hands, currentTurnMemberId, etc.). The
        // sessionStorage cache from TestLobby was a race-avoidance shortcut
        // but it returned a payload without `myHand`, producing an empty
        // hand on first render and "my hand doesn't update" symptoms.
        //
        // The cache is kept only as a fallback for slow Render cold-starts:
        // if the server is unreachable for >10s we paint whatever we have.
        let data = null;
        try {
          data = isTest
            ? await roomsApi.snapshotTest(roomId)
            : await roomsApi.snapshotWithViewer(roomId, myId);
        } catch (_) {
          // Network failure — fall back to the cached payload so the player
          // at least sees the Lobby screen, the game UI never freezes on a
          // spinner indefinitely.
          if (isTest) {
            const cached = sessionStorage.getItem(`test_game_init_${roomId}`);
            if (cached) {
              try {
                data = JSON.parse(cached);
                sessionStorage.removeItem(`test_game_init_${roomId}`);
              } catch (_) { /* parse error — ignore */ }
            }
          }
        }

        if (cancelled) return;
        if (data && data.members) {
          // Use setRoom directly — the initialFetchDoneRef guard above already
          // guarantees this only fires once per mount. Using `setRoom((prev) => prev || data)`
          // was wrong: once prev is set (from the first call), subsequent calls with fresh
          // SignalR data were silently dropped, causing stale hands to persist.
          setRoom(data);
        }
      } catch (_) {
        // ignore — useGameChannel will keep polling.
      }
    };
    fetcher();
    return () => { cancelled = true; };
  }, [roomId, myId, searchParams]);

  // ── Render ────────────────────────────────────────────────
  // Surface a recoverable error UI after 5s so the player isn't stuck
  // on a spinner if the realtime channel failed to deliver a snapshot.
  const [snapshotError, setSnapshotError] = useState(null);
  const [manualRetrying, setManualRetrying] = useState(false);
  useEffect(() => {
    if (room) { setSnapshotError(null); return undefined; }
    const id = setTimeout(() => {
      if (!room) setSnapshotError("Mất kết nối với máy chủ.");
    }, 5000);
    return () => clearTimeout(id);
  }, [room, manualRetrying]);

  const retrySnapshot = useCallback(async () => {
    setManualRetrying(true);
    setSnapshotError(null);
    try {
      const testMode = Boolean(roomId && myId && searchParams.get("test") === "1");
      const data = testMode
        ? await roomsApi.snapshotTest(roomId)
        : await roomsApi.snapshotWithViewer(roomId, myId);
      if (data && data.members) safeSetRoom(data);
    } catch (e) {
      setSnapshotError(e?.message || "Không tải được ván.");
    } finally {
      setManualRetrying(false);
    }
  }, [roomId, myId, searchParams]);

  if (!room) {
    return (
      <main className="game-page">
        <GameBackdrop />
        <div className="arc-loading">
          <div className="arc-loading__spinner" />
          <span>Đang tải ván chơi…</span>
          {snapshotError && (
            <div className="arc-loading__error" role="alert">
              <span>{snapshotError}</span>
              <button
                type="button"
                className="game-action-btn game-action-btn--primary"
                onClick={retrySnapshot}
                disabled={manualRetrying}
              >
                {manualRetrying ? "Đang thử lại…" : "Thử lại"}
              </button>
              <button
                type="button"
                className="game-action-btn"
                onClick={() => navigate(ROUTES.landing, { replace: true })}
              >
                Về sảnh
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  const discardCount = gs?.discardCount ?? 0;

  // Elapsed match time, formatted as mm:ss in the top bar.
  const elapsedSec = (() => {
    if (!gs?.startedAt) return 0;
    const start = new Date(gs.startedAt).getTime();
    const end = gs.endedAt ? new Date(gs.endedAt).getTime() : Date.now();
    return Math.max(0, Math.round((end - start) / 1000));
  })();
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  // Turn timer — how many seconds the current player has left until the
  // Compute remaining time client-side using turnStartedAt (recomputes every
  // second via `now` state). The server's `turnRemainingSec` is just a
  // snapshot at fetch time — trusting it alone makes the UI freeze at 0s
  // the moment the timer hits zero, until the next 2.5s snapshot arrives.
  // Default to the unified 10s rule (mirrors GameService.TurnTimeLimitSeconds).
  const turnLimitSec = gs?.turnTimeLimitSec ?? TURN_TIME_LIMIT_SEC;
  const turnRemainingSec = (() => {
    if (gameEnded) return null;

    // Prefer client-side computation when turnStartedAt is available —
    // this gives smooth ticking between snapshots.
    if (gs?.turnStartedAt) {
      const start = new Date(gs.turnStartedAt).getTime();
      if (Number.isFinite(start)) {
        const remainingMs = turnLimitSec * 1000 - (now - start);
        const clientSec = remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 1000);
        // If the server snapshot is SMALLER than our local computation,
        // trust the server (it's closer to the source of truth). If our
        // local computation is smaller, trust that (clock skew / timer
        // already expired). The intent is to NEVER show a number LARGER
        // than the configured 10s budget — that's the bug that surfaced
        // as "54s" when an old/stale server snapshot leaked through.
        if (typeof gs?.turnRemainingSec === "number" && gs.turnRemainingSec > 0) {
          return Math.min(clientSec, gs.turnRemainingSec);
        }
        return clientSec;
      }
    }
    // No turnStartedAt — fall back to server value if any.
    if (typeof gs?.turnRemainingSec === "number") return gs.turnRemainingSec;
    return null;
  })();

  return (
    <>
    <main className="game-page">
      <GameBackdrop />

      <header className="game-header">
        <div>
          <h1 className="game-header__title">Sân chơi</h1>
          <span className="game-header__sub">
            Phòng: <code>{room.code}</code> · Tối đa {room.maxPlayers} người · {statusToText(room.status)}
          </span>
        </div>
        <span className="game-header__elapsed" aria-label="Thời gian">
          {mm}:{ss}
        </span>
        {turnRemainingSec !== null && (
          <span
            className={`game-header__turn-timer${turnRemainingSec <= 10 ? " game-header__turn-timer--urgent" : ""}`}
            aria-label="Thời gian lượt"
            title={`Còn ${turnRemainingSec}s trước khi hệ thống tự động rút bài`}
          >
            ⏱ {turnRemainingSec}s
          </span>
        )}
        <div className="game-header__actions">
          {!gameEnded && (
            <button
              type="button"
              className="game-action-btn game-action-btn--concede"
              onClick={() => onConcede(false)}
              title="Đầu hàng"
            >
              Đầu hàng
            </button>
          )}
        </div>
      </header>

      <section className="game-table">
        <div className="game-side game-side--left">
          {opponents.left.map((m) => (
            <Seat key={m.id} member={m} gs={gs} ref={(node) => { seatRefs.current[m.id] = node; }} />
          ))}
        </div>

        <div className="game-center">
          {/* Discard pile (top) */}
          <div ref={discardRef} className="discard-pile-wrap">
            <DiscardPile
              count={discardCount}
              recentKeys={recentDiscards.map((d) => d.key)}
              serverPile={room?.discardPile}
            />
          </div>

          {/* Deck pile */}
          <div
            ref={deckRef}
            className={`deck-pile ${isMyTurn && isAlive && !gameEnded && !futurePeek ? "deck-pile--clickable" : ""}`}
            onClick={isMyTurn && isAlive && !gameEnded && !futurePeek ? onDrawCard : undefined}
            title={isMyTurn ? "Bấm để rút bài" : undefined}
            role={isMyTurn ? "button" : undefined}
          >
            <div className="deck-stack">
              {[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((i) => (
                <span key={i} className="deck-stack__layer" style={{ "--i": i }} />
              ))}
              <span className="deck-stack__layer deck-stack__layer--top">
                <img src={CARD_CLOUDINARY.cards.back} alt="" draggable={false} />
                <span className="deck-stack__layer--badge">?</span>
              </span>
            </div>
            <div className="deck-pile__glow" aria-hidden="true" />
          </div>

          {/* Action buttons */}
          <div className="game-actions">
            {/* Attack chain hint — surfaces "Bạn phải rút N lá" before the
                first draw so players understand why they can't Skip / play a
                card without burning one of their forced draws. */}
            {isMyTurn && isAlive && !gameEnded && gs?.attackCounter > 0 && (
              <span className="game-modal__sub game-attack-hint" aria-live="polite">
                Bạn phải rút <strong>{gs.attackCounter}</strong> lá
              </span>
            )}
            {isMyTurn && isAlive && !gameEnded && !futurePeek && (
              <button
                type="button"
                className="game-action-btn game-action-btn--primary"
                onClick={onDrawCard}
                disabled={localDrawPending}
              >
                Rút bài
              </button>
            )}
            {(canChainNope || nopeWindowButNoCard) && (
              <button
                type="button"
                className={`game-action-btn game-action-btn--nope${canChainNope ? "" : " game-action-btn--nope-disabled"}`}
                onClick={canChainNope ? onNope : undefined}
                disabled={!canChainNope}
                aria-disabled={!canChainNope}
                title={canChainNope ? "Dùng lá Cản" : "Bạn không có lá Cản"}
              >
                {canChainNope ? "Cản!" : "Đợi cản"} ({(nopeRemaining / 1000).toFixed(1)}s)
              </button>
            )}
            {!isMyTurn && !pendingAction && (
              <span className="game-modal__sub">
                {topPlayer ? `Đang chờ ${topPlayer.name}…` : "Đang chờ..."}
              </span>
            )}
          </div>
        </div>

        <div className="game-side game-side--right">
          {opponents.right.map((m) => (
            <Seat key={m.id} member={m} gs={gs} ref={(node) => { seatRefs.current[m.id] = node; }} />
          ))}
        </div>
      </section>

      {/* YOU */}
      <section className={`game-you${isAlive ? "" : " game-you--dead"}`} ref={handCenterRef}>
        <div className="game-you__header">
          <span className="game-you__name">{myMember?.name || "Bạn"}</span>
          <span
            className={`game-you__status${isMyTurn ? " game-you__status--your-turn" : ""}${isAlive ? "" : " game-you__status--dead"}`}
          >
            {isAlive
              ? (isMyTurn ? "Lượt của bạn" : "Đợi")
              : "Đang quan sát"}
          </span>
        </div>
        {/* BUGFIX-2026-09-14: dead players no longer see their hand. The
            backend already removes the hand from the snapshot, but if a stale
            SignalR payload keeps showing it, the "isAlive" guard here hides
            it explicitly. The card-played animations on the discard pile
            (above) still run, so the observer can see what other players
            are doing. */}
        {isAlive ? (
          <HandArc
            hand={myHand}
            selectedIndex={selectedCardIdx}
            onSelectCard={onSelectHandCard}
            lastDrawnKey={lastDrawnKey}
          />
        ) : (
          <div className="game-you__observer">
            <div className="game-you__observer-glyph" aria-hidden="true">👁</div>
            <div className="game-you__observer-text">
              Bạn đã chết — quan sát các người chơi còn lại.
            </div>
            <div className="game-you__observer-hint">
              Hành động của họ vẫn hiện trên chồng bài.
            </div>
          </div>
        )}
      </section>

      {/* Modals */}
      {actionModal && !actionModal.awaitingTarget && (
        <CardActionModal
          card={actionModal.card}
          onClose={() => { setActionModal(null); setSelectedCardIdx(null); }}
          onConfirm={onConfirmAction}
        />
      )}
      {actionModal && actionModal.awaitingTarget && (
        <PlayerPickerModal
          title="Xin — chọn đối thủ"
          sub="Lấy 1 lá ngẫu nhiên từ tay đối thủ (hệ thống sẽ xáo). "
          opponents={members
            .filter((m) => m.id !== myId)
            .map((m) => ({ ...m, alive: gs?.alive?.[m.id] !== false, handCount: gs?.handCounts?.[m.id] || 0 }))}
          myId={myId}
          pickingForFavor={true}
          onPick={async (tid, opts) => {
            // BUG-1 fix: await API result before clearing modal.
            // If Nope cancels the action, the server will return a "no_pending_action"
            // error (or OK with no RequiresFavorPick). Either way, we capture
            // ctx before calling so we can reopen the correct modal on error.
            if (pickInFlightRef.current) return;
            pickInFlightRef.current = true;
            // BUG-NEW: capture cardKey before clearing modal so the playCard
            // payload below still has a valid value (actionModal is nulled
            // out below, so reading actionModal.card.key inside the closure
            // would throw "Cannot read properties of null").
            const savedCardKey = actionModal?.card?.key;
            // Favor target pre-flight: if the chosen opponent has 0 cards in
            // hand, surface a friendly toast in-place instead of posting to
            // the server (which would 400 with "target_empty"). Keeps the
            // modal open so the player can pick someone else.
            if (opts?.emptyTarget) {
              pickInFlightRef.current = false;
              const opp = members.find((m) => m.id === tid);
              toast?.warning?.(
                `${opp?.name || "Đối thủ"} đang không có lá bài nào trên tay — chọn người khác.`,
              );
              return;
            }
            setActionModal(null); // close the player picker
            try {
              const res = await roomsApi.playCard(roomId, {
                memberId: myId,
                cardKey: savedCardKey,
                targetMemberId: tid,
              });
              audio.playSfx?.("buttonClick");
              safeSetRoom(res.room);
              // RequiresFavorTargetPick: the target player must pick which of
              // their cards to give to the Favor actor. Open CardPickModal so
              // they can choose. (RequiresFavorPick is for combo discard-pick.)
              if (res?.requiresFavorTargetPick) {
                setPickModal({
                  kind: "cardPick",
                  purpose: "Favor",
                  cardKey: savedCardKey,
                  title: "Xin — chọn 1 lá để đưa",
                  sub: "Hệ thống đã xáo các lá trên tay — chọn 1 để đưa cho đối thủ.",
                  candidates: res.room?.gameState?.pendingFavorPick?.shuffledCandidates || [],
                  fxColor: "#ffd86b",
                  fxAccent: "#ffeaa3",
                  targetId: res.favorTargetId,
                });
              } else if (res?.toast) {
                toast?.info?.(res.toast);
              }
            } catch (e) {
              toast?.error?.(e.message || "Không thể dùng lá bài.");
            } finally {
              pickInFlightRef.current = false;
            }
          }}
          onCancel={async () => {
            // BUG-NEW: Favor phase 1 removed the card from the actor's hand
            // and queued a card-pick modal. If the user closes this picker
            // instead of choosing a target, server state holds the turn. We
            // call cancelPending to drop the pick + advance the turn so the
            // player isn't trapped mid-action.
            const savedCardKey = actionModal?.card?.key;
            setActionModal(null);
            setSelectedCardIdx(null);
            if (savedCardKey !== "favor") return;
            try {
              const res = await roomsApi.cancelPending(roomId, {
                memberId: myId,
                cardKey: savedCardKey,
                comboKind: "Favor",
              });
              if (res?.room) safeSetRoom(res.room);
              if (res?.toast) toast?.info?.(res.toast);
            } catch (_) {
              // Best-effort — toast below covers UX.
            }
          }}
        />
      )}
      {pickModal && pickModal.kind === "playerPick" && (
        <PlayerPickerModal
          title={pickModal.title}
          sub={pickModal.sub}
          opponents={members
            .filter((m) => m.id !== myId)
            .map((m) => ({ ...m, alive: gs?.alive?.[m.id] !== false, handCount: gs?.handCounts?.[m.id] || 0 }))}
          myId={myId}
          onPick={onPickPlayer}
          onCancel={async () => {
            // BUG-NEW: phase-1 combo (TwoSame / ThreeSame) opens this picker
            // but doesn't advance the turn. If the user closes the picker
            // without picking a target, the server still holds the turn for
            // them and the combo cards stay in their hand. Without this
            // handler the player has to play another card to "escape" —
            // confusing. Force-finish the combo so we always have a clean
            // state when the modal closes.
            const ctx = pickModal;
            const purpose = ctx?.purpose;
            setPickModal(null);
            if (purpose !== "TwoSame" && purpose !== "ThreeSame") return;
            try {
              const comboKind = purpose === "TwoSame" ? "TwoSame" : "ThreeSame";
              const cardKey = ctx?.cardKey;
              if (!cardKey) return;
              const res = await roomsApi.cancelPending(roomId, {
                memberId: myId,
                cardKey,
                comboKind,
              });
              if (res?.room) safeSetRoom(res.room);
              if (res?.toast) toast?.info?.(res.toast);
            } catch (e) {
              toast?.error?.(e?.message || "Không thể hủy combo.");
            }
          }}
        />
      )}
      {pickModal && pickModal.kind === "cardPick" && (
        <CardPickModal
          title={pickModal.title}
          sub={pickModal.sub}
          candidates={pickModal.candidates}
          fxColor={pickModal.fxColor}
          fxAccent={pickModal.fxAccent}
          onPick={onPickCard}
          onCancel={async () => {
            // BUG-NEW: card-pick modals for ThreeSame/FiveAny discard pick
            // and combo-favor card-pick rely on this returning a chosen
            // key. If the user closes without picking, the server has
            // consumed combo cards (or Favor) but the turn never advances.
            // Cancel-pending always costs the actor the spent cards but
            // gives them their turn back. Only fire for modal purposes
            // that really own the turn — TwoSame picks happen at the
            // player-pick modal which already handles cancel.
            const ctx = pickModal;
            const purpose = ctx?.purpose;
            setPickModal(null);
            if (!purpose) return;
            const comboPurpose = (
              purpose === "ThreeSame" || purpose === "FiveAny"
            );
            if (!comboPurpose && purpose !== "Favor") return;
            try {
              const comboKind = comboPurpose ? purpose : "Favor";
              const cardKey = ctx?.cardKey;
              if (!cardKey) return;
              const res = await roomsApi.cancelPending(roomId, {
                memberId: myId,
                cardKey,
                comboKind,
              });
              if (res?.room) safeSetRoom(res.room);
              if (res?.toast) toast?.info?.(res.toast);
            } catch (_) {
              // Best-effort.
            }
          }}
        />
      )}
      {defuseModal && (
        <DefuseModal
          onConfirm={onConfirmDefuse}
          onSkip={() => onConfirmDefuse(-1)}
        />
      )}
      {futurePeek && (
        <FuturePeekModal
          peek={futurePeek}
          onClose={() => {
            setFuturePeek(null);
            setFutureDismissedAt(Date.now());
          }}
          originRect={deckRef.current?.getBoundingClientRect?.() || null}
          turnRemainingSec={turnRemainingSec ?? TURN_TIME_LIMIT_SEC}
        />
      )}

      {/* Combo selection modal: shown when clicking a combo card to choose 2/3/5 */}
      {comboSelectModal && (
        <ComboSelectionModal
          cardKey={comboSelectModal.card.key}
          comboCounts={comboSelectModal.comboCounts}
          onSelect={onComboSelect}
          onCancel={() => setComboSelectModal(null)}
        />
      )}

      {/* AFK modal removed — see top of file. Every turn now runs against
          the unified 10s budget and the server auto-advances when the
          timer expires. */}

      {/* Concede confirm dialog */}
      {concedeConfirm && (
        <div className="game-modal__scrim concede-scrim">
          <div className="game-modal concede-modal">
            <div className="concede-modal__icon" aria-hidden="true">⚠️</div>
            <h3 className="concede-modal__title">Xác nhận đầu hàng?</h3>
            <p className="concede-modal__sub">
              Bạn sẽ bị loại khỏi ván chơi và trở về trang chính.
              <br />
              Hành động này <strong>không thể hoàn tác</strong>.
            </p>
            <div className="concede-modal__actions">
              <button
                type="button"
                className="game-action-btn"
                onClick={() => setConcedeConfirm(false)}
              >
                Huỷ
              </button>
              <button
                type="button"
                className="game-action-btn game-action-btn--danger"
                onClick={() => onConcede(true)}
              >
                Đầu hàng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The main ActionCardReveal component contains the card flip +
          halo. The turn timer's countdown lives in the header so we don't
          duplicate it here. */}

      {/* Draw animation */}
      {drawAnim && (
        <DrawAnimation
          sourceRect={drawAnim.sourceRect}
          targetRect={drawAnim.targetRect}
          cardKey={drawAnim.cardKey}
          revealKey={drawAnim.revealKey}
          onComplete={() => setDrawAnim(null)}
        />
      )}

      {/* Played-card animation — local card flying up to the table centre */}
      {playedAnim && (
        <PlayCardAnimation
          key={playedAnim.ts}
          cardKey={playedAnim.cardKey}
          sourceRect={playedAnim.sourceRect}
        />
      )}

      {/* Opponent drew a card — small "swoosh" indicator on their seat */}
      {opponentDrawAnim && (
        <div
          className="opponent-draw-toast"
          role="status"
          aria-live="polite"
          key={opponentDrawAnim.ts}
        >
          <span className="opponent-draw-toast__icon" aria-hidden="true">✦</span>
          <span>
            {members.find((m) => m.id === opponentDrawAnim.memberId)?.name || "Đối thủ"} vừa rút bài
          </span>
        </div>
      )}

      {/* Fx overlay queue — particle bursts for each gameplay event */}
      {fxQueue.map((f) => (
        <FxBurst
          key={f.id}
          anchor={f.anchor}
          fxKey={f.fxKey}
          size={f.size}
          id={f.id}
        />
      ))}

      {/* Screen shake for big-impact events (bomb defuse/detonate) */}
      <FxScreenShake active={!!shake} intensity={shake?.intensity || "md"} />

      {/* Bomb reveal — center card for 3s, everyone sees */}
      {bombReveal && (
        <BombReveal
          key={bombReveal.key}
          memberName={bombReveal.memberName}
          memberId={bombReveal.memberId}
          willDefuse={bombReveal.willDefuse}
          isViewer={bombReveal.isViewer}
          onComplete={() => {
            // If player couldn't defuse, queue the explosion overlay.
            // Skip the explosion overlay for the viewer — they go straight
            // to defuse (or, if no defuse, they get the death notice in
            // the GamePage). Other viewers still see the explosion.
            if (!bombReveal.willDefuse && !bombReveal.isViewer) {
              setBombExplode({
                memberName: bombReveal.memberName,
                key: `${bombReveal.key}-explode`,
              });
              emitShake("lg", 900);
            }
            setBombReveal(null);
          }}
        />
      )}

      {/* Bomb explode overlay — fires AFTER reveal when no defuse */}
      {bombExplode && (
        <BombExplode
          key={bombExplode.key}
          memberName={bombExplode.memberName}
          onComplete={() => setBombExplode(null)}
        />
      )}

      {/* Action-card centre reveal — shows played action card or latest
          Nope during the Nope window. Mounted/reset every time lastPlayedAt
          changes or chain length grows. Hides when pendingAction closes. */}
      {(() => {
        const cardKey = gs?.lastPlayedCardKey;
        const at = gs?.lastPlayedAt;
        // Guard against server blanks ("back"/null) leaking through. If the
        // server didn't actually surface a card key, skip the reveal entirely
        // — otherwise the reveal component falls back to its "back" image
        // and the user sees a face-down card during the 5s window.
        if (!cardKey || !at || cardKey === "back") return null;
        const chain = gs?.pendingAction?.nopeChain?.length || 0;
        const isNopeChain = !!gs?.lastPlayedByNope;
        const memberId = isNopeChain ? gs?.lastPlayedByNope : gs?.lastPlayedBy;
        const memberName = members.find((m) => m.id === memberId)?.name || "Bạn";
        // Nope remaining window (mirror server countdown)
        const remaining = nopeRemaining > 0 ? nopeRemaining : null;
        // Origin = top of deck pile so the flip animation springs from where
        // the card came from.
        const originRect = deckRef.current?.getBoundingClientRect?.() || null;
        return (
          <ActionCardReveal
            // The `key` MUST change whenever at/chain/cardKey changes so
            // React unmounts the old reveal and remounts the new one (the
            // inner timers only run on mount; subsequent prop changes are
            // ignored by the phase timer useEffect[]). Including `remaining`
            // would force a remount every second of the countdown — DON'T.
            key={`${at}::${chain}::${cardKey}`}
            cardKey={cardKey}
            byMemberName={memberName}
            isNopeChain={isNopeChain}
            chainCount={chain}
            nopeRemainingMs={remaining}
            originRect={originRect}
            onComplete={undefined}
          />
        );
      })()}

      {/* Summary */}
      {gameEnded && (
        <SummaryScreen
          room={room}
          gameState={gs}
          myId={myId}
          testMode={Boolean(searchParams.get("test") === "1")}
          onContinue={onContinueFromSummary}
          onStop={onStopFromSummary}
        />
      )}

      {/* Turn intro — "Bạn sẽ đi thứ X" — shown once when a new game starts. */}
      {turnIntro && !gameEnded && (
        <div className="turn-intro-overlay" role="dialog" aria-modal="true">
          <div className="turn-intro">
            <div className="turn-intro__label">Ván mới bắt đầu</div>
            <div className="turn-intro__order">
              Bạn sẽ đi <strong>thứ {turnIntro.order}</strong>
              <span className="turn-intro__total"> / {turnIntro.total}</span>
            </div>
            <button
              type="button"
              className="turn-intro__btn"
              onClick={() => setTurnIntro(null)}
              autoFocus
            >
              Sẵn sàng
            </button>
          </div>
        </div>
      )}
    </main>

    {/* Emergency exit button — always visible, never covered by overlays */}
    {searchParams.get("test") === "1" && (
      <ExitTestButton roomId={roomId} />
    )}
    </>
  );
}

// ── Discard pile visual ──────────────────────────────────
// Cinematic stack: mỗi lá vừa được đánh sẽ bounce-in với glow riêng theo
// loại card (attack → red, defuse → green, bomb → red danger, etc.). Stack
// xếp lệch tự nhiên như rơi trên mặt bàn.
function DiscardPile({ count, recentKeys, serverPile }) {
  // BUGFIX-2026-09-14: prefer the server's authoritative discard pile when
  // available (test endpoint exposes `room.discardPile` as the full list;
  // production strips it to a count only but the local `recentDiscards`
  // mirror still works there). Showing the actual server list ensures
  // cards played by OTHER players land on the discard pile from the first
  // play, even before our local `useEffect([pendingAction])` has had a
  // chance to fire — closing the gap where a freshly-played card appeared
  // as "missing" until the next nope window opened.
  const safeCount = count || 0;
  let list;
  if (Array.isArray(serverPile) && serverPile.length > 0) {
    list = serverPile.slice(-6);
  } else {
    list = (recentKeys || []).slice(-6);
  }
  return (
    <div
      className={`discard-pile${safeCount > 0 ? "" : " discard-pile--empty"}`}
      aria-label={`Chồng bỏ ${safeCount} lá`}
    >
      <div className="discard-pile__stack">
        {list.length === 0 && (
          <span className="discard-pile__placeholder">Chồng bỏ</span>
        )}
        {list.map((key, i) => (
          <span
            key={`${i}-${key}`}
            className={[
              "discard-pile__card",
              i === list.length - 1 ? "discard-pile__card--top" : "",
              `discard-pile__card--${key}`,
            ].join(" ")}
            style={{
              "--i": i,
              "--total": list.length,
              "--enter-delay": `${Math.max(0, (list.length - 1 - i) * 60)}ms`,
            }}
            title={key}
          >
            <img src={cardImageUrl(key)} alt={key} draggable={false} loading="lazy" />
            <span className="discard-pile__card-glow" aria-hidden="true" />
          </span>
        ))}
      </div>
      <span className="discard-pile__count">{safeCount}</span>
    </div>
  );
}
