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
import { CARD_LABELS, getCardLabel } from "./cardLabels.js";
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

const NOPE_WINDOW_MS = 3000;

function statusToText(s) {
  if (s === "playing") return "Đang chơi";
  if (s === "finished") return "Đã kết thúc";
  if (s === "waiting") return "Đợi";
  return s;
}

function getLocalPlayerId(session) {
  return session?.session?.playerId || readSessionRoomId()?.playerId || null;
}

export default function GamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const toast = useToast();
  const audio = useAudio();

  const myId = getLocalPlayerId(session);

  // ── Core state ──────────────────────────────────────────────
  const [room, setRoom] = useState(null);
  const [now, setNow] = useState(Date.now());

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

  // ── Optimistic local state overlay (mirrors LobbyPage pattern) ──
  const [localDrawPending, setLocalDrawPending] = useState(false);
  const drawInFlightRef = useRef(false);

  // Refs to the deck & hand center for the draw animation source/target.
  const deckRef = useRef(null);
  const handCenterRef = useRef(null);
  const discardRef = useRef(null);

  // Track which playerId we've already rotated back to (avoid loops).
  const rotatingRef = useRef(false);

  // ── Helpers ────────────────────────────────────────────────
  const gs = room?.gameState || null;
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
  const opponents = useMemo(() => {
    const alive = members.filter((m) => m.id !== myId);
    const left = [];
    const right = [];
    alive.forEach((m, i) => {
      if (i % 2 === 0) left.push(m);
      else right.push(m);
    });
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
      setRoom((prev) => data);
      if (data?.status === "waiting") {
        navigate(ROUTES.lobby, { replace: true });
      }
    },
  });

  // Re-route the local player when they aren't in this room's members.
  useEffect(() => {
    if (!roomId) return;
    const fromStorage = readSessionRoomId();
    if (!fromStorage && !session?.session?.roomId) {
      navigate(ROUTES.landing, { replace: true });
      return;
    }
  }, [roomId, session?.session?.roomId, navigate]);

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
        setTimeout(() => setOpponentDrawAnim(null), 1100);
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
      if (session?.session?.isHost) {
        const res = await roomsApi.rotateRoom(roomId, session.session.playerId);
        const newRoomId = res?.room?.id;
        if (newRoomId) {
          // Update session to the new room id so the lobby sees it.
          const updatedSession = {
            ...(session.session || {}),
            roomId: newRoomId,
          };
          // Use the existing patch helper on the SessionContext.
          session.patch?.({ roomId: newRoomId });
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
    const card = actionModal.card;
    setActionModal(null);
    setSelectedCardIdx(null);

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
        // TwoSame or ThreeSame → need to pick target.
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
      toast?.error?.(e.message || "Không thể dùng lá bài.");
    }
  }, [actionModal, audio, detectComboFor, emitFx, isComboCard, myHand, myId, roomId, toast]);

  // Player picker callback — handles BOTH combo (Two/Three) and Favor.
  const onPickPlayer = useCallback(
    async (targetId) => {
      const ctx = pickModal;
      if (!ctx) return;
      setPickModal(null);

      try {
        if (ctx.purpose === "TwoSame") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: targetId,
            comboKind: "TwoSame",
          });
          audio.playSfx?.("buttonClick");
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
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
          return;
        }
      } catch (e) {
        toast?.error?.(e.message || "Thao tác thất bại.");
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
        toast?.info?.(res?.Toast || "Bạn đã đầu hàng.");
        navigate(ROUTES.landing, { replace: true });
      } catch (e) {
        toast?.error?.(e.message || "Không thể đầu hàng.");
      }
    },
    [myId, navigate, roomId, toast],
  );

  // ── Draw card ──────────────────────────────────────────────
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
      // Reveal the drawn card by feeding revealKey to the animation.
      if (res?.DrawnCardKey) {
        setDrawAnim((cur) => cur ? { ...cur, revealKey: res.DrawnCardKey } : cur);
      }
      // NOTE: bomb reveal animation is broadcast by server (BombRevealActive
      // flag in snapshot) — do NOT fire a local fx here or it will double-up.
      if (res?.RequiresDefuse) {
        setDefuseModal(true);
        if (res?.Toast) toast?.warning?.(res.Toast);
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
  const onNope = useCallback(async () => {
    try {
      const res = await roomsApi.nope(roomId, myId);
      audio.playSfx?.("cardNope");
      emitFx("nope", discardRef.current?.getBoundingClientRect?.(), { size: "md", durationMs: 1200 });
      setRoom(res.Room);
      if (res?.Toast) toast?.info?.(res.Toast);
    } catch (e) {
      toast?.error?.(e.message || "Không thể cản.");
    }
  }, [audio, emitFx, myId, roomId, toast]);

  const pendingAction = gs?.pendingAction || null;
  const nopeRemaining = pendingAction
    ? Math.max(0, NOPE_WINDOW_MS - (now - new Date(pendingAction.createdAt).getTime()))
    : 0;
  const canChainNope =
    pendingAction &&
    nopeRemaining > 0 &&
    !pendingAction.nopeChain.includes(myId) &&
    myHand.includes("nope");

  // Track the most recent played card on top of the discard pile. We push
  // whenever a new pendingAction appears (= someone just played a card). We
  // cap at 6 entries so the visual stack stays small and natural.
  useEffect(() => {
    const key = pendingAction?.cardKey;
    if (!key || key === "5-any") return;
    setRecentDiscards((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.key === key) return prev; // avoid double-render
      const next = [...prev, { key, by: pendingAction.initiatorId, ts: Date.now() }];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
  }, [pendingAction?.cardKey, pendingAction?.createdAt]);

  // ── Bomb reveal detection ──────────────────────────────
  // Whenever a snapshot arrives with `BombRevealActive=true` AND a fresh
  // `LastDrawnAt`, fire the cinematic bomb overlay for everyone. We dedupe
  // by (memberId, lastDrawnAt) so re-renders of the same snapshot don't
  // re-trigger.
  useEffect(() => {
    if (!gs?.BombRevealActive || !gs?.LastDrawnAt || !gs?.LastDrawnBy) return;
    if (gs.LastDrawnCardKey !== "bomb") return;
    const stamp = `${gs.LastDrawnBy}::${gs.LastDrawnAt}`;
    if (lastDrawnRef.current === stamp) return;
    lastDrawnRef.current = stamp;

    const member = members.find((m) => m.id === gs.LastDrawnBy);
    const memberName = member?.name || "Bạn";
    const willDefuse = gs.Alive?.get?.(gs.LastDrawnBy) !== false
      && (room?.myHand?.includes?.("defuse") || false);
    // For local viewer, peek at own hand to know if THEY can defuse.
    const canDefuseLocally = gs.LastDrawnBy === myId
      ? (myHand || []).some((c) => ["ninja", "superman", "zombie", "robot", "hải-tặc"].includes(c))
      : willDefuse;

    setBombReveal({
      memberId: gs.LastDrawnBy,
      memberName,
      willDefuse: canDefuseLocally,
      key: stamp,
    });

    // Hard timeout safety net so the overlay never gets stuck.
    const safety = setTimeout(() => setBombReveal(null), 4500);
    return () => clearTimeout(safety);
  }, [gs?.BombRevealActive, gs?.LastDrawnAt, gs?.LastDrawnBy, gs?.LastDrawnCardKey, gs?.Alive, members, myId, myHand, room?.myHand]);

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
  const lastDiscarded = null; // discard pile keys not exposed to client
  const discardTop = null;

  const elapsedSec = (() => {
    if (!gs?.startedAt) return 0;
    const start = new Date(gs.startedAt).getTime();
    const end = gs.endedAt ? new Date(gs.endedAt).getTime() : Date.now();
    return Math.max(0, Math.round((end - start) / 1000));
  })();
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

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
            {canChainNope && (
              <button
                type="button"
                className="game-action-btn game-action-btn--nope"
                onClick={onNope}
              >
                Cản! ({(nopeRemaining / 1000).toFixed(1)}s)
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
          onPick={async (tid) => {
            setActionModal(null);
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
        />
      )}

      {/* Concede confirm dialog */}
      {concedeConfirm && (
        <div className="game-modal__scrim concede-scrim">
          <div className="game-modal concede-modal">
            <h3 className="game-modal__title">Xác nhận đầu hàng</h3>
            <p className="game-modal__sub">
              Bạn sẽ bị loại khỏi ván chơi. Hành động này không thể hoàn tác.
            </p>
            <div className="game-modal__actions">
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

      {/* Nope countdown toast */}
      {pendingAction && nopeRemaining > 0 && (
        <div className="nope-react-toast">
          <span className="nope-react-toast__label">
            {pendingAction.initiatorId === myId ? "Hành động của bạn" : "Hành động vừa xảy ra"}
          </span>
          <span className="nope-react-toast__timer">{(nopeRemaining / 1000).toFixed(1)}s</span>
        </div>
      )}

      {/* Draw animation */}
      {drawAnim && (
        <DrawAnimation
          sourceRect={drawAnim.sourceRect}
          targetRect={drawAnim.targetRect}
          cardKey={drawAnim.cardKey}
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
          Nope during the 3s window. Mounted/reset every time LastPlayedAt
          changes or chain length grows. Hides when pendingAction closes. */}
      {(() => {
        const cardKey = gs?.LastPlayedCardKey;
        const at = gs?.LastPlayedAt;
        if (!cardKey || !at) return null;
        const chain = gs?.PendingAction?.NopeChain?.length || 0;
        const isNopeChain = !!gs?.LastPlayedByNope;
        const memberId = isNopeChain ? gs?.LastPlayedByNope : gs?.LastPlayedBy;
        const memberName = members.find((m) => m.id === memberId)?.name || "Bạn";
        // Nope remaining window (mirror server countdown)
        const remaining = nopeRemaining > 0 ? nopeRemaining : null;
        return (
          <ActionCardReveal
            key={`${at}::${chain}::${cardKey}`}
            cardKey={cardKey}
            byMemberName={memberName}
            isNopeChain={isNopeChain}
            chainCount={chain}
            nopeRemainingMs={remaining}
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
