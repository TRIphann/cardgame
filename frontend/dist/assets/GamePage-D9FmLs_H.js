import { r as reactExports, j as jsxRuntimeExports } from "./react-BhVOh7S1.js";
import { r as roomsApi, A as API_BASE_URL, C as CARD_CLOUDINARY, u as useSession, a as useToast, b as useAudio, R as ROUTES } from "./index-D9g_onCv.js";
import { H as HubConnectionBuilder, L as LogLevel } from "./vendor-DcE7maHo.js";
import { c as useParams, a as useNavigate } from "./router-DRJyKT9H.js";
import "./react-dom-HPixZcWd.js";
const FALLBACK_POLL_MS = 1500;
const HUB_RETRY_MS = 3e3;
function hubUrl() {
  const base = API_BASE_URL.replace(/\/+$/, "");
  return `${base}/hubs/game`;
}
function useGameChannel({ roomId, memberId, onUpdate, enabled }) {
  const [connected, setConnected] = reactExports.useState(false);
  const connRef = reactExports.useRef(null);
  const pollTimerRef = reactExports.useRef(null);
  const retryTimerRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!enabled || !roomId) return void 0;
    let disposed = false;
    const startPoll = () => {
      if (pollTimerRef.current) return;
      const tick = async () => {
        try {
          const data = await roomsApi.snapshotWithViewer(roomId, memberId);
          if (!disposed) onUpdate?.(data);
        } catch (_) {
        }
      };
      tick();
      pollTimerRef.current = setInterval(tick, FALLBACK_POLL_MS);
    };
    const stopPoll = () => {
      if (pollTimerRef.current) {
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
        const conn = new HubConnectionBuilder().withUrl(hubUrl()).withAutomaticReconnect([1e3, 2e3, 5e3, 1e4]).configureLogging(LogLevel.Warning).build();
        conn.on("room-updated", async () => {
          try {
            const data = await roomsApi.snapshotWithViewer(roomId, memberId);
            if (!disposed) onUpdate?.(data);
          } catch (_) {
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
          conn.invoke("JoinRoom", roomId, memberId).catch(() => {
          });
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
          connRef.current.invoke("LeaveRoom", roomId).catch(() => {
          });
        } catch (_) {
        }
        connRef.current.stop().catch(() => {
        });
        connRef.current = null;
      }
    };
  }, [enabled, roomId, memberId]);
  return { connected };
}
const FLOATING_GLYPHS = ["☀", "☾", "◉", "✦"];
function FloatingBackdrop() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "arc-ambient", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-one" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-two" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stars" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "cards-scene", children: FLOATING_GLYPHS.map((g, i) => {
      const positions = [
        { top: "8%", left: "10%" },
        { top: "20%", right: "12%" },
        { top: "70%", left: "6%" },
        { top: "80%", right: "8%" }
      ];
      const pos = positions[i] || {};
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "floating-card",
          style: { ...pos, animationDelay: `${i * 1.6}s` },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: g })
        },
        i
      );
    }) })
  ] });
}
function urlFor$2(key) {
  return CARD_CLOUDINARY.cards[key] || "";
}
const TOTAL_ROT = 28;
const MAX_LIFT = 18;
function slotTransform(index, total) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const rot = (t - 0.5) * TOTAL_ROT;
  const lift = Math.sin(t * Math.PI) * MAX_LIFT;
  const tx = (t - 0.5) * (total > 5 ? 130 : 110) * (total / 5);
  return {
    tx: `translateX(${tx.toFixed(1)}px)`,
    tr: `rotate(${-rot.toFixed(1)}deg)`,
    ty: `translateY(${-lift.toFixed(1)}px)`
  };
}
function HandArc({ hand, selectedIndex, onSelectCard }) {
  if (!hand || hand.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hand-arc hand-arc--empty", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { opacity: 0.4, fontSize: 14 }, children: "Không có lá nào" }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hand-arc", children: hand.map((key, idx) => {
    const { tx, tr, ty } = slotTransform(idx, hand.length);
    const selected = selectedIndex === idx;
    const styleVars = {
      left: `calc(50% + ${((idx - (hand.length - 1) / 2) * (hand.length > 5 ? 130 : 110) * (hand.length / 5)).toFixed(1)}px)`,
      "--arc-tx": tx,
      "--arc-tr": tr,
      "--arc-ty": ty,
      transform: `${tx} ${tr} ${ty}`,
      zIndex: 1 + idx
    };
    const url = urlFor$2(key);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: `hand-card${selected ? " hand-card--selected" : ""}`,
        style: styleVars,
        onClick: () => onSelectCard?.(idx, key),
        "aria-label": key,
        "data-card-key": key,
        children: url ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: url, alt: key, draggable: false }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 12, color: "#fff" }, children: key })
      },
      `${idx}-${key}`
    );
  }) });
}
function CardActionModal({ card, onClose, onConfirm, requiresTarget, opponents, onPickTarget }) {
  if (!card) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "game-modal__close", type: "button", onClick: onClose, "aria-label": "Đóng", children: "×" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "game-modal__title", children: [
      "Dùng lá: ",
      card.label || card.key
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: card.description || "Xác nhận để sử dụng." }),
    requiresTarget && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { fontSize: 12, opacity: 0.7 }, children: "Chọn đối thủ:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "combo-grid", children: (opponents || []).filter((o) => o.alive).map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "combo-card",
          style: { display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cinzel, serif" },
          onClick: () => onPickTarget(o.id),
          children: o.name
        },
        o.id
      )) })
    ] }),
    !requiresTarget && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal__actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onClose, children: "Huỷ" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn game-action-btn--primary", onClick: onConfirm, children: "Xác nhận" })
    ] })
  ] }) });
}
function urlFor$1(key) {
  return CARD_CLOUDINARY.cards[key] || "";
}
function ComboModal({ kind, targetName, handCards, discardPile, onPick, onCancel }) {
  if (kind === "TwoSame") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "game-modal__title", children: [
        "Lấy 1 lá từ ",
        targetName
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: "Mặt bài úp xuống. Bạn chọn 1, các lá còn lại quay về tay đối thủ." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "combo-grid", children: handCards.map((key, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "combo-card combo-card--face-down",
          onClick: () => onPick(key),
          "aria-label": `Lá ${i + 1}`,
          children: "?"
        },
        i
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onCancel, children: "Huỷ" }) })
    ] }) });
  }
  if (kind === "ThreeSame") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "game-modal__title", children: [
        "Chỉ định lá muốn lấy từ ",
        targetName
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: "Nếu đối thủ không có lá đó thì hành động không có tác dụng." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "combo-grid", children: handCards.map((key, i) => {
        const url = urlFor$1(key);
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "combo-card",
            onClick: () => onPick(key),
            children: url ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: url, alt: key }) : key
          },
          i
        );
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onCancel, children: "Bỏ qua" }) })
    ] }) });
  }
  if (kind === "FiveAny") {
    if (!discardPile || discardPile.length === 0) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "game-modal__title", children: "Chọn 1 lá từ chồng bỏ" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: "Chồng bỏ trống — không thể dùng combo 5-any." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onCancel, children: "Đóng" }) })
      ] }) });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "game-modal__title", children: "Chọn 1 lá từ chồng bỏ" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: "Lá bạn chọn sẽ về tay bạn." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "discard-picker", children: discardPile.map((key, i) => {
        const url = urlFor$1(key);
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "combo-card",
            onClick: () => onPick(key),
            children: url ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: url, alt: key }) : key
          },
          `${i}-${key}`
        );
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onCancel, children: "Bỏ qua" }) })
    ] }) });
  }
  return null;
}
const SLOTS = [0, 1, 2, 3, 4, 5];
function DefuseModal({ deckSize, onConfirm, onSkip }) {
  const maxSlot = Math.min(deckSize, 5);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "game-modal__title", children: "Cứu bom!" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: "Chọn vị trí đặt bom trở lại vào chồng bài (0 = trên cùng, 5 = sâu hơn)." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "defuse-slots", children: SLOTS.map((s) => {
      const usable = s <= maxSlot;
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `defuse-slot${usable ? "" : " defuse-slot--disabled"}`,
          disabled: !usable,
          onClick: usable ? () => onConfirm(s) : void 0,
          children: s
        },
        s
      );
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onSkip, children: "Đặt cuối" }) })
  ] }) });
}
function urlFor(key) {
  return CARD_CLOUDINARY.cards[key] || "";
}
const FLIGHT_MS = 700;
function DrawAnimation({ sourceRect, targetRect, cardKey, onComplete }) {
  const [mounted, setMounted] = reactExports.useState(true);
  reactExports.useEffect(() => {
    const id = setTimeout(() => {
      setMounted(false);
      onComplete?.();
    }, FLIGHT_MS);
    return () => clearTimeout(id);
  }, [onComplete]);
  if (!mounted || !sourceRect || !targetRect) return null;
  const url = urlFor(cardKey);
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  const style = {
    position: "fixed",
    left: 0,
    top: 0,
    width: 80,
    height: 116,
    transform: `translate(${startX - 40}px, ${startY - 58}px)`,
    transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.5, 0.0, 0.4, 1)`,
    zIndex: 200,
    pointerEvents: "none"
  };
  reactExports.useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = document.getElementById("draw-anim-node");
        if (node) {
          node.style.transform = `translate(${endX - 40}px, ${endY - 58}px) scale(0.6)`;
          node.style.opacity = "0";
        }
      });
    });
  }, [endX, endY]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { id: "draw-anim-node", className: "draw-anim", style, children: url ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: url, alt: cardKey, style: { width: "100%", height: "100%", borderRadius: 9 } }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "100%", height: "100%", background: "#1a1a4e", borderRadius: 9 } }) });
}
function formatElapsed(startedAt, endedAt, diedAt) {
  const startMs = startedAt ? new Date(startedAt).getTime() : null;
  if (!startMs) return "—";
  const endMs = endedAt ? new Date(endedAt).getTime() : diedAt ? new Date(diedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.round((endMs - startMs) / 1e3));
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function SummaryScreen({ room, gameState, myId, onContinue }) {
  const members = room.members || [];
  const playersSorted = [...members].sort((a, b) => {
    const aDead = !gameState.alive?.[a.id];
    const bDead = !gameState.alive?.[b.id];
    if (aDead !== bDead) return aDead ? 1 : -1;
    const aDied = gameState.diedAt?.[a.id] || 0;
    const bDied = gameState.diedAt?.[b.id] || 0;
    return new Date(aDied) - new Date(bDied);
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "summary-screen", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "summary-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "summary-card__title", children: "Kết thúc ván" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "summary-card__winner", children: gameState.winnerId ? `Người thắng: ${members.find((m) => m.id === gameState.winnerId)?.name || "?"}` : "Không có người thắng" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Hạng" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Người chơi" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Thời gian" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Số lượt" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { children: "Lá đã dùng" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: playersSorted.map((m, idx) => {
        const isWinner = gameState.winnerId === m.id;
        const isDead = !gameState.alive?.[m.id];
        const isYou = m.id === myId;
        const turns = gameState.turnsTaken?.[m.id] ?? 0;
        const played = gameState.cardsPlayed?.[m.id] ?? 0;
        const elapsed = formatElapsed(
          gameState.startedAt,
          isDead ? null : gameState.endedAt,
          gameState.diedAt?.[m.id]
        );
        const rankClass = isWinner ? "summary-card__rank--gold" : idx === 1 ? "summary-card__rank--silver" : idx === 2 ? "summary-card__rank--bronze" : "";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: isWinner ? "winner-row" : isDead ? "dead-row" : "", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `summary-card__rank ${rankClass}`, children: [
            "#",
            idx + 1
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { children: [
            m.name,
            isYou ? " (bạn)" : ""
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: elapsed }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: turns }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: played })
        ] }, m.id);
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", style: { justifyContent: "center", marginTop: 24 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn game-action-btn--primary", onClick: onContinue, children: "Về sảnh chờ" }) })
  ] }) });
}
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
  "hải-tặc": { label: "Hải tặc", description: "Combo 2/3 lá tuỳ số lượng." }
};
const NOPE_WINDOW_MS = 3e3;
function statusToText(s) {
  if (s === "playing") return "Đang chơi";
  if (s === "finished") return "Đã kết thúc";
  if (s === "waiting") return "Đợi";
  return s;
}
function getLocalPlayerId(session) {
  return session?.session?.playerId || readSessionRoomId()?.playerId || null;
}
function GamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const toast = useToast();
  const audio = useAudio();
  const myId = getLocalPlayerId(session);
  const [room, setRoom] = reactExports.useState(null);
  const [now, setNow] = reactExports.useState(Date.now());
  const [selectedCardIdx, setSelectedCardIdx] = reactExports.useState(null);
  const [actionModal, setActionModal] = reactExports.useState(null);
  const [pendingTarget, setPendingTarget] = reactExports.useState(null);
  const [comboModal, setComboModal] = reactExports.useState(null);
  const [defuseModal, setDefuseModal] = reactExports.useState(false);
  const [drawAnim, setDrawAnim] = reactExports.useState(null);
  const [localDrawPending, setLocalDrawPending] = reactExports.useState(false);
  const drawInFlightRef = reactExports.useRef(false);
  const deckRef = reactExports.useRef(null);
  const handCenterRef = reactExports.useRef(null);
  const rotatingRef = reactExports.useRef(false);
  const gs = room?.gameState || null;
  const members = room?.members || [];
  const myMember = members.find((m) => m.id === myId) || null;
  const myHand = room?.myHand || (gs && myId ? [] : []);
  const isMyTurn = gs && myId && gs.currentTurnMemberId === myId;
  const isAlive = !myMember || gs && gs.alive?.[myId] !== false;
  const gameEnded = gs && gs.endedAt;
  const opponents = reactExports.useMemo(() => {
    const alive = members.filter((m) => m.id !== myId);
    const left = [];
    const right = [];
    alive.forEach((m, i) => {
      if (i % 2 === 0) left.push(m);
      else right.push(m);
    });
    return { left, right };
  }, [members, myId]);
  const topPlayer = reactExports.useMemo(() => {
    if (!gs) return null;
    return members.find((m) => m.id === gs.currentTurnMemberId) || null;
  }, [members, gs]);
  useGameChannel({
    roomId,
    memberId: myId,
    enabled: Boolean(roomId && myId),
    onUpdate: (data) => {
      setRoom((prev) => data);
      if (data?.status === "waiting") {
        navigate(ROUTES.lobby, { replace: true });
      }
    }
  });
  reactExports.useEffect(() => {
    if (!roomId) return;
    const fromStorage = readSessionRoomId();
    if (!fromStorage && !session?.session?.roomId) {
      navigate(ROUTES.landing, { replace: true });
      return;
    }
  }, [roomId, session?.session?.roomId, navigate]);
  reactExports.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const onContinueFromSummary = reactExports.useCallback(async () => {
    if (!roomId) return;
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    try {
      if (session?.session?.isHost) {
        const res = await roomsApi.rotateRoom(roomId, session.session.playerId);
        const newRoomId = res?.room?.id;
        if (newRoomId) {
          const updatedSession = {
            ...session.session || {},
            roomId: newRoomId
          };
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
  const onSelectHandCard = reactExports.useCallback(
    (idx, key) => {
      if (!isMyTurn || !isAlive || gameEnded) return;
      setSelectedCardIdx(idx);
      const meta = CARD_LABELS[key] || { label: key };
      setActionModal({ card: { key, ...meta }, handIdx: idx });
    },
    [isMyTurn, isAlive, gameEnded]
  );
  const onConfirmAction = reactExports.useCallback(async () => {
    if (!actionModal) return;
    const card = actionModal.card;
    setActionModal(null);
    setSelectedCardIdx(null);
    try {
      const res = await roomsApi.playCard(roomId, {
        memberId: myId,
        cardKey: card.key
      });
      audio.playSfx?.("buttonClick");
      if (res?.RequiresTargetPick) {
        const target = res?.toast ? null : null;
        setActionModal({ card, awaitingTarget: true });
        return;
      }
      if (res?.RequiresDiscardPick) {
        const gs2 = res?.Room?.gameState;
        setComboModal({
          kind: "FiveAny",
          discardPile: gs2?.discardPile || []
        });
        return;
      }
      setRoom(res.Room);
      if (res?.Toast) toast?.info?.(res.Toast);
    } catch (e) {
      toast?.error?.(e.message || "Không thể dùng lá bài.");
    }
  }, [actionModal, audio, myId, roomId, toast]);
  const onPickTargetForAction = reactExports.useCallback(
    async (targetId) => {
      const card = actionModal?.card;
      if (!card) return;
      setActionModal(null);
      setSelectedCardIdx(null);
      try {
        const res = await roomsApi.playCard(roomId, {
          memberId: myId,
          cardKey: card.key,
          targetMemberId: targetId
        });
        audio.playSfx?.("buttonClick");
        if (res?.RequiresTargetPick) {
          const targetHand = res?.Room?.myHand ? null : null;
          setComboModal({
            kind: card.key,
            // combo card key same as the variant played
            targetId,
            targetName: members.find((m) => m.id === targetId)?.name || "?",
            handCards: null
            // server doesn't expose; for 3-same we need the list
          });
          return;
        }
        setRoom(res.Room);
        if (res?.Toast) toast?.info?.(res.Toast);
      } catch (e) {
        toast?.error?.(e.message || "Không thể dùng lá bài.");
      }
    },
    [actionModal, audio, members, myId, roomId, toast]
  );
  reactExports.useEffect(() => {
    if (!comboModal) return;
  }, [comboModal]);
  const onPickComboCard = reactExports.useCallback(
    async (key) => {
      const modal = comboModal;
      if (!modal) return;
      try {
        if (modal.kind === "FiveAny") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: "hải-tặc",
            // any combo card type
            comboKind: "FiveAny",
            discardPickKey: key
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
            discardPickKey: key
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
            discardPickKey: key
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
    [comboModal, audio, myId, roomId, toast]
  );
  const onDrawCard = reactExports.useCallback(async () => {
    if (!isMyTurn || !isAlive || gameEnded) return;
    if (drawInFlightRef.current) return;
    drawInFlightRef.current = true;
    setLocalDrawPending(true);
    audio.playSfx?.("buttonClick");
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
  const onConfirmDefuse = reactExports.useCallback(
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
    [audio, myId, roomId, toast]
  );
  const onNope = reactExports.useCallback(async () => {
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
  const nopeRemaining = pendingAction ? Math.max(0, NOPE_WINDOW_MS - (now - new Date(pendingAction.createdAt).getTime())) : 0;
  const canChainNope = pendingAction && nopeRemaining > 0 && !pendingAction.nopeChain.includes(myId) && myHand.includes("nope");
  if (!room) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "game-page", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingBackdrop, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "arc-loading", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "arc-loading__spinner" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Đang tải ván chơi…" })
      ] })
    ] });
  }
  const deckCount = gs?.deckCount ?? 0;
  const discardCount = gs?.discardCount ?? 0;
  const discardTop = null;
  const elapsedSec = (() => {
    if (!gs?.startedAt) return 0;
    const start = new Date(gs.startedAt).getTime();
    const end = gs.endedAt ? new Date(gs.endedAt).getTime() : Date.now();
    return Math.max(0, Math.round((end - start) / 1e3));
  })();
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "game-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingBackdrop, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "game-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "game-header__title", children: "Sân chơi" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "game-header__sub", children: [
          "Phòng: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: room.code }),
          " · Tối đa ",
          room.maxPlayers,
          " người · ",
          statusToText(room.status)
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "game-header__elapsed", "aria-label": "Thời gian", children: [
        mm,
        ":",
        ss
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "game-table", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-side game-side--left", children: opponents.left.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(Seat, { member: m, gs }, m.id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DiscardPile, { count: discardCount, top: discardTop }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            ref: deckRef,
            className: `deck-pile ${isMyTurn && isAlive && !gameEnded ? "deck-pile--clickable" : ""}`,
            onClick: isMyTurn && isAlive && !gameEnded ? onDrawCard : void 0,
            title: isMyTurn ? "Bấm để rút bài" : void 0,
            role: isMyTurn ? "button" : void 0,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "deck-stack", children: [
                [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((i) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": i } }, i)),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "deck-stack__layer deck-stack__layer--top", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: CARD_CLOUDINARY.cards.back, alt: "", draggable: false }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer--badge", children: deckCount })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "deck-pile__glow", "aria-hidden": "true" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-actions", children: [
          isMyTurn && isAlive && !gameEnded && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "game-action-btn game-action-btn--primary",
              onClick: onDrawCard,
              disabled: localDrawPending,
              children: "Rút bài"
            }
          ),
          canChainNope && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              className: "game-action-btn game-action-btn--nope",
              onClick: onNope,
              children: [
                "Cản! (",
                (nopeRemaining / 1e3).toFixed(1),
                "s)"
              ]
            }
          ),
          !isMyTurn && !pendingAction && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-modal__sub", children: topPlayer ? `Đang chờ ${topPlayer.name}…` : "Đang chờ..." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-side game-side--right", children: opponents.right.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(Seat, { member: m, gs }, m.id)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "game-you", ref: handCenterRef, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-you__header", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-you__name", children: myMember?.name || "Bạn" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: `game-you__status${isMyTurn ? " game-you__status--your-turn" : ""}`,
            children: isMyTurn ? "Lượt của bạn" : "Đợi"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        HandArc,
        {
          hand: myHand,
          selectedIndex: selectedCardIdx,
          onSelectCard: onSelectHandCard
        }
      )
    ] }),
    actionModal && !actionModal.awaitingTarget && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CardActionModal,
      {
        card: actionModal.card,
        onClose: () => {
          setActionModal(null);
          setSelectedCardIdx(null);
        },
        onConfirm: onConfirmAction
      }
    ),
    actionModal && actionModal.awaitingTarget && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CardActionModal,
      {
        card: actionModal.card,
        requiresTarget: true,
        opponents: members.filter((m) => m.id !== myId).map((m) => ({ ...m, alive: gs?.alive?.[m.id] !== false })),
        onClose: () => {
          setActionModal(null);
          setSelectedCardIdx(null);
        },
        onPickTarget: onPickTargetForAction
      }
    ),
    comboModal && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ComboModal,
      {
        kind: ["ninja", "superman", "zombie", "robot", "hải-tặc"].includes(comboModal.kind) ? "ThreeSame" : comboModal.kind,
        targetName: comboModal.targetName,
        handCards: comboModal.handCards || [],
        discardPile: comboModal.discardPile || [],
        onPick: onPickComboCard,
        onCancel: () => setComboModal(null)
      }
    ),
    defuseModal && /* @__PURE__ */ jsxRuntimeExports.jsx(
      DefuseModal,
      {
        deckSize: deckCount,
        onConfirm: onConfirmDefuse,
        onSkip: () => onConfirmDefuse(deckCount)
      }
    ),
    pendingAction && nopeRemaining > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "nope-react-toast", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "nope-react-toast__label", children: pendingAction.initiatorId === myId ? "Hành động của bạn" : "Hành động vừa xảy ra" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "nope-react-toast__timer", children: [
        (nopeRemaining / 1e3).toFixed(1),
        "s"
      ] })
    ] }),
    drawAnim && /* @__PURE__ */ jsxRuntimeExports.jsx(
      DrawAnimation,
      {
        sourceRect: drawAnim.sourceRect,
        targetRect: drawAnim.targetRect,
        cardKey: drawAnim.cardKey,
        onComplete: () => setDrawAnim(null)
      }
    ),
    gameEnded && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SummaryScreen,
      {
        room,
        gameState: gs,
        myId,
        onContinue: onContinueFromSummary
      }
    )
  ] });
}
function Seat({ member, gs }) {
  const isCurrent = gs?.currentTurnMemberId === member.id;
  const isAlive = gs ? gs.alive?.[member.id] !== false : true;
  const handCount = gs?.handCounts?.[member.id] ?? 0;
  const turns = gs?.turnsTaken?.[member.id] ?? 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: [
        "game-seat",
        isCurrent ? "game-seat--current" : "",
        !isAlive ? "game-seat--dead" : ""
      ].join(" ").trim(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-seat__avatar", "aria-hidden": "true", children: member.name?.[0]?.toUpperCase() || "?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-seat__info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-seat__name", children: member.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-seat__meta", children: [
            turns,
            " lượt"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-seat__handcount", children: [
            handCount,
            " lá trên tay"
          ] })
        ] })
      ]
    }
  );
}
function DiscardPile({ count }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `discard-pile${count > 0 ? "" : " discard-pile--empty"}`, "aria-label": `Chồng bỏ ${count} lá`, children: [
    count > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "Đã bỏ" }) }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "discard-pile__count", children: count })
  ] });
}
export {
  GamePage as default
};
