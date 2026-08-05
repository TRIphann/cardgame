// GamePage — full Exploding Kittens match view.
// Layout:
//   - Top bar: room info + elapsed timer
//   - Sides: other players (max 3 per side, seated at edges)
//   - Center: deck pile (raised slightly), discard, active-card slot
//   - Bottom: YOU with hand arc + action buttons (Rút bài, Sẵn sàng)
// Sub-components: FloatingBackdrop, HandArc, modals (Card / Combo / Defuse),
// DrawAnimation overlay, SummaryScreen overlay.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "@config/env.js";
import { roomsApi } from "@shared/api/roomsApi.js";
import { useSession } from "../../app/session.jsx";
import { useAudio } from "@shared/audio/AudioManager.jsx";
import { useToast } from "@shared/ui/toast.jsx";
import { useGameChannel } from "@shared/realtime/useGameChannel.js";
import { CARD_CLOUDINARY, cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";
import { FloatingBackdrop } from "./FloatingBackdrop.jsx";
import { HandArc } from "./HandArc.jsx";
import { CardActionModal } from "./CardActionModal.jsx";
import { PlayerPickerModal } from "./PlayerPickerModal.jsx";
import { CardPickModal } from "./CardPickModal.jsx";
import { DefuseModal } from "./DefuseModal.jsx";
import { FuturePeekModal } from "./FuturePeekModal.jsx";
import { DrawAnimation } from "./DrawAnimation.jsx";
import { PlayCardAnimation } from "./PlayCardAnimation.jsx";
import { BombReveal, BombExplode } from "./BombReveal.jsx";
import { ActionCardReveal } from "./ActionCardReveal.jsx";
import { FxBurst } from "./FxBurst.jsx";
import { FxScreenShake } from "./FxScreenShake.jsx";
import { SummaryScreen } from "./SummaryScreen.jsx";
import "../styles/game.css";

// Combo card keys (server-side "defuse variants").
const COMBO_KEYS = ["ninja", "superman", "zombie", "robot", "hải-tặc"];
// Special handling: which cards need a target pick (server will validate).
const CARDS_REQUIRING_TARGET = new Set(["favor"]);

function readSessionRoomId() {
  try {
    const raw = sessionStorage.getItem("arcana.session.v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// Server (GameService.cs) uses a 5s window for the Nope chain. We mirror
// it client-side so the visible countdown matches the server's auto-resolve.
const NOPE_WINDOW_MS = 5000;

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
  const [now, setNow] = useState(Date.now());
  const gs = room?.gameState || null;

  // ── Selection / modal state ────────────────────────────────
  const [selectedCardIdx, setSelectedCardIdx] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { card, awaitingTarget? }
  // Generic "next step" modal — phases:
  //   { kind: "playerPick", card, purpose }  → PlayerPickerModal
  //   { kind: "cardPick", card, purpose, candidates, color, accent }
  const [pickModal, setPickModal] = useState(null);
  const [futurePeek, setFuturePeek] = useState(null); // [key1, key2, key3]
  const [defuseModal, setDefuseModal] = useState(false);
  const [concedeConfirm, setConcedeConfirm] = useState(false);
  const [drawAnim, setDrawAnim] = useState(null); // { sourceRect, targetRect, cardKey, viewer, revealKey }
  const [recentDiscards, setRecentDiscards] = useState([]); // [{ key, by }] — last played cards
  const [opponentDrawAnim, setOpponentDrawAnim] = useState(null); // { memberId, cardKey }
  const [playedAnim, setPlayedAnim] = useState(null); // card flying from hand to discard
  // Cinematic overlays queue. Mỗi entry { fxKey, anchor, size, durationMs }.
  // Cứ 1 entry bị pop ra → render FxBurst, sau đó auto-clean sau `durationMs`.
  const [fxQueue, setFxQueue] = useState([]);
  const [shake, setShake] = useState(null); // { intensity, until }
  const [turnHighlight, setTurnHighlight] = useState(null); // { memberId, key }
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

  // Track which playerId we've already rotated back to (avoid loops).
  const rotatingRef = useRef(false);

  // ── Helpers ────────────────────────────────────────────────
  const members = room?.members || [];
  const myMember = members.find((m) => m.id === myId) || null;
  const myHand = room?.myHand || (gs && myId ? [] : []); // server returns myHand
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
  // mutation. When the hub disconnects (cold start, network blip, etc.)
  // the hook auto-falls-back to a 1.5s polling loop so the UI never stalls.
  useGameChannel({
    roomId,
    memberId: myId,
    enabled: Boolean(roomId && myId),
    onUpdate: (data) => {
      // Functional update with deep dedupe: skip re-renders when the SignalR
      // snapshot is functionally identical to the current state. This prevents
      // unnecessary component refreshes after every server push and keeps the
      // turnIntro / modal state stable.
      setRoom((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
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
  });

  // Re-route the local player when they aren't in this room's members.
  useEffect(() => {
    if (!roomId) return;
    const fromStorage = readSessionRoomId();
    if (!fromStorage && !session?.roomId) {
      navigate(ROUTES.landing, { replace: true });
      return;
    }
  }, [roomId, session?.roomId, navigate]);

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

  // Tick the "now" clock once per second so elapsed timer moves + the nope
  // window countdown updates.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
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
  }, [roomId]);

  // When the server persists FuturePeek into GameState (after a Future card is
  // played), the SignalR snapshot will carry it back to us. If the modal isn't
  // open yet, auto-open it. If it's already open the state update is a no-op.
  // This survives re-connection: reconnecting players get the last peek result
  // from Firestore and can view it again without re-playing the card.
  useEffect(() => {
    if (!gs?.futurePeek || gs.futurePeek.length === 0) return;
    setFuturePeek(gs.futurePeek);
  }, [gs?.futurePeek]);

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
      return;
    }
    const orderKey = order.join(",");
    if (lastTurnOrderRef.current === orderKey) return;
    lastTurnOrderRef.current = orderKey;
    const myIdx = order.indexOf(myId);
    if (myIdx < 0) return;
    setTurnIntro({ order: myIdx + 1, total: order.length, memberId: myId });
  }, [gs?.turnOrder, myId, futurePeek]);

  // When game ends, navigate to summary screen state (kept inside this
  // component, not router change). We also rotate the room after the player
  // hits "Về sảnh chờ".
  const onContinueFromSummary = useCallback(async () => {
    if (!roomId) return;
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    try {
      // Rotate regardless of who presses continue — the server keeps the
      // host, but the API only allows host. If we're not the host, we'll
      // navigate to the existing room's lobby view as a guest.
      if (session?.isHost) {
        const res = await roomsApi.rotateRoom(roomId, session.playerId);
        const newRoomId = res?.room?.id;
        if (newRoomId) {
          // Update session to the new room id so the lobby sees it.
          const updatedSession = {
            ...(session || {}),
            roomId: newRoomId,
          };
          // Use the existing patch helper on the SessionContext.
          sessionCtx.patch?.({ roomId: newRoomId });
          navigate(ROUTES.lobby + "/" + newRoomId, { replace: true });
          return;
        }
      }
      navigate(ROUTES.landing, { replace: true });
    } catch (e) {
      toast?.error?.(e.message || "Không thể tạo ván mới.");
      navigate(ROUTES.landing, { replace: true });
    } finally {
      rotatingRef.current = false;
    }
  }, [roomId, session, navigate, toast]);

  // ── Card play flow ─────────────────────────────────────────
  // When user clicks a hand card, open the action modal.
  const onSelectHandCard = useCallback(
    (idx, key) => {
      if (!isMyTurn || !isAlive || gameEnded) return;
      setSelectedCardIdx(idx);
      const meta = getCardLabel(key);
      setActionModal({ card: { key, ...meta }, handIdx: idx });
    },
    [isMyTurn, isAlive, gameEnded],
  );

  // Helper to determine if a card is a combo defuse.
  const isComboCard = useCallback((k) => COMBO_KEYS.includes(k), []);

  // Helper: detect the highest combo the hand supports. Returns null / 'TwoSame' / 'ThreeSame' / 'FiveAny'.
  const detectComboFor = useCallback(
    (hand, cardKey) => {
      const comboCount = (hand || []).filter(isComboCard).length;
      if (comboCount >= 5) return "FiveAny";
      const sameCount = (hand || []).filter((c) => c === cardKey).length;
      if (sameCount >= 3) return "ThreeSame";
      if (sameCount >= 2) return "TwoSame";
      return null;
    },
    [isComboCard],
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
    const localHand = (room?.myHand && Array.isArray(room.myHand)) ? room.myHand : [];
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
      // Case A: combo card → detect combo + flow
      if (isComboCard(card.key)) {
        const combo = detectComboFor(myHand, card.key);
        if (!combo) {
          toast?.error?.("Cần ít nhất 2 lá combo để dùng.");
          return;
        }
        if (combo === "FiveAny") {
          // 5-any: server returns the discard candidates on RequiresDiscardPick.
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: card.key,
            comboKind: "FiveAny",
          });
          audio.playSfx?.("buttonClick");
          setRoom(res.Room);
          if (res?.RequiresDiscardPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "FiveAny",
              cardKey: card.key,
              title: "Chọn 1 lá từ chồng bỏ",
              sub: "Các lá đã đánh (trùng nhau chỉ hiện 1 lần).",
              candidates: res.FavorCandidates || [],
              fxColor: "#ffd86b",
              fxAccent: "#a4f2dc",
            });
            return;
          }
          if (res?.Toast) toast?.info?.(res.Toast);
          return;
        }
        // TwoSame or ThreeSame → need to pick target. Call setRoom first so the
        // hand shows the combo card removed before the picker opens.
        const res = await roomsApi.playCard(roomId, {
          memberId: myId,
          cardKey: card.key,
          comboKind: combo,
        });
        setRoom(res.Room);
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

      if (res?.RequiresTargetPick) {
        // Phase 1 for Favor → PlayerPickerModal
        setActionModal({ card, awaitingTarget: true });
        return;
      }

      if (res?.RequiresFavorPick) {
        // Phase 2 for Favor → CardPickModal
        setPickModal({
          kind: "cardPick",
          purpose: "Favor",
          cardKey: card.key,
          title: "Chọn 1 lá từ tay đối thủ",
          sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
          candidates: res.FavorCandidates || [],
          fxColor: "#ffd86b",
          fxAccent: "#ffeaa3",
        });
        setRoom(res.Room);
        return;
      }

      if (res?.FuturePeek && res.FuturePeek.length > 0) {
        setRoom(res.Room);
        setFuturePeek(res.FuturePeek);
        if (res?.Toast) toast?.info?.(res.Toast);
        return;
      }

      setRoom(res.Room);
      // Pop the just-played card visually on top of the discard pile so the
      // other players can see what was just dropped.
      setRecentDiscards((prev) => {
        const next = [...prev, { key: card.key, by: myId, ts: Date.now() }];
        return next.length > 6 ? next.slice(next.length - 6) : next;
      });
      if (res?.Toast) toast?.info?.(res.Toast);
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
            setRoom(fresh);
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
          setRoom(res.Room);
          if (res?.RequiresFavorPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "TwoSame",
              cardKey: ctx.cardKey,
              title: "Combo 2 — Chọn 1 lá từ tay đối thủ",
              sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
              candidates: res.FavorCandidates || [],
              fxColor: "#9a78ff",
              fxAccent: "#cdb9ff",
              targetId,
            });
            return;
          }
          if (res?.Toast) toast?.info?.(res.Toast);
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
          setRoom(res.Room);
          if (res?.RequiresDiscardPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "ThreeSame",
              cardKey: ctx.cardKey,
              title: "Combo 3 — Yêu cầu đối thủ đưa lá",
              sub: "Chọn 1 lá bất kỳ. Nếu đối thủ có lá này bạn sẽ nhận được, nếu không combo vô hiệu.",
              candidates: res.FavorCandidates || [],
              fxColor: "#9a78ff",
              fxAccent: "#cdb9ff",
              targetId,
            });
            return;
          }
          if (res?.Toast) toast?.info?.(res.Toast);
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
          setRoom(res.Room);
          if (res?.RequiresFavorPick) {
            setPickModal({
              kind: "cardPick",
              purpose: "Favor",
              cardKey: ctx.cardKey,
              title: "Xin — chọn 1 lá từ tay đối thủ",
              sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
              candidates: res.FavorCandidates || [],
              fxColor: "#ffd86b",
              fxAccent: "#ffeaa3",
              targetId,
            });
            return;
          }
          if (res?.Toast) toast?.info?.(res.Toast);
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
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
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
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
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
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
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
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
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
        toast?.info?.(res?.Toast || "Bạn đã đầu hàng.");
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
      setRoom(res.Room);
      // Reveal the drawn card by feeding revealKey to the animation, and
      // tag the card so HandArc knows which slot to animate-in.
      if (res?.DrawnCardKey && res.DrawnCardKey !== "bomb") {
        setDrawAnim((cur) => cur ? { ...cur, revealKey: res.DrawnCardKey } : cur);
        setLastDrawnKey(res.DrawnCardKey);
        // Clear highlight after the animation finishes so it doesn't
        // persist across multiple draws.
        setTimeout(() => setLastDrawnKey(null), 1400);
      }
      // NOTE: bomb reveal animation is broadcast by server (BombRevealActive
      // flag in snapshot) — do NOT fire a local fx here or it will double-up.
      if (res?.RequiresDefuse) {
        setDefuseModal(true);
        if (res?.Toast) toast?.warning?.(res.Toast);
      } else if (res?.RequiresMoreDraws) {
        // Attack chain: more draws required. Auto-prompt the user but also
        // offer a small delay so the UI doesn't feel like a firehose.
        // BUG-4 fix: read from gsRef (live) not the stale closure to check
        // whether the player is still alive and it's still their turn.
        if (res?.Toast) toast?.info?.(res.Toast);
        setTimeout(() => {
          const cur = gsRef.current;
          if (!cur) return;
          const stillAlive = cur.alive?.[myId] !== false;
          const stillMyTurn = cur.currentTurnMemberId === myId;
          const stillAttacking = (cur.pendingAction?.cardKey === "attack" ||
            cur.pendingAction?.cardKey === "attack-1" ||
            cur.pendingAction?.cardKey === "attack-2");
          if (stillAlive && stillMyTurn && stillAttacking) {
            onDrawCard();
          }
        }, 1200);
      } else if (res?.Toast) {
        if (res?.DrawnCardKey === "bomb") {
          // Player died by drawing a bomb. The BombReveal → BombExplode
          // cinematic plays automatically via the server flag.
          toast?.error?.(res.Toast);
        } else {
          toast?.info?.(res.Toast);
        }
      }
    } catch (e) {
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
        setRoom(res.Room);
        if (res?.Toast) toast?.success?.(res.Toast);
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
      setRoom(res.Room);
      if (res?.Toast) toast?.info?.(res.Toast);
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
  useEffect(() => {
    const key = pendingAction?.cardKey;
    const createdAt = pendingAction?.createdAt;
    if (!key || !createdAt) return;
    setRecentDiscards((prev) => {
      // Dedupe by createdAt — the same pendingAction often re-fires the
      // effect on snapshot refresh, but we only want one stack entry per
      // distinct action. Distinct actions with the same key still get added.
      const last = prev[prev.length - 1];
      if (last && last.ts === createdAt) return prev;
      const next = [...prev, { key, by: pendingAction.initiatorId, ts: createdAt }];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
  }, [pendingAction?.cardKey, pendingAction?.createdAt]);

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
    lastDrawnRef.current = stamp;
    if (drawAnim) return; // local optimistic draw in flight
    const srcRect = deckRef.current?.getBoundingClientRect?.() || null;
    const tgtRect = handCenterRef.current?.getBoundingClientRect?.() || null;
    if (!srcRect || !tgtRect) return;
    setDrawAnim({
      sourceRect: srcRect,
      targetRect: tgtRect,
      cardKey: "back",
      revealKey: gs.lastDrawnCardKey,
    });
    if (gs.lastDrawnBy === myId) {
      setLastDrawnKey(gs.lastDrawnCardKey);
      setTimeout(() => setLastDrawnKey(null), 1400);
    }
  }, [gs?.lastDrawnAt, gs?.lastDrawnBy, gs?.lastDrawnCardKey, gs?.bombRevealActive, myId, drawAnim]);

  // ── Render ────────────────────────────────────────────────
  if (!room) {
    return (
      <main className="game-page">
        <FloatingBackdrop />
        <div className="arc-loading">
          <div className="arc-loading__spinner" />
          <span>Đang tải ván chơi…</span>
        </div>
      </main>
    );
  }

  const deckCount = gs?.deckCount ?? null; // null = hidden from client
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
  // server auto-draws on their behalf. Use the server-provided value when
  // available (more accurate than client-side computation which can drift).
  // Fall back to client-side computation for real-time ticking between snapshots.
  const turnLimitSec = gs?.turnTimeLimitSec ?? 60;
  const turnRemainingSec = (() => {
    if (gameEnded) return null;
    // Prefer the server-computed value when present.
    if (typeof gs?.turnRemainingSec === "number" && gs.turnRemainingSec > 0) {
      return Math.min(gs.turnRemainingSec, turnLimitSec);
    }
    if (!gs?.turnStartedAt) return null;
    const start = new Date(gs.turnStartedAt).getTime();
    const remaining = turnLimitSec * 1000 - (now - start);
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 1000);
  })();

  return (
    <main className="game-page">
      <FloatingBackdrop />

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
            <Seat key={m.id} member={m} gs={gs} />
          ))}
        </div>

        <div className="game-center">
          {/* Discard pile (top) */}
          <div ref={discardRef} className="discard-pile-wrap">
            <DiscardPile count={discardCount} recentKeys={recentDiscards.map((d) => d.key)} />
          </div>

          {/* Deck pile */}
          <div
            ref={deckRef}
            className={`deck-pile ${isMyTurn && isAlive && !gameEnded ? "deck-pile--clickable" : ""}`}
            onClick={isMyTurn && isAlive && !gameEnded ? onDrawCard : undefined}
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
            {isMyTurn && isAlive && !gameEnded && (
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
            <Seat key={m.id} member={m} gs={gs} />
          ))}
        </div>
      </section>

      {/* YOU */}
      <section className="game-you" ref={handCenterRef}>
        <div className="game-you__header">
          <span className="game-you__name">{myMember?.name || "Bạn"}</span>
          <span
            className={`game-you__status${isMyTurn ? " game-you__status--your-turn" : ""}`}
          >
            {isMyTurn ? "Lượt của bạn" : "Đợi"}
          </span>
        </div>
        <HandArc
          hand={myHand}
          selectedIndex={selectedCardIdx}
          onSelectCard={onSelectHandCard}
          lastDrawnKey={lastDrawnKey}
        />
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
          onPick={async (tid) => {
            // BUG-1 fix: await API result before clearing modal.
            // If Nope cancels the action, the server will return a "no_pending_action"
            // error (or OK with no RequiresFavorPick). Either way, we capture
            // ctx before calling so we can reopen the correct modal on error.
            if (pickInFlightRef.current) return;
            pickInFlightRef.current = true;
            setActionModal(null); // close the player picker
            try {
              const res = await roomsApi.playCard(roomId, {
                memberId: myId,
                cardKey: actionModal.card.key,
                targetMemberId: tid,
              });
              audio.playSfx?.("buttonClick");
              setRoom(res.Room);
              if (res?.RequiresFavorPick) {
                setPickModal({
                  kind: "cardPick",
                  purpose: "Favor",
                  cardKey: actionModal.card.key,
                  title: "Xin — chọn 1 lá từ tay đối thủ",
                  sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
                  candidates: res.FavorCandidates || [],
                  fxColor: "#ffd86b",
                  fxAccent: "#ffeaa3",
                  targetId: tid,
                });
              } else if (res?.Toast) {
                toast?.info?.(res.Toast);
              }
            } catch (e) {
              toast?.error?.(e.message || "Không thể dùng lá bài.");
            } finally {
              pickInFlightRef.current = false;
            }
          }}
          onCancel={() => { setActionModal(null); setSelectedCardIdx(null); }}
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
          onCancel={() => setPickModal(null)}
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
          onCancel={() => setPickModal(null)}
        />
      )}
      {defuseModal && (
        <DefuseModal
          onConfirm={onConfirmDefuse}
          onSkip={() => onConfirmDefuse(5)}
        />
      )}
      {futurePeek && (
        <FuturePeekModal
          peek={futurePeek}
          onClose={() => setFuturePeek(null)}
          originRect={deckRef.current?.getBoundingClientRect?.() || null}
          turnRemainingSec={turnRemainingSec ?? 60}
        />
      )}

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

      {/* The main ActionCardReveal component already contains a large
          countdown ring + label. We intentionally do NOT also render a
          separate corner toast here — having both would feel like the
          countdown was "showing twice" to the user. The reveal itself
          is the source of truth for the 5s reaction window. */}

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
          onComplete={() => {
            // If player couldn't defuse, queue the explosion overlay.
            if (!bombReveal.willDefuse) {
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
          Nope during the 3s window. Mounted/reset every time lastPlayedAt
          changes or chain length grows. Hides when pendingAction closes. */}
      {(() => {
        const cardKey = gs?.lastPlayedCardKey;
        const at = gs?.lastPlayedAt;
        if (!cardKey || !at) return null;
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
          onContinue={onContinueFromSummary}
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
  );
}

// ── Seat (other player card) ──────────────────────────────
function Seat({ member, gs }) {
  const isCurrent = gs?.currentTurnMemberId === member.id;
  const isAlive = gs ? gs.alive?.[member.id] !== false : true;
  const handCount = gs?.handCounts?.[member.id] ?? 0;
  const turns = gs?.turnsTaken?.[member.id] ?? 0;
  return (
    <div
      className={[
        "game-seat",
        isCurrent ? "game-seat--current" : "",
        !isAlive ? "game-seat--dead" : "",
      ].join(" ").trim()}
    >
      <div className="game-seat__avatar" aria-hidden="true">
        {member.name?.[0]?.toUpperCase() || "?"}
      </div>
      <div className="game-seat__info">
        <div className="game-seat__name">{member.name}</div>
        <div className="game-seat__meta">{turns} lượt</div>
        <div className="game-seat__handcount">{handCount} lá trên tay</div>
      </div>
    </div>
  );
}

// ── Discard pile visual ──────────────────────────────────
// Cinematic stack: mỗi lá vừa được đánh sẽ bounce-in với glow riêng theo
// loại card (attack → red, defuse → green, bomb → red danger, etc.). Stack
// xếp lệch tự nhiên như rơi trên mặt bàn.
function DiscardPile({ count, recentKeys }) {
  const safeCount = count || 0;
  const list = (recentKeys || []).slice(-6);
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
