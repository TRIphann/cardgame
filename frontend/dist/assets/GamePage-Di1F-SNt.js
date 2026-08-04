import { r as reactExports, j as jsxRuntimeExports } from "./react-BhVOh7S1.js";
import { r as roomsApi, A as API_BASE_URL, c as cardImageUrl, u as useSession, a as useToast, b as useAudio, R as ROUTES, C as CARD_CLOUDINARY } from "./index-O6m1o26p.js";
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
      pollTimerRef.current = setTimeout(() => {
        if (disposed) return;
        tick();
        pollTimerRef.current = setInterval(tick, FALLBACK_POLL_MS);
      }, 400);
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
const CARD_LABELS = {
  bomb: {
    label: "Bom",
    description: "Nổ ngay khi bạn rút phải. Trừ khi bạn có lá Cứu để hóa giải."
  },
  defuse: {
    label: "Cứu (1 mệnh)",
    description: "Tự dùng để hóa giải bom. Đặt bom vào vị trí bất kỳ trong chồng bài."
  },
  attack: {
    label: "Tấn công",
    description: "Đối phương phải chơi thêm 1 lượt, bạn không phải rút bài."
  },
  skip: {
    label: "Bỏ lượt",
    description: "Kết thúc lượt của bạn. Nếu đang chịu tấn công thì tiêu hao lượt đó."
  },
  favor: {
    label: "Xin",
    description: "Lấy 1 lá ngẫu nhiên từ 1 đối thủ còn sống."
  },
  future: {
    label: "Xem trước",
    description: "Xem 3 lá trên cùng chồng bài rồi úp xuống lại theo đúng thứ tự."
  },
  shuffle: {
    label: "Xáo bài",
    description: "Trộn lại toàn bộ chồng bài."
  },
  nope: {
    label: "Cản",
    description: "Huỷ hành động vừa được thực hiện trong vòng 3 giây. Có thể nối nhiều Cản liên tiếp."
  },
  ninja: {
    label: "Ninja",
    description: "Combo 2 lá cùng tên: lấy 1 lá úp từ tay đối thủ (chọn lá cụ thể)."
  },
  superman: {
    label: "Siêu nhân",
    description: "Combo 2/3 lá cùng tên. 2 lá: lấy lá úp; 3 lá: yêu cầu đối thủ đưa lá chỉ định."
  },
  zombie: {
    label: "Xác sống",
    description: "Combo 2/3 lá cùng tên. 2 lá: lấy lá úp; 3 lá: yêu cầu đối thủ đưa lá chỉ định."
  },
  robot: {
    label: "Robot",
    description: "Combo 2/3 lá cùng tên. 2 lá: lấy lá úp; 3 lá: yêu cầu đối thủ đưa lá chỉ định."
  },
  "hải-tặc": {
    label: "Hải tặc",
    description: "Combo 2/3 lá cùng tên. 5 lá bất kỳ: lấy 1 lá từ chồng bỏ."
  },
  "hải tặc": {
    label: "Hải tặc",
    description: "Combo 2/3 lá cùng tên. 5 lá bất kỳ: lấy 1 lá từ chồng bỏ."
  }
};
function getCardLabel(key) {
  return CARD_LABELS[key] || { label: key || "?", description: "" };
}
const FLOATING_GLYPHS = ["☀", "☾", "◉", "✦"];
const DUST_COUNT = 22;
const ARC_COUNT = 4;
function FloatingBackdrop() {
  const dust = reactExports.useMemo(() => {
    return Array.from({ length: DUST_COUNT }).map((_, i) => ({
      i,
      left: Math.random() * 100,
      delay: Math.random() * 12,
      dur: 12 + Math.random() * 8,
      size: 1.5 + Math.random() * 3,
      hue: i % 3 === 0 ? "rgba(255, 215, 130, 0.85)" : i % 3 === 1 ? "rgba(154, 115, 255, 0.85)" : "rgba(122, 223, 255, 0.85)"
    }));
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "arc-ambient", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-one" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-two" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stars" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "arc-dust", "aria-hidden": "true", children: dust.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: "arc-dust__mote",
        style: {
          left: `${d.left}%`,
          width: `${d.size}px`,
          height: `${d.size}px`,
          background: d.hue,
          boxShadow: `0 0 12px ${d.hue}, 0 0 24px ${d.hue}`,
          animationDelay: `${d.delay}s`,
          animationDuration: `${d.dur}s`
        }
      },
      d.i
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "arc-sweep", "aria-hidden": "true", children: Array.from({ length: ARC_COUNT }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: "arc-sweep__line",
        style: {
          animationDelay: `${i * 1.6}s`,
          animationDuration: `${10 + i * 2}s`,
          top: `${15 + i * 18}%`
        }
      },
      i
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "cards-scene", children: FLOATING_GLYPHS.map((g, i) => {
      const positions = [
        { top: "8%", left: "10%" },
        { top: "20%", right: "12%" },
        { top: "70%", left: "6%" },
        { top: "80%", right: "8%" }
      ];
      const pos = positions[i] || {};
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "floating-card floating-card--fx",
          style: { ...pos, animationDelay: `${i * 1.6}s` },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: g }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "floating-card__trail", "aria-hidden": "true" })
          ]
        },
        i
      );
    }) })
  ] });
}
const BACK_URL = cardImageUrl("back");
function arcStep(total) {
  if (total <= 5) return 72;
  if (total <= 8) return 56;
  if (total <= 12) return 42;
  if (total <= 16) return 32;
  return 26;
}
function slotTransform(index, total) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const totalRot = Math.max(10, 32 - (total - 5) * 1.4);
  const rot = (t - 0.5) * totalRot;
  const lift = Math.sin(t * Math.PI) * Math.min(28, 38 / Math.sqrt(total));
  const step = arcStep(total);
  const tx = (t - 0.5) * step * (total - 1);
  return {
    tx: `translateX(${tx.toFixed(1)}px)`,
    tr: `rotate(${-rot.toFixed(1)}deg)`,
    ty: `translateY(${-lift.toFixed(1)}px)`
  };
}
function HandArc({ hand, selectedIndex, onSelectCard, lastDrawnKey }) {
  const [hoveredIdx, setHoveredIdx] = reactExports.useState(null);
  const total = hand?.length || 0;
  if (total === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hand-arc hand-arc--empty", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { opacity: 0.4, fontSize: 14 }, children: "Không có lá nào" }) });
  }
  const step = arcStep(total);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hand-arc", style: { "--hand-step": `${step}px` }, children: hand.map((key, idx) => {
    const { tx, tr, ty } = slotTransform(idx, total);
    const selected = selectedIndex === idx;
    const hovered = hoveredIdx === idx;
    const isFresh = !!lastDrawnKey && key === lastDrawnKey && !hand.slice(idx + 1).includes(lastDrawnKey);
    const offset = (idx - (total - 1) / 2) * step;
    const styleVars = {
      left: `calc(50% + ${offset.toFixed(1)}px)`,
      "--arc-tx": tx,
      "--arc-tr": tr,
      "--arc-ty": ty,
      "--hover-lift": hovered ? "translateY(-22px)" : ty,
      // NOTE: don't add `tx` here — the horizontal fan is already done
      // via `left`. Adding translateX(tx) on top doubled the spread and
      // pushed cards off-screen. Only the rotation + vertical lift come
      // from the transform.
      transform: hovered ? `${tr} ${ty} translateY(-22px) scale(1.06)` : `${tr} ${ty}`,
      zIndex: 10 + idx + (hovered ? 1e3 : 0)
    };
    const url = cardImageUrl(key);
    const meta = CARD_LABELS[key] || { label: key, description: "" };
    const tooltipId = `hand-card-tip-${idx}`;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        className: [
          "hand-card",
          selected ? "hand-card--selected" : "",
          hovered ? "hand-card--hovered" : "",
          isFresh ? "hand-card--fresh" : ""
        ].filter(Boolean).join(" "),
        style: styleVars,
        onClick: () => onSelectCard?.(idx, key),
        onMouseEnter: () => setHoveredIdx(idx),
        onMouseLeave: () => setHoveredIdx(null),
        onFocus: () => setHoveredIdx(idx),
        onBlur: () => setHoveredIdx(null),
        "aria-label": meta.label,
        "aria-describedby": tooltipId,
        "data-card-key": key,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: url || BACK_URL,
              alt: meta.label,
              draggable: false,
              loading: "lazy",
              onError: (e) => {
                if (e.currentTarget.src !== BACK_URL) e.currentTarget.src = BACK_URL;
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              id: tooltipId,
              role: "tooltip",
              className: `hand-card__tooltip${hovered ? " hand-card__tooltip--visible" : ""}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hand-card__tooltip-title", children: meta.label }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hand-card__tooltip-desc", children: meta.description })
              ]
            }
          )
        ]
      },
      `${idx}-${key}`
    );
  }) });
}
const CARD_FX = {
  attack: { glyph: "⚔", color: "#ff5247", accent: "#ff8a7a", particle: "✦", count: 10, ring: true },
  skip: { glyph: "⤳", color: "#7adfff", accent: "#9af3ff", particle: "✧", count: 8, ring: false },
  favor: { glyph: "✋", color: "#ffd86b", accent: "#ffeaa3", particle: "★", count: 10, ring: true },
  future: { glyph: "◉", color: "#9a78ff", accent: "#cdb9ff", particle: "✦", count: 6, ring: true },
  shuffle: { glyph: "🌀", color: "#5fdcb6", accent: "#a4f2dc", particle: "✧", count: 14, ring: true },
  nope: { glyph: "✕", color: "#ff4d6d", accent: "#ff8aa3", particle: "✕", count: 6, ring: true },
  bomb: { glyph: "💣", color: "#ff3030", accent: "#ff7474", particle: "✦", count: 22, ring: true },
  defuse: { glyph: "✚", color: "#5fe07e", accent: "#a4f4ba", particle: "✧", count: 12, ring: true },
  combo: { glyph: "✦", color: "#ffd86b", accent: "#a4f2dc", particle: "★", count: 14, ring: true },
  "5-any": { glyph: "🌟", color: "#9a78ff", accent: "#ffd86b", particle: "★", count: 16, ring: true },
  general: { glyph: "✦", color: "#ffd86b", accent: "#a4f2dc", particle: "✧", count: 8, ring: false },
  draw: { glyph: "✧", color: "#9af3ff", accent: "#7adfff", particle: "✧", count: 10, ring: false },
  back: { glyph: "✦", color: "#a98cff", accent: "#cdb9ff", particle: "✧", count: 6, ring: false }
};
function fxFor(key) {
  return CARD_FX[key] || CARD_FX.general;
}
function CardActionModal({
  card,
  onClose,
  onConfirm,
  requiresTarget,
  opponents,
  onPickTarget
}) {
  const fx = reactExports.useMemo(() => fxFor(card?.key || "general"), [card?.key]);
  if (!card) return null;
  const url = cardImageUrl(card.key);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal__scrim card-action-scrim", onClick: onClose, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "card-action-modal__backdrop",
        style: {
          "--fx-color": fx.color,
          "--fx-accent": fx.accent
        },
        "aria-hidden": "true"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `game-modal card-action-modal card-action-modal--${card.key}`,
        onClick: (e) => e.stopPropagation(),
        style: { "--fx-color": fx.color, "--fx-accent": fx.accent },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "game-modal__close", type: "button", onClick: onClose, "aria-label": "Đóng", children: "×" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-action-modal__layout", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-action-modal__art", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: url, alt: card.label || card.key, draggable: false }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-action-modal__art-glow", "aria-hidden": "true" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-action-modal__art-glyph", "aria-hidden": "true", children: fx.glyph })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-action-modal__body", children: [
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
            ] })
          ] })
        ]
      }
    )
  ] });
}
function PlayerPickerModal({
  title = "Chọn đối thủ",
  sub,
  opponents,
  myId,
  onPick,
  onCancel
}) {
  const list = (opponents || []).filter((o) => o.alive && o.id !== myId);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim player-pick-scrim", onClick: onCancel, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "game-modal player-pick-modal",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "game-modal__close",
            type: "button",
            onClick: onCancel,
            "aria-label": "Đóng",
            children: "×"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "game-modal__title", children: title }),
        sub && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: sub }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "player-pick-grid", children: [
          list.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", style: { textAlign: "center" }, children: "Không có đối thủ hợp lệ." }),
          list.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              className: "player-pick-card",
              onClick: () => onPick(o.id),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "player-pick-card__avatar", children: o.name?.[0]?.toUpperCase() || "?" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "player-pick-card__name", children: o.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "player-pick-card__meta", children: [
                  o.handCount || 0,
                  " lá"
                ] })
              ]
            },
            o.id
          ))
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onCancel, children: "Huỷ" }) })
      ]
    }
  ) });
}
function CardPickModal({
  title,
  sub,
  candidates,
  onPick,
  onCancel,
  fxColor = "#ffd86b",
  fxAccent = "#a4f2dc"
}) {
  if (!candidates) return null;
  const list = Array.from(new Set(candidates));
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim card-pick-scrim", onClick: onCancel, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "game-modal card-pick-modal",
      onClick: (e) => e.stopPropagation(),
      style: { "--fx-color": fxColor, "--fx-accent": fxAccent },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "game-modal__close",
            type: "button",
            onClick: onCancel,
            "aria-label": "Đóng",
            children: "×"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "game-modal__title", children: title || "Chọn 1 lá" }),
        sub && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: sub }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-pick-grid", children: [
          list.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", style: { textAlign: "center" }, children: "Không có lá nào khả dụng." }),
          list.map((key) => {
            const meta = getCardLabel(key);
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                className: `card-pick-card card-pick-card--${key}`,
                onClick: () => onPick(key),
                title: meta.label,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl(key), alt: meta.label, draggable: false }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-pick-card__glow", "aria-hidden": "true" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-pick-card__name", children: meta.label })
                ]
              },
              key
            );
          })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onCancel, children: "Huỷ" }) })
      ]
    }
  ) });
}
const PARTICLE_COUNT = 20;
function seedAngle(i, n) {
  return i / n * Math.PI * 2 + Math.sin(i * 11.3) * 0.18;
}
function seedDistance(i) {
  return 80 + Math.sin(i * 7.7) * 30;
}
function seedSize(i) {
  return 7 + Math.sin(i * 3.1) * 3;
}
function FxBurst({ anchor, fxKey = "general", size = "md", id = "burst" }) {
  const fx = fxFor(fxKey);
  const count = Math.min(PARTICLE_COUNT, fx.count || 14);
  const variant = fxKey;
  const seeds = reactExports.useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i += 1) {
      arr.push({
        i,
        angle: seedAngle(i, count),
        dist: seedDistance(i),
        size: seedSize(i),
        delay: Math.random() * 80,
        dur: 800 + Math.random() * 320,
        glyph: i % 3 === 0 ? fx.glyph : fx.particle
      });
    }
    return arr;
  }, [count, fx]);
  if (!anchor) return null;
  const cx = "left" in anchor ? anchor.left + anchor.width / 2 : anchor.x;
  const cy = "top" in anchor ? anchor.top + anchor.height / 2 : anchor.y;
  const scale = size === "lg" ? 1.7 : size === "sm" ? 0.6 : 1;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `fx-burst fx-burst--${variant}`,
      style: {
        position: "fixed",
        left: cx,
        top: cy,
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 220
      },
      "data-burst-id": id,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "fx-burst__flash",
            style: {
              background: `radial-gradient(circle, ${fx.color} 0%, ${fx.accent} 50%, transparent 80%)`
            }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "fx-burst__glyph",
            style: {
              color: fx.accent,
              textShadow: `0 0 22px ${fx.color}, 0 0 44px ${fx.color}`
            },
            children: fx.glyph
          }
        ),
        fx.ring && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "fx-burst__ring",
              style: {
                borderColor: fx.color,
                boxShadow: `0 0 36px ${fx.color}, inset 0 0 24px ${fx.color}40`
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "fx-burst__ring fx-burst__ring--delay",
              style: {
                borderColor: fx.accent,
                boxShadow: `0 0 28px ${fx.accent}`
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "fx-burst__ring fx-burst__ring--late",
              style: {
                borderColor: fx.color,
                boxShadow: `0 0 24px ${fx.color}`
              }
            }
          )
        ] }),
        fxKey === "attack" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "fx-burst__beam fx-burst__beam--h", style: { background: fx.color } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "fx-burst__beam fx-burst__beam--v", style: { background: fx.accent } })
        ] }),
        seeds.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "fx-burst__particle",
            style: {
              color: p.i % 2 === 0 ? fx.color : fx.accent,
              textShadow: `0 0 14px ${fx.color}, 0 0 26px ${fx.accent}`,
              fontSize: `${p.size * 4 * scale}px`,
              "--ang": `${p.angle}rad`,
              "--dist": `${p.dist * scale}px`,
              "--delay": `${p.delay}ms`,
              "--dur": `${p.dur}ms`
            },
            children: p.glyph
          },
          p.i
        )),
        Array.from({ length: 4 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "fx-burst__streak",
            style: {
              "--ang": `${i / 4 * Math.PI * 2 + 0.4}rad`,
              "--dist": `${120 * scale}px`,
              background: i % 2 === 0 ? fx.color : fx.accent
            }
          },
          `streak-${i}`
        ))
      ]
    }
  );
}
const SLOTS = [
  { idx: 0, label: "Đỉnh", sub: "Rút tiếp", tint: "#ff8a7a" },
  { idx: 1, label: "", sub: "+1", tint: "#ff8a4a" },
  { idx: 2, label: "", sub: "+2", tint: "#ffaa5a" },
  { idx: 3, label: "", sub: "+3", tint: "#ffce7a" },
  { idx: 4, label: "", sub: "+4", tint: "#ffd86b" },
  { idx: 5, label: "Đáy", sub: "Sâu nhất", tint: "#ffeaa3" }
];
function DefuseModal({ onConfirm, onSkip }) {
  const [tickKey, setTickKey] = reactExports.useState(0);
  const [selectedSlot, setSelectedSlot] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const id = setInterval(() => setTickKey((k) => k + 1), 1400);
    return () => clearInterval(id);
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal__scrim defuse-scrim", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "defuse-scrim__danger", "aria-hidden": "true" }),
    [0, 1].map((corner) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      FxBurst,
      {
        anchor: corner === 0 ? { x: window.innerWidth / 2 - 240, y: window.innerHeight / 2 - 140 } : { x: window.innerWidth / 2 + 240, y: window.innerHeight / 2 + 140 },
        fxKey: "bomb",
        size: "md",
        id: `defuse-tick-${corner}`
      },
      `${corner}-${tickKey}`
    )),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal defuse-modal", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "defuse-modal__bomb", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "defuse-modal__bomb-halo" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl("bomb"), alt: "", draggable: false }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-modal__bomb-pulse" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-modal__bomb-pulse defuse-modal__bomb-pulse--late" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-modal__bomb-pulse defuse-modal__bomb-pulse--late2" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "game-modal__title defuse-modal__title", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-modal__title-glyph", "aria-hidden": "true", children: "💣" }),
        "Cứu bom!"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "game-modal__sub", children: "Chọn vị trí đặt bom trở lại vào chồng bài (0 = trên cùng, 5 = sâu hơn)." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "defuse-slots", children: SLOTS.map((s) => {
        const isSelected = selectedSlot === s.idx;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: `defuse-slot${isSelected ? " defuse-slot--selected" : ""}`,
            onMouseEnter: () => setSelectedSlot(s.idx),
            onMouseLeave: () => setSelectedSlot(null),
            onClick: () => onConfirm(s.idx),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-slot__num", children: s.idx }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-slot__hint", children: s.label || s.sub }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-slot__beam", "aria-hidden": "true" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "defuse-slot__ring", "aria-hidden": "true" })
            ]
          },
          s.idx
        );
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "game-action-btn", onClick: onSkip, children: "Đặt cuối bộ bài" }) })
    ] })
  ] });
}
const REVEAL_INTERVAL_MS = 600;
const TOTAL_HOLD_MS = 4500;
function flightTransform(origin, target, progress) {
  if (!origin || !target) {
    return `translate3d(${target.left}px, ${target.top}px, 0)`;
  }
  const x = origin.left + (target.left - origin.left) * progress;
  const y = origin.top + (target.top - origin.top) * progress;
  const arc = Math.sin(progress * Math.PI) * 80;
  return `translate3d(${x}px, ${y - arc}px, 0)`;
}
function FuturePeekModal({ peek, onClose, originRect }) {
  const [revealedCount, setRevealedCount] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (!peek || peek.length === 0) return void 0;
    const timers = peek.map(
      (_, idx) => setTimeout(
        () => setRevealedCount((c) => Math.max(c, idx + 1)),
        500 + idx * REVEAL_INTERVAL_MS
      )
    );
    return () => timers.forEach(clearTimeout);
  }, [peek]);
  reactExports.useEffect(() => {
    if (!peek || peek.length === 0) return void 0;
    const lastReveal = 500 + (peek.length - 1) * REVEAL_INTERVAL_MS;
    const t = setTimeout(() => onClose?.(), lastReveal + TOTAL_HOLD_MS);
    return () => clearTimeout(t);
  }, [peek, onClose]);
  if (!peek || peek.length === 0) return null;
  const cardW = 130;
  const cardH = 186;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const gap = 24;
  const totalWidth = peek.length * cardW + (peek.length - 1) * gap;
  const startX = vw / 2 - totalWidth / 2;
  const baseY = typeof window !== "undefined" ? window.innerHeight / 2 - cardH / 2 : 300;
  const targets = peek.map((_, i) => ({
    left: startX + i * (cardW + gap),
    top: baseY
  }));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "future-peek-scene", "aria-modal": "true", role: "dialog", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "future-peek-stage", children: peek.map((key, i) => {
      const target = targets[i];
      const revealed = i < revealedCount;
      const arrivalProgress = Math.min(1, revealedCount - i > 0 ? 1 : 0);
      const transform = flightTransform(originRect, target, arrivalProgress);
      const meta = getCardLabel(key);
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: `future-peek-card${revealed ? " future-peek-card--revealed" : ""}`,
          style: {
            "--card-w": `${cardW}px`,
            "--card-h": `${cardH}px`,
            "--fly-x": `${target.left}px`,
            "--fly-y": `${target.top}px`,
            transform,
            zIndex: 30 + i
          },
          "aria-hidden": "true",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "future-peek-card__inner", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "future-peek-card__face future-peek-card__face--back", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl("back"), alt: "", draggable: false }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "future-peek-card__face future-peek-card__face--front", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl(key) || cardImageUrl("back"), alt: meta.label, draggable: false }) })
          ] })
        },
        i
      );
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "future-peek-info", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "future-peek-info__title", children: "Xem trước 3 lá" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "future-peek-info__sub", children: "Lá trái = bạn sẽ rút tiếp. Hai lá còn lại = người kế tiếp." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "future-peek-info__close",
          onClick: () => onClose?.(),
          children: "Úp xuống & đặt lại theo thứ tự"
        }
      )
    ] })
  ] });
}
const FLIGHT_MS$1 = 780;
const FLIP_AT_PCT = 0.55;
const VANISH_MS = 320;
const SPARK_COUNT = 12;
function DrawAnimation({
  sourceRect,
  targetRect,
  revealKey,
  onComplete
}) {
  const [mounted, setMounted] = reactExports.useState(true);
  const [flipped, setFlipped] = reactExports.useState(false);
  const onCompleteRef = reactExports.useRef(onComplete);
  reactExports.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  reactExports.useEffect(() => {
    if (!sourceRect || !targetRect) {
      setMounted(false);
      onCompleteRef.current?.();
      return void 0;
    }
    const tFlip = setTimeout(() => {
      if (revealKey && revealKey !== "bomb") setFlipped(true);
    }, FLIGHT_MS$1 * FLIP_AT_PCT);
    const tDone = setTimeout(() => {
      setMounted(false);
      onCompleteRef.current?.();
    }, FLIGHT_MS$1 + VANISH_MS);
    return () => {
      clearTimeout(tFlip);
      clearTimeout(tDone);
    };
  }, []);
  if (!mounted || !sourceRect || !targetRect) return null;
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  const cardW = 110;
  const cardH = 157;
  const cardStyle = {
    position: "fixed",
    left: 0,
    top: 0,
    width: cardW,
    height: cardH,
    zIndex: 200,
    pointerEvents: "none",
    "--start-x": `${startX - cardW / 2}px`,
    "--start-y": `${startY - cardH / 2}px`,
    "--end-x": `${endX - cardW / 2}px`,
    "--end-y": `${endY - cardH / 2}px`
  };
  const showFace = flipped && !!revealKey && revealKey !== "bomb";
  const trail = Array.from({ length: SPARK_COUNT }).map((_, i) => ({
    i,
    delay: i / SPARK_COUNT * FLIGHT_MS$1 * 0.7,
    size: 4 + i % 3 * 2
  }));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "draw-anim-trail", style: cardStyle, children: trail.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: "draw-anim-trail__spark",
        style: {
          "--delay": `${t.delay}ms`,
          width: `${t.size}px`,
          height: `${t.size}px`
        }
      },
      t.i
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "draw-anim-halo",
        style: {
          position: "fixed",
          left: startX - 80,
          top: startY - 80,
          width: 160,
          height: 160,
          pointerEvents: "none",
          zIndex: 199
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "draw-anim", style: cardStyle, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `draw-anim__inner${showFace ? " draw-anim__inner--flipped" : ""}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "draw-anim__face draw-anim__face--back", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl("back"), alt: "", draggable: false }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "draw-anim__face draw-anim__face--front", children: showFace && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl(revealKey), alt: revealKey, draggable: false }) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "draw-anim-burst",
        style: {
          position: "fixed",
          left: endX,
          top: endY,
          width: 0,
          height: 0,
          pointerEvents: "none",
          zIndex: 201
        },
        "aria-hidden": "true",
        children: Array.from({ length: 8 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "draw-anim-burst__spark",
            style: {
              "--angle": `${i / 8 * 360}deg`
            }
          },
          i
        ))
      }
    )
  ] });
}
const FLIGHT_MS = 620;
function PlayCardAnimation({ sourceRect, cardKey, targetRect }) {
  const [phase, setPhase] = reactExports.useState("flying");
  const [mounted, setMounted] = reactExports.useState(true);
  reactExports.useEffect(() => {
    const t1 = setTimeout(() => setPhase("burst"), FLIGHT_MS);
    const t2 = setTimeout(() => setPhase("done"), FLIGHT_MS + 900);
    const t3 = setTimeout(() => setMounted(false), FLIGHT_MS + 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);
  if (!mounted || !sourceRect) return null;
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect ? targetRect.left + targetRect.width / 2 : startX;
  const endY = targetRect ? targetRect.top + targetRect.height / 2 : startY;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `play-card-anim play-card-anim--${phase}`,
        style: {
          position: "fixed",
          left: 0,
          top: 0,
          width: 86,
          height: 124,
          zIndex: 195,
          pointerEvents: "none",
          "--start-x": `${startX - 43}px`,
          "--start-y": `${startY - 62}px`,
          "--end-x": `${endX - 43}px`,
          "--end-y": `${endY - 62}px`
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl(cardKey), alt: cardKey, draggable: false }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "play-card-anim__halo", "aria-hidden": "true" })
        ]
      }
    ),
    phase === "burst" && targetRect && /* @__PURE__ */ jsxRuntimeExports.jsx(
      FxBurst,
      {
        anchor: { x: endX, y: endY },
        fxKey: cardKey,
        size: "lg",
        id: `play-${cardKey}-${Date.now()}`
      }
    )
  ] });
}
const REVEAL_DURATION_MS = 3e3;
const FLIP_DELAY_MS = 280;
function BombReveal({ memberName, willDefuse, onComplete }) {
  const [phase, setPhase] = reactExports.useState("back");
  const [mounted, setMounted] = reactExports.useState(true);
  const onCompleteRef = reactExports.useRef(onComplete);
  reactExports.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  reactExports.useEffect(() => {
    const t1 = setTimeout(() => setPhase("flip"), FLIP_DELAY_MS);
    const t2 = setTimeout(() => setPhase("face"), FLIP_DELAY_MS + 400);
    const t3 = setTimeout(() => {
      if (willDefuse) {
        setPhase("fadeout");
        const t4 = setTimeout(() => {
          setMounted(false);
          onCompleteRef.current?.();
        }, 400);
        return () => clearTimeout(t4);
      }
      setPhase("explode");
    }, REVEAL_DURATION_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [willDefuse]);
  if (!mounted) return null;
  const backUrl = cardImageUrl("back");
  const faceUrl = cardImageUrl("bomb");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `bomb-reveal-scrim bomb-reveal-scrim--${phase}`, "aria-hidden": "true" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-reveal-sparks", "aria-hidden": "true", children: Array.from({ length: 18 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: "bomb-reveal-sparks__spark",
        style: {
          "--angle": `${i / 18 * 360}deg`,
          "--dist": `${280 + i % 4 * 80}px`,
          "--delay": `${(phase === "face" || phase === "hold" ? 0 : 200) + i % 3 * 80}ms`
        }
      },
      `s-${i}`
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-reveal-rings", "aria-hidden": "true", children: [0, 1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: "bomb-reveal-rings__ring",
        style: { animationDelay: `${i * 0.4}s` }
      },
      i
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `bomb-reveal bomb-reveal--${phase}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-reveal__halo", "aria-hidden": "true" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-reveal__aura", "aria-hidden": "true" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bomb-reveal__inner", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-reveal__face bomb-reveal__face--back", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: backUrl, alt: "", draggable: false }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bomb-reveal__face bomb-reveal__face--front", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: faceUrl, alt: "", draggable: false }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "bomb-reveal__pulse-ring", "aria-hidden": "true" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-reveal__countdown", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 100 100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "circle",
          {
            cx: "50",
            cy: "50",
            r: "46",
            fill: "none",
            stroke: "rgba(255,255,255,0.12)",
            strokeWidth: "6"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "circle",
          {
            cx: "50",
            cy: "50",
            r: "46",
            fill: "none",
            stroke: "url(#bomb-countdown-grad)",
            strokeWidth: "6",
            strokeLinecap: "round",
            transform: "rotate(-90 50 50)",
            strokeDasharray: `${2 * Math.PI * 46} ${2 * Math.PI * 46}`,
            className: "bomb-reveal__countdown-bar"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "bomb-countdown-grad", x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "#ff8a4a" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "#ff3030" })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bomb-reveal__label", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "bomb-reveal__name", children: memberName || "Bạn" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "bomb-reveal__text", children: [
          phase === "back" && "Đang rút...",
          (phase === "flip" || phase === "face" || phase === "hold") && "rút trúng bom!",
          phase === "explode" && (willDefuse ? "💣" : "💥 NỔ!"),
          phase === "fadeout" && "An toàn — có lá Cứu"
        ] })
      ] })
    ] })
  ] });
}
function BombExplode({ memberName, onComplete }) {
  const [mounted, setMounted] = reactExports.useState(true);
  const onCompleteRef = reactExports.useRef(onComplete);
  reactExports.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  reactExports.useEffect(() => {
    const id = setTimeout(() => {
      setMounted(false);
      onCompleteRef.current?.();
    }, 2400);
    return () => clearTimeout(id);
  }, []);
  if (!mounted) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-explode-flash", "aria-hidden": "true" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bomb-explode bomb-explode--fireball", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-explode__core" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-explode__ring bomb-explode__ring--1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-explode__ring bomb-explode__ring--2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-explode__ring bomb-explode__ring--3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-explode__flame-ring" }),
      Array.from({ length: 16 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: "bomb-explode__shard",
          style: {
            "--angle": `${i / 16 * 360}deg`,
            "--dist": `${320 + i % 3 * 80}px`,
            "--delay": `${80 + i % 4 * 50}ms`
          }
        },
        i
      )),
      Array.from({ length: 28 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: "bomb-explode__spark",
          style: {
            "--angle": `${i * 17.3 % 360}deg`,
            "--dist": `${200 + i * 13 % 220}px`,
            "--delay": `${30 + i % 5 * 30}ms`,
            color: i % 3 === 0 ? "#ffeb6b" : i % 3 === 1 ? "#ff8a4a" : "#ff4242"
          }
        },
        `s-${i}`
      )),
      Array.from({ length: 8 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: "bomb-explode__puff",
          style: {
            "--angle": `${i / 8 * 360}deg`,
            "--delay": `${120 + i % 4 * 80}ms`
          }
        },
        `p-${i}`
      ))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bomb-explode-label", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "bomb-explode-label__glyph", children: "💥" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "bomb-explode-label__text", children: memberName ? `${memberName} đã nổ` : "Bạn đã nổ" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "bomb-explode-label__sub", children: "Bị loại khỏi ván" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bomb-explode-vignette", "aria-hidden": "true" })
  ] });
}
const FLIP_MS = 720;
const HOLD_MS = 5e3;
const EXIT_MS = 400;
const CARD_W = 220;
const CARD_H = 314;
const HALO_COLOR = {
  attack: "rgba(255, 88, 88, 0.55)",
  skip: "rgba(122, 223, 255, 0.55)",
  favor: "rgba(255, 215, 130, 0.55)",
  future: "rgba(154, 120, 255, 0.55)",
  shuffle: "rgba(95, 220, 182, 0.55)",
  nope: "rgba(255, 90, 110, 0.55)",
  general: "rgba(255, 215, 160, 0.55)"
};
function ActionCardReveal({
  cardKey,
  byMemberName,
  isNopeChain,
  chainCount,
  nopeRemainingMs,
  originRect
}) {
  const [show, setShow] = reactExports.useState(true);
  const [phase, setPhase] = reactExports.useState("in");
  reactExports.useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), FLIP_MS);
    const t2 = setTimeout(() => setPhase("out"), FLIP_MS + HOLD_MS);
    const t3 = setTimeout(() => setShow(false), FLIP_MS + HOLD_MS + EXIT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);
  if (!show) return null;
  const safeCardKey = cardKey || "general";
  const url = cardImageUrl(safeCardKey);
  const meta = getCardLabel(safeCardKey);
  const haloColor = HALO_COLOR[safeCardKey] || HALO_COLOR.general;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const endX = vw / 2 - CARD_W / 2;
  const endY = vh / 2 - CARD_H / 2;
  let startX = endX;
  let startY = endY;
  let inFlight = false;
  if (originRect && originRect.width && originRect.height) {
    startX = originRect.left + (originRect.width - CARD_W) / 2;
    startY = originRect.top + (originRect.height - CARD_H) / 2;
    inFlight = true;
  }
  const cssVars = {
    "--card-w": `${CARD_W}px`,
    "--card-h": `${CARD_H}px`,
    "--start-x": `${startX}px`,
    "--start-y": `${startY}px`,
    "--end-x": `${endX}px`,
    "--end-y": `${endY}px`,
    "--halo-color": haloColor
  };
  const wrapperClass = `card-flip${inFlight ? " card-flip--in-flight" : ""}${phase === "out" ? " card-flip--out" : ""}`;
  const remainingSec = nopeRemainingMs != null ? Math.max(0, nopeRemainingMs / 1e3) : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-flip-scene", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-flip-halo", style: cssVars }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: wrapperClass,
          style: cssVars,
          "aria-label": `${byMemberName || ""} vừa dùng ${meta.label}`,
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-flip__inner", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-flip__face card-flip__face--back", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl("back"), alt: "", draggable: false }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-flip__face card-flip__face--front", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: url || cardImageUrl("back"), alt: meta.label, draggable: false }) })
          ] })
        }
      )
    ] }),
    phase !== "out" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-flip-label", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        byMemberName || (isNopeChain ? "Ai đó" : "Bạn"),
        isNopeChain ? ` đã dùng Cản${chainCount > 1 ? ` × ${chainCount}` : ""}` : ` đã dùng ${meta.label}`
      ] }),
      remainingSec != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "card-flip-label__count", children: [
        remainingSec.toFixed(1),
        "s để cản"
      ] })
    ] })
  ] });
}
function FxScreenShake({ active, intensity = "md", durationMs = 600 }) {
  if (!active) return null;
  const amp = intensity === "lg" ? 14 : intensity === "sm" ? 5 : 9;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: `fx-shake fx-shake--${intensity}`,
      style: {
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 230,
        "--shake-amp": `${amp}px`,
        "--shake-dur": `${durationMs}ms`
      },
      "aria-hidden": "true"
    }
  );
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
const COMBO_KEYS = ["ninja", "superman", "zombie", "robot", "hải-tặc"];
function readSessionRoomId() {
  try {
    const raw = sessionStorage.getItem("arcana.session.v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}
const NOPE_WINDOW_MS = 5e3;
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
  const [pickModal, setPickModal] = reactExports.useState(null);
  const [futurePeek, setFuturePeek] = reactExports.useState(null);
  const [defuseModal, setDefuseModal] = reactExports.useState(false);
  const [concedeConfirm, setConcedeConfirm] = reactExports.useState(false);
  const [drawAnim, setDrawAnim] = reactExports.useState(null);
  const [recentDiscards, setRecentDiscards] = reactExports.useState([]);
  const [opponentDrawAnim, setOpponentDrawAnim] = reactExports.useState(null);
  const [playedAnim, setPlayedAnim] = reactExports.useState(null);
  const [fxQueue, setFxQueue] = reactExports.useState([]);
  const [shake, setShake] = reactExports.useState(null);
  const [turnHighlight, setTurnHighlight] = reactExports.useState(null);
  const [bombReveal, setBombReveal] = reactExports.useState(null);
  const [bombExplode, setBombExplode] = reactExports.useState(null);
  const lastTurnRef = reactExports.useRef(null);
  const lastDrawnRef = reactExports.useRef(null);
  const opponentDrawTimerRef = reactExports.useRef(null);
  const [lastDrawnKey, setLastDrawnKey] = reactExports.useState(null);
  const lastTurnOrderRef = reactExports.useRef(null);
  const [turnIntro, setTurnIntro] = reactExports.useState(null);
  const [localDrawPending, setLocalDrawPending] = reactExports.useState(false);
  const drawInFlightRef = reactExports.useRef(false);
  const actionInFlightRef = reactExports.useRef(false);
  const deckRef = reactExports.useRef(null);
  const handCenterRef = reactExports.useRef(null);
  const discardRef = reactExports.useRef(null);
  const rotatingRef = reactExports.useRef(false);
  const gs = room?.gameState || null;
  const members = room?.members || [];
  const myMember = members.find((m) => m.id === myId) || null;
  const myHand = room?.myHand || (gs && myId ? [] : []);
  const isMyTurn = gs && myId && gs.currentTurnMemberId === myId;
  const isAlive = !myMember || gs && gs.alive?.[myId] !== false;
  const gameEnded = gs && gs.endedAt;
  const emitFx = reactExports.useCallback((fxKey, anchor, opts = {}) => {
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
  const emitShake = reactExports.useCallback((intensity = "md", durationMs = 600) => {
    setShake({ intensity, until: Date.now() + durationMs });
    setTimeout(() => setShake(null), durationMs);
  }, []);
  const opponents = reactExports.useMemo(() => {
    const nonSelf = members.filter((m) => m.id !== myId);
    const host = nonSelf.find((m) => m.isHost) || null;
    const others = nonSelf.filter((m) => !m.isHost).sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
    const left = [];
    const right = [];
    if (host) left.push(host);
    for (let i = 0; i < others.length; i++) {
      if (i % 2 === 0) right.push(others[i]);
      else left.push(others[i]);
    }
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
      setRoom((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
      const gs2 = data?.gameState;
      const gameFinished = gs2?.endedAt != null;
      const isLobby = data?.status === "waiting" && !gameFinished;
      if (isLobby) {
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
    const prevTurn = lastTurnRef.current;
    const curTurn = gs?.currentTurnMemberId;
    const cardCounts = gs?.handCounts || {};
    if (prevTurn && curTurn && prevTurn !== curTurn) {
      const drewCount = cardCounts[prevTurn] ?? 0;
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
  reactExports.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  reactExports.useEffect(() => {
    return () => {
      if (opponentDrawTimerRef.current) {
        clearTimeout(opponentDrawTimerRef.current);
        opponentDrawTimerRef.current = null;
      }
    };
  }, []);
  reactExports.useEffect(() => {
    lastTurnOrderRef.current = null;
  }, [roomId]);
  reactExports.useEffect(() => {
    if (!gs?.futurePeek || gs.futurePeek.length === 0) return;
    setFuturePeek(gs.futurePeek);
  }, [gs?.futurePeek]);
  reactExports.useEffect(() => {
    if (futurePeek) return;
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
      const meta = getCardLabel(key);
      setActionModal({ card: { key, ...meta }, handIdx: idx });
    },
    [isMyTurn, isAlive, gameEnded]
  );
  const isComboCard = reactExports.useCallback((k) => COMBO_KEYS.includes(k), []);
  const detectComboFor = reactExports.useCallback(
    (hand, cardKey) => {
      const comboCount = (hand || []).filter(isComboCard).length;
      if (comboCount >= 5) return "FiveAny";
      const sameCount = (hand || []).filter((c) => c === cardKey).length;
      if (sameCount >= 3) return "ThreeSame";
      if (sameCount >= 2) return "TwoSame";
      return null;
    },
    [isComboCard]
  );
  const onConfirmAction = reactExports.useCallback(async () => {
    if (!actionModal) return;
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const card = actionModal.card;
      setActionModal(null);
      setSelectedCardIdx(null);
      const savedCardKey = card.key;
      const localHand = room?.myHand && Array.isArray(room.myHand) ? room.myHand : [];
      if (!isComboCard(card.key) && !localHand.includes(card.key)) {
        actionInFlightRef.current = false;
        toast?.error?.("Bạn không còn lá này trên tay.");
        const meta = getCardLabel(savedCardKey);
        setActionModal({ card: { key: savedCardKey, ...meta } });
        return;
      }
      const srcRect = handCenterRef.current?.getBoundingClientRect?.();
      const discardRect = discardRef.current?.getBoundingClientRect?.();
      if (srcRect) {
        setPlayedAnim({
          sourceRect: srcRect,
          targetRect: discardRect,
          cardKey: card.key,
          ts: Date.now()
        });
        setTimeout(() => setPlayedAnim(null), 1700);
      }
      emitFx(card.key, discardRect, { size: "lg", durationMs: 1500 });
      try {
        if (isComboCard(card.key)) {
          const combo = detectComboFor(myHand, card.key);
          if (!combo) {
            toast?.error?.("Cần ít nhất 2 lá combo để dùng.");
            return;
          }
          if (combo === "FiveAny") {
            const res3 = await roomsApi.playCard(roomId, {
              memberId: myId,
              cardKey: card.key,
              comboKind: "FiveAny"
            });
            audio.playSfx?.("buttonClick");
            setRoom(res3.Room);
            if (res3?.RequiresDiscardPick) {
              setPickModal({
                kind: "cardPick",
                purpose: "FiveAny",
                cardKey: card.key,
                title: "Chọn 1 lá từ chồng bỏ",
                sub: "Các lá đã đánh (trùng nhau chỉ hiện 1 lần).",
                candidates: res3.FavorCandidates || [],
                fxColor: "#ffd86b",
                fxAccent: "#a4f2dc"
              });
              return;
            }
            if (res3?.Toast) toast?.info?.(res3.Toast);
            return;
          }
          const res2 = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: card.key,
            comboKind: combo
          });
          setRoom(res2.Room);
          setPickModal({
            kind: "playerPick",
            purpose: combo,
            cardKey: card.key,
            title: combo === "TwoSame" ? "Combo 2 — Chọn đối thủ" : "Combo 3 — Chọn đối thủ",
            sub: combo === "TwoSame" ? "Lấy 1 lá ngẫu nhiên từ tay đối thủ." : "Yêu cầu đối thủ đưa 1 lá chỉ định (nếu có)."
          });
          return;
        }
        const res = await roomsApi.playCard(roomId, {
          memberId: myId,
          cardKey: card.key
        });
        audio.playSfx?.("buttonClick");
        if (res?.RequiresTargetPick) {
          setActionModal({ card, awaitingTarget: true });
          return;
        }
        if (res?.RequiresFavorPick) {
          setPickModal({
            kind: "cardPick",
            purpose: "Favor",
            cardKey: card.key,
            title: "Chọn 1 lá từ tay đối thủ",
            sub: "Hệ thống đã xáo các lá trên tay đối thủ — chọn 1.",
            candidates: res.FavorCandidates || [],
            fxColor: "#ffd86b",
            fxAccent: "#ffeaa3"
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
        setRecentDiscards((prev) => {
          const next = [...prev, { key: card.key, by: myId, ts: Date.now() }];
          return next.length > 6 ? next.slice(next.length - 6) : next;
        });
        if (res?.Toast) toast?.info?.(res.Toast);
      } catch (e) {
        const code = e?.code;
        if (code === "card_not_in_hand" || code === "not_your_turn" || code === "action_pending") {
          try {
            const fresh = await roomsApi.snapshotWithViewer(roomId, myId);
            if (fresh) {
              setRoom(fresh);
              if (savedCardKey) {
                const meta = getCardLabel(savedCardKey);
                setActionModal({ card: { key: savedCardKey, ...meta } });
              }
            }
          } catch (_) {
          }
        }
        toast?.error?.(e.message || "Không thể dùng lá bài.");
      }
    } finally {
      actionInFlightRef.current = false;
    }
  }, [audio, detectComboFor, emitFx, isComboCard, myHand, myId, room, roomId, toast]);
  const onPickPlayer = reactExports.useCallback(
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
            comboKind: "TwoSame"
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
              targetId
            });
            return;
          }
          if (res?.Toast) toast?.info?.(res.Toast);
          return;
        }
        if (ctx.purpose === "ThreeSame") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: targetId,
            comboKind: "ThreeSame"
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
              targetId
            });
            return;
          }
          if (res?.Toast) toast?.info?.(res.Toast);
          return;
        }
        if (ctx.purpose === "Favor") {
          const res = await roomsApi.playCard(roomId, {
            memberId: myId,
            cardKey: ctx.cardKey,
            targetMemberId: targetId
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
              targetId
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
    [audio, myId, pickModal, roomId, toast]
  );
  const onPickCard = reactExports.useCallback(
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
            discardPickKey: key
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
            discardPickKey: key
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
            discardPickKey: key
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
            discardPickKey: key
          });
          audio.playSfx?.("buttonClick");
          setRoom(res.Room);
          if (res?.Toast) toast?.info?.(res.Toast);
          return;
        }
      } catch (e) {
        toast?.error?.(e.message || "Combo thất bại.");
      } finally {
        actionInFlightRef.current = false;
      }
    },
    [audio, myId, pickModal, roomId, toast]
  );
  const onConcede = reactExports.useCallback(
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
        navigate(ROUTES.landing, { replace: true });
      }
    },
    [myId, navigate, roomId, toast]
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
      setDrawAnim({ sourceRect: srcRect, targetRect: tgtRect, cardKey: "back", revealKey: null });
    }
    emitFx("draw", srcRect, { size: "md", durationMs: 800 });
    try {
      const res = await roomsApi.drawCard(roomId, myId);
      setRoom(res.Room);
      if (res?.DrawnCardKey && res.DrawnCardKey !== "bomb") {
        setDrawAnim((cur) => cur ? { ...cur, revealKey: res.DrawnCardKey } : cur);
        setLastDrawnKey(res.DrawnCardKey);
        setTimeout(() => setLastDrawnKey(null), 1400);
      }
      if (res?.RequiresDefuse) {
        setDefuseModal(true);
        if (res?.Toast) toast?.warning?.(res.Toast);
      } else if (res?.RequiresMoreDraws) {
        if (res?.Toast) toast?.info?.(res.Toast);
        setTimeout(() => {
          if (isAlive && isMyTurn) {
            onDrawCard();
          }
        }, 1200);
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
  }, [audio, emitFx, gameEnded, isAlive, isMyTurn, myId, roomId, toast]);
  const onConfirmDefuse = reactExports.useCallback(
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
    [audio, emitFx, emitShake, myId, roomId, toast]
  );
  const lastNoNopeToastRef = reactExports.useRef(0);
  const onNope = reactExports.useCallback(async () => {
    const hasNopeCard2 = (myHand || []).includes("nope");
    if (!hasNopeCard2) {
      const now2 = Date.now();
      if (now2 - lastNoNopeToastRef.current > 1500) {
        lastNoNopeToastRef.current = now2;
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
  const nopeRemaining = pendingAction ? Math.max(0, NOPE_WINDOW_MS - (now - new Date(pendingAction.createdAt).getTime())) : 0;
  const hasNopeCard = (myHand || []).includes("nope");
  const nopeWindowOpen = pendingAction && nopeRemaining > 0 && !pendingAction.nopeChain.includes(myId);
  const canChainNope = nopeWindowOpen && hasNopeCard;
  const nopeWindowButNoCard = nopeWindowOpen && !hasNopeCard;
  reactExports.useEffect(() => {
    const key = pendingAction?.cardKey;
    const createdAt = pendingAction?.createdAt;
    if (!key || !createdAt) return;
    setRecentDiscards((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.ts === createdAt) return prev;
      const next = [...prev, { key, by: pendingAction.initiatorId, ts: createdAt }];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
  }, [pendingAction?.cardKey, pendingAction?.createdAt]);
  reactExports.useEffect(() => {
    if (!gs?.bombRevealActive || !gs?.lastDrawnAt || !gs?.lastDrawnBy) return;
    if (gs.lastDrawnCardKey !== "bomb") return;
    const stamp = `${gs.lastDrawnBy}::${gs.lastDrawnAt}`;
    if (lastDrawnRef.current === stamp) return;
    lastDrawnRef.current = stamp;
    const member = members.find((m) => m.id === gs.lastDrawnBy);
    const memberName = member?.name || "Bạn";
    const isLocal = gs.lastDrawnBy === myId;
    const stillAlive = gs.alive?.[gs.lastDrawnBy] !== false;
    const willDefuse = !!(isLocal && stillAlive && (myHand || []).some((c) => COMBO_KEYS.includes(c)));
    setBombReveal({
      memberId: gs.lastDrawnBy,
      memberName,
      willDefuse,
      key: stamp
    });
    const safety = setTimeout(() => setBombReveal(null), 4500);
    return () => clearTimeout(safety);
  }, [gs?.bombRevealActive, gs?.lastDrawnAt, gs?.lastDrawnBy, gs?.lastDrawnCardKey, gs?.alive, members, myId, myHand, room?.myHand]);
  reactExports.useEffect(() => {
    if (!gs?.lastDrawnAt || !gs?.lastDrawnBy || !gs?.lastDrawnCardKey) return;
    const stamp = `${gs.lastDrawnBy}::${gs.lastDrawnAt}`;
    if (lastDrawnRef.current === stamp) return;
    if (gs.bombRevealActive) return;
    if (gs.lastDrawnCardKey === "bomb") return;
    lastDrawnRef.current = stamp;
    if (drawAnim) return;
    const srcRect = deckRef.current?.getBoundingClientRect?.() || null;
    const tgtRect = handCenterRef.current?.getBoundingClientRect?.() || null;
    if (!srcRect || !tgtRect) return;
    setDrawAnim({
      sourceRect: srcRect,
      targetRect: tgtRect,
      cardKey: "back",
      revealKey: gs.lastDrawnCardKey
    });
    if (gs.lastDrawnBy === myId) {
      setLastDrawnKey(gs.lastDrawnCardKey);
      setTimeout(() => setLastDrawnKey(null), 1400);
    }
  }, [gs?.lastDrawnAt, gs?.lastDrawnBy, gs?.lastDrawnCardKey, gs?.bombRevealActive, myId, drawAnim]);
  if (!room) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "game-page", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingBackdrop, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "arc-loading", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "arc-loading__spinner" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Đang tải ván chơi…" })
      ] })
    ] });
  }
  gs?.deckCount ?? null;
  const discardCount = gs?.discardCount ?? 0;
  const turnLimitSec = gs?.turnTimeLimitSec ?? 60;
  const turnRemainingSec = (() => {
    if (gameEnded || !gs?.turnStartedAt) return null;
    const start = new Date(gs.turnStartedAt).getTime();
    const remaining = turnLimitSec * 1e3 - (now - start);
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 1e3);
  })();
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
      ] }),
      turnRemainingSec !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "span",
        {
          className: `game-header__turn-timer${turnRemainingSec <= 10 ? " game-header__turn-timer--urgent" : ""}`,
          "aria-label": "Thời gian lượt",
          title: `Còn ${turnRemainingSec}s trước khi hệ thống tự động rút bài`,
          children: [
            "⏱ ",
            turnRemainingSec,
            "s"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-header__actions", children: !gameEnded && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "game-action-btn game-action-btn--concede",
          onClick: () => onConcede(false),
          title: "Đầu hàng",
          children: "Đầu hàng"
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "game-table", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-side game-side--left", children: opponents.left.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(Seat, { member: m, gs }, m.id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: discardRef, className: "discard-pile-wrap", children: /* @__PURE__ */ jsxRuntimeExports.jsx(DiscardPile, { count: discardCount, recentKeys: recentDiscards.map((d) => d.key) }) }),
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
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer--badge", children: "?" })
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
          (canChainNope || nopeWindowButNoCard) && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              className: `game-action-btn game-action-btn--nope${canChainNope ? "" : " game-action-btn--nope-disabled"}`,
              onClick: canChainNope ? onNope : void 0,
              disabled: !canChainNope,
              "aria-disabled": !canChainNope,
              title: canChainNope ? "Dùng lá Cản" : "Bạn không có lá Cản",
              children: [
                canChainNope ? "Cản!" : "Đợi cản",
                " (",
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
          onSelectCard: onSelectHandCard,
          lastDrawnKey
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
      PlayerPickerModal,
      {
        title: "Xin — chọn đối thủ",
        sub: "Lấy 1 lá ngẫu nhiên từ tay đối thủ (hệ thống sẽ xáo). ",
        opponents: members.filter((m) => m.id !== myId).map((m) => ({ ...m, alive: gs?.alive?.[m.id] !== false, handCount: gs?.handCounts?.[m.id] || 0 })),
        myId,
        onPick: async (tid) => {
          setActionModal(null);
          try {
            const res = await roomsApi.playCard(roomId, {
              memberId: myId,
              cardKey: actionModal.card.key,
              targetMemberId: tid
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
                targetId: tid
              });
            } else if (res?.Toast) {
              toast?.info?.(res.Toast);
            }
          } catch (e) {
            toast?.error?.(e.message || "Không thể dùng lá bài.");
          }
        },
        onCancel: () => {
          setActionModal(null);
          setSelectedCardIdx(null);
        }
      }
    ),
    pickModal && pickModal.kind === "playerPick" && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PlayerPickerModal,
      {
        title: pickModal.title,
        sub: pickModal.sub,
        opponents: members.filter((m) => m.id !== myId).map((m) => ({ ...m, alive: gs?.alive?.[m.id] !== false, handCount: gs?.handCounts?.[m.id] || 0 })),
        myId,
        onPick: onPickPlayer,
        onCancel: () => setPickModal(null)
      }
    ),
    pickModal && pickModal.kind === "cardPick" && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CardPickModal,
      {
        title: pickModal.title,
        sub: pickModal.sub,
        candidates: pickModal.candidates,
        fxColor: pickModal.fxColor,
        fxAccent: pickModal.fxAccent,
        onPick: onPickCard,
        onCancel: () => setPickModal(null)
      }
    ),
    defuseModal && /* @__PURE__ */ jsxRuntimeExports.jsx(
      DefuseModal,
      {
        onConfirm: onConfirmDefuse,
        onSkip: () => onConfirmDefuse(5)
      }
    ),
    futurePeek && /* @__PURE__ */ jsxRuntimeExports.jsx(
      FuturePeekModal,
      {
        peek: futurePeek,
        onClose: () => setFuturePeek(null),
        originRect: deckRef.current?.getBoundingClientRect?.() || null
      }
    ),
    concedeConfirm && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-modal__scrim concede-scrim", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-modal concede-modal", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "concede-modal__icon", "aria-hidden": "true", children: "⚠️" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "concede-modal__title", children: "Xác nhận đầu hàng?" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "concede-modal__sub", children: [
        "Bạn sẽ bị loại khỏi ván chơi và trở về trang chính.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "Hành động này ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "không thể hoàn tác" }),
        "."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "concede-modal__actions", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "game-action-btn",
            onClick: () => setConcedeConfirm(false),
            children: "Huỷ"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "game-action-btn game-action-btn--danger",
            onClick: () => onConcede(true),
            children: "Đầu hàng"
          }
        )
      ] })
    ] }) }),
    drawAnim && /* @__PURE__ */ jsxRuntimeExports.jsx(
      DrawAnimation,
      {
        sourceRect: drawAnim.sourceRect,
        targetRect: drawAnim.targetRect,
        cardKey: drawAnim.cardKey,
        revealKey: drawAnim.revealKey,
        onComplete: () => setDrawAnim(null)
      }
    ),
    playedAnim && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PlayCardAnimation,
      {
        cardKey: playedAnim.cardKey,
        sourceRect: playedAnim.sourceRect
      },
      playedAnim.ts
    ),
    opponentDrawAnim && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "opponent-draw-toast",
        role: "status",
        "aria-live": "polite",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "opponent-draw-toast__icon", "aria-hidden": "true", children: "✦" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            members.find((m) => m.id === opponentDrawAnim.memberId)?.name || "Đối thủ",
            " vừa rút bài"
          ] })
        ]
      },
      opponentDrawAnim.ts
    ),
    fxQueue.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      FxBurst,
      {
        anchor: f.anchor,
        fxKey: f.fxKey,
        size: f.size,
        id: f.id
      },
      f.id
    )),
    /* @__PURE__ */ jsxRuntimeExports.jsx(FxScreenShake, { active: !!shake, intensity: shake?.intensity || "md" }),
    bombReveal && /* @__PURE__ */ jsxRuntimeExports.jsx(
      BombReveal,
      {
        memberName: bombReveal.memberName,
        memberId: bombReveal.memberId,
        willDefuse: bombReveal.willDefuse,
        onComplete: () => {
          if (!bombReveal.willDefuse) {
            setBombExplode({
              memberName: bombReveal.memberName,
              key: `${bombReveal.key}-explode`
            });
            emitShake("lg", 900);
          }
          setBombReveal(null);
        }
      },
      bombReveal.key
    ),
    bombExplode && /* @__PURE__ */ jsxRuntimeExports.jsx(
      BombExplode,
      {
        memberName: bombExplode.memberName,
        onComplete: () => setBombExplode(null)
      },
      bombExplode.key
    ),
    (() => {
      const cardKey = gs?.lastPlayedCardKey;
      const at = gs?.lastPlayedAt;
      if (!cardKey || !at) return null;
      const chain = gs?.pendingAction?.nopeChain?.length || 0;
      const isNopeChain = !!gs?.lastPlayedByNope;
      const memberId = isNopeChain ? gs?.lastPlayedByNope : gs?.lastPlayedBy;
      const memberName = members.find((m) => m.id === memberId)?.name || "Bạn";
      const remaining = nopeRemaining > 0 ? nopeRemaining : null;
      const originRect = deckRef.current?.getBoundingClientRect?.() || null;
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        ActionCardReveal,
        {
          cardKey,
          byMemberName: memberName,
          isNopeChain,
          chainCount: chain,
          nopeRemainingMs: remaining,
          originRect,
          onComplete: void 0
        },
        `${at}::${chain}::${cardKey}`
      );
    })(),
    gameEnded && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SummaryScreen,
      {
        room,
        gameState: gs,
        myId,
        onContinue: onContinueFromSummary
      }
    ),
    turnIntro && !gameEnded && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "turn-intro-overlay", role: "dialog", "aria-modal": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "turn-intro", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "turn-intro__label", children: "Ván mới bắt đầu" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "turn-intro__order", children: [
        "Bạn sẽ đi ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { children: [
          "thứ ",
          turnIntro.order
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "turn-intro__total", children: [
          " / ",
          turnIntro.total
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "turn-intro__btn",
          onClick: () => setTurnIntro(null),
          autoFocus: true,
          children: "Sẵn sàng"
        }
      )
    ] }) })
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
function DiscardPile({ count, recentKeys }) {
  const safeCount = count || 0;
  const list = (recentKeys || []).slice(-6);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `discard-pile${safeCount > 0 ? "" : " discard-pile--empty"}`,
      "aria-label": `Chồng bỏ ${safeCount} lá`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "discard-pile__stack", children: [
          list.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "discard-pile__placeholder", children: "Chồng bỏ" }),
          list.map((key, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: [
                "discard-pile__card",
                i === list.length - 1 ? "discard-pile__card--top" : "",
                `discard-pile__card--${key}`
              ].join(" "),
              style: {
                "--i": i,
                "--total": list.length,
                "--enter-delay": `${Math.max(0, (list.length - 1 - i) * 60)}ms`
              },
              title: key,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: cardImageUrl(key), alt: key, draggable: false, loading: "lazy" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "discard-pile__card-glow", "aria-hidden": "true" })
              ]
            },
            `${i}-${key}`
          ))
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "discard-pile__count", children: safeCount })
      ]
    }
  );
}
export {
  GamePage as default
};
