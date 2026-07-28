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
import { CARD_CLOUDINARY } from "@games/exploding-cats/cardCloudinary.js";
import { FloatingBackdrop } from "./FloatingBackdrop.jsx";
import { HandArc } from "./HandArc.jsx";
import { CardActionModal } from "./CardActionModal.jsx";
import { ComboModal } from "./ComboModal.jsx";
import { DefuseModal } from "./DefuseModal.jsx";
import { DrawAnimation } from "./DrawAnimation.jsx";
import { SummaryScreen } from "./SummaryScreen.jsx";

function readSessionRoomId() {
  try {
    const raw = sessionStorage.getItem("arcana.session.v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

const CARD_LABELS = {
  bomb: { label: "Bom", description: "Lá cứu được dùng để vứt bom vào chồng bài." },
  defuse: { label: "Cứu", description: "Tự động kích hoạt khi rút trúng bom." },
  attack: { label: "Tấn công", description: "Đối phương phải chơi thêm 1 lượt, bạn không phải rút." },
  skip: { label: "Bỏ lượt", description: "Kết thúc lượt của bạn. Nếu đang chịu tấn công thì tiêu hao lượt đó." },
  favor: { label: "Xin", description: "Lấy 1 lá ngẫu nhiên từ 1 đối thủ." },
  future: { label: "Xem trước", description: "Xem 3 lá trên cùng chồng bài rồi úp xuống lại." },
  shuffle: { label: "Xáo bài", description: "Trộn lại chồng bài." },
  nope: { label: "Cản", description: "Huỷ hành động vừa được thực hiện trong 3 giây." },
  "ninja": { label: "Ninja", description: "Combo 2 lá: lấy 1 lá úp từ tay đối thủ." },
  "superman": { label: "Siêu nhân", description: "Combo 2/3 lá tuỳ số lượng." },
  "zombie": { label: "Xác sống", description: "Combo 2/3 lá tuỳ số lượng." },
  "robot": { label: "Robot", description: "Combo 2/3 lá tuỳ số lượng." },
  "hải-tặc": { label: "Hải tặc", description: "Combo 2/3 lá tuỳ số lượng." },
};

const NOPE_WINDOW_MS = 3000;

// Special handling: which cards need a target pick (server will validate).
const CARDS_REQUIRING_TARGET = new Set(["favor"]);

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
  const [actionModal, setActionModal] = useState(null); // { card }
  const [pendingTarget, setPendingTarget] = useState(null); // member id
  const [comboModal, setComboModal] = useState(null); // { kind, targetId, targetName, handCards, discardPile }
  const [defuseModal, setDefuseModal] = useState(false);
  const [drawAnim, setDrawAnim] = useState(null); // { sourceRect, targetRect, cardKey }

  // ── Optimistic local state overlay (mirrors LobbyPage pattern) ──
  const [localDrawPending, setLocalDrawPending] = useState(false);
  const drawInFlightRef = useRef(false);

  // Refs to the deck & hand center for the draw animation source/target.
  const deckRef = useRef(null);
  const handCenterRef = useRef(null);

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
  const onSelectHandCard = useCallback(
    (idx, key) => {
      if (!isMyTurn || !isAlive || gameEnded) return;
      setSelectedCardIdx(idx);
      const meta = CARD_LABELS[key] || { label: key };
      setActionModal({ card: { key, ...meta }, handIdx: idx });
    },
    [isMyTurn, isAlive, gameEnded],
  );

  const onConfirmAction = useCallback(async () => {
    if (!actionModal) return;
    const card = actionModal.card;
    setActionModal(null);
    setSelectedCardIdx(null);

    try {
      const res = await roomsApi.playCard(roomId, {
        memberId: myId,
        cardKey: card.key,
      });
      audio.playSfx?.("buttonClick");
      // If server says more input is required, open the right modal.
      if (res?.RequiresTargetPick) {
        const target = res?.toast ? null : null; // placeholder
        setActionModal({ card, awaitingTarget: true });
        return;
      }
      if (res?.RequiresDiscardPick) {
        // discardCardKey missing — surface combo modal in FiveAny mode.
        const gs2 = res?.Room?.gameState;
        setComboModal({
          kind: "FiveAny",
          discardPile: gs2?.discardPile || [],
        });
        return;
      }
      setRoom(res.Room);
      if (res?.Toast) toast?.info?.(res.Toast);
    } catch (e) {
      toast?.error?.(e.message || "Không thể dùng lá bài.");
    }
  }, [actionModal, audio, myId, roomId, toast]);

  const onPickTargetForAction = useCallback(
    async (targetId) => {
      const card = actionModal?.card;
      if (!card) return;
      setActionModal(null);
      setSelectedCardIdx(null);
      try {
        const res = await roomsApi.playCard(roomId, {
          memberId: myId,
          cardKey: card.key,
          targetMemberId: targetId,
        });
        audio.playSfx?.("buttonClick");
        // 2-same combo: server will ask for the specific card next.
        if (res?.RequiresTargetPick) {
          // Stay on card picking: opponent's hand cards via the combo modal.
          const targetHand = res?.Room?.myHand ? null : null; // server doesn't expose target hand by default
          // For 2-same and 3-same the server needs specific card selection.
          // We send another play-card with comboKind hint.
          setComboModal({
            kind: card.key, // combo card key same as the variant played
            targetId,
            targetName: members.find((m) => m.id === targetId)?.name || "?",
            handCards: null, // server doesn't expose; for 3-same we need the list
          });
          return;
        }
        setRoom(res.Room);
        if (res?.Toast) toast?.info?.(res.Toast);
      } catch (e) {
        toast?.error?.(e.message || "Không thể dùng lá bài.");
      }
    },
    [actionModal, audio, members, myId, roomId, toast],
  );

  // Refresh hand-targets via snapshot if combo modal needs server data
  useEffect(() => {
    if (!comboModal) return;
    // For 2-same/3-same we don't know target's hand. We have to just ask
    // the player to remember / use best-effort guess. To make this playable,
    // we refetch the room and trust the player picks by key name.
    // A future enhancement: server returns target's hand keys in private
    // view for the actor only.
  }, [comboModal]);

  const onPickComboCard = useCallback(
    async (key) => {
      const modal = comboModal;
      if (!modal) return;
      try {
        if (modal.kind === "FiveAny") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: "hải-tặc", // any combo card type
            comboKind: "FiveAny",
            discardPickKey: key,
          });
          audio.playSfx?.("buttonClick");
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
        } else if (modal.kind === "ThreeSame") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: modal.kind,
            targetMemberId: modal.targetId,
            comboKind: "ThreeSame",
            discardPickKey: key,
          });
          audio.playSfx?.("buttonClick");
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
        } else if (modal.kind === "TwoSame") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: modal.kind,
            targetMemberId: modal.targetId,
            comboKind: "TwoSame",
            discardPickKey: key,
          });
          audio.playSfx?.("buttonClick");
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
        }
        setComboModal(null);
      } catch (e) {
        toast?.error?.(e.message || "Combo thất bại.");
      }
    },
    [comboModal, audio, myId, roomId, toast],
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
      setDrawAnim({ sourceRect: srcRect, targetRect: tgtRect, cardKey: "back" });
    }

    try {
      const res = await roomsApi.drawCard(roomId, myId);
      setRoom(res.Room);
      if (res?.RequiresDefuse) {
        setDefuseModal(true);
        if (res?.Toast) toast?.warning?.(res.Toast);
      } else if (res?.Toast) {
        if (res?.DrawnCardKey === "bomb") {
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
  }, [audio, gameEnded, isAlive, isMyTurn, myId, roomId, toast]);

  const onConfirmDefuse = useCallback(
    async (slotIndex) => {
      try {
        const res = await roomsApi.useDefuse(roomId, myId, slotIndex);
        audio.playSfx?.("cardDefuse");
        setRoom(res.Room);
        if (res?.Toast) toast?.success?.(res.Toast);
      } catch (e) {
        toast?.error?.(e.message || "Không thể cứu bom.");
      } finally {
        setDefuseModal(false);
      }
    },
    [audio, myId, roomId, toast],
  );

  // ── Nope chain ────────────────────────────────────────────
  const onNope = useCallback(async () => {
    try {
      const res = await roomsApi.nope(roomId, myId);
      audio.playSfx?.("cardNope");
      setRoom(res.Room);
      if (res?.Toast) toast?.info?.(res.Toast);
    } catch (e) {
      toast?.error?.(e.message || "Không thể cản.");
    }
  }, [audio, myId, roomId, toast]);

  const pendingAction = gs?.pendingAction || null;
  const nopeRemaining = pendingAction
    ? Math.max(0, NOPE_WINDOW_MS - (now - new Date(pendingAction.createdAt).getTime()))
    : 0;
  const canChainNope =
    pendingAction &&
    nopeRemaining > 0 &&
    !pendingAction.nopeChain.includes(myId) &&
    myHand.includes("nope");

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

  const deckCount = gs?.deckCount ?? 0;
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
      </header>

      <section className="game-table">
        <div className="game-side game-side--left">
          {opponents.left.map((m) => (
            <Seat key={m.id} member={m} gs={gs} />
          ))}
        </div>

        <div className="game-center">
          {/* Discard pile (top) */}
          <DiscardPile count={discardCount} top={discardTop} />

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
                <span className="deck-stack__layer--badge">{deckCount}</span>
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
        <CardActionModal
          card={actionModal.card}
          requiresTarget
          opponents={members
            .filter((m) => m.id !== myId)
            .map((m) => ({ ...m, alive: gs?.alive?.[m.id] !== false }))}
          onClose={() => { setActionModal(null); setSelectedCardIdx(null); }}
          onPickTarget={onPickTargetForAction}
        />
      )}
      {comboModal && (
        <ComboModal
          kind={["ninja", "superman", "zombie", "robot", "hải-tặc"].includes(comboModal.kind) ? "ThreeSame" : comboModal.kind}
          targetName={comboModal.targetName}
          handCards={comboModal.handCards || []}
          discardPile={comboModal.discardPile || []}
          onPick={onPickComboCard}
          onCancel={() => setComboModal(null)}
        />
      )}
      {defuseModal && (
        <DefuseModal
          deckSize={deckCount}
          onConfirm={onConfirmDefuse}
          onSkip={() => onConfirmDefuse(deckCount)}
        />
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
function DiscardPile({ count }) {
  return (
    <div className={`discard-pile${count > 0 ? "" : " discard-pile--empty"}`} aria-label={`Chồng bỏ ${count} lá`}>
      {count > 0 ? (
        <>
          <span className="card-title">Đã bỏ</span>
        </>
      ) : null}
      <span className="discard-pile__count">{count}</span>
    </div>
  );
}
