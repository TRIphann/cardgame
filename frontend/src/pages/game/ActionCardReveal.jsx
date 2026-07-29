// ActionCardReveal — cinematic overlay hiển thị ở giữa màn hình khi:
//   • Player đánh 1 lá action (attack, skip, favor, future, shuffle)
//   • Hoặc khi 1 player chain Nope (reset lại với lá Nope)
//
// Component này KHÔNG tự tính thời gian — thời gian tồn tại phụ thuộc vào
// server. Mỗi khi `key` thay đổi (LastPlayedAt mới), component sẽ "reset":
// remount với pha `enter → hold` mới. Nếu `pendingAction` đóng (action xong),
// `key=null` → component unmount với pha `exit`.
//
// `phase` advancement:
//   enter: 0–360ms. Card bay vào giữa, scale up
//   hold:  360ms–N. Render full + pulse + countdown ring + label "X dùng Y"
//          (trong khi nopeChain có thể thay đổi → parent reset key)
//   exit: 0–360ms. Fade scale-down rồi unmount

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { fxFor } from "./cardFx.js";

const ENTER_MS = 360;
const EXIT_MS = 280;

export function ActionCardReveal({
  cardKey,
  byMemberName,
  isNopeChain, // boolean — true nếu lần này là do Nope chain (label khác)
  chainCount, // nopeChain.length hiện tại
  nopeRemainingMs, // thời gian còn lại của nope window (ms); null khi không có pendingAction
  onComplete,
}) {
  const [phase, setPhase] = useState("enter");
  const [mounted, setMounted] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  const fx = fxFor(cardKey || "general");
  const safeCardKey = cardKey || "general";
  const url = cardImageUrl(safeCardKey);

  // Reset animation phase on mount (each new cardKey remounts the component
  // because parent uses `key={...}` derived from a timestamp).
  useEffect(() => {
    setPhase("enter");
    const t1 = setTimeout(() => setPhase("hold"), ENTER_MS);
    return () => clearTimeout(t1);
  }, []);

  // When parent changes nopeRemainingMs source of truth to 0 → start exit.
  useEffect(() => {
    if (nopeRemainingMs === 0) {
      setPhase("exit");
      const t = setTimeout(() => {
        setMounted(false);
        onComplete?.();
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [nopeRemainingMs, onComplete]);

  if (!mounted) return null;

  // Countdown ring percentage
  const ringPct = nopeRemainingMs != null
    ? Math.max(0, Math.min(1, nopeRemainingMs / 3000))
    : 0;

  return (
    <>
      {/* Tint backdrop — color varies by card-type */}
      <div
        className={`action-reveal__scrim action-reveal__scrim--${phase} action-reveal__scrim--${safeCardKey}`}
        aria-hidden="true"
        style={{ "--fx-color": fx.color, "--fx-accent": fx.accent }}
      />

      {/* Big center card */}
      <div
        key={resetKey}
        className={`action-reveal action-reveal--${phase} action-reveal--${safeCardKey}`}
        style={{ "--fx-color": fx.color, "--fx-accent": fx.accent }}
      >
        {/* Floating glyph above */}
        <span className="action-reveal__glyph" aria-hidden="true">
          {fx.glyph}
        </span>

        {/* Halo */}
        <span className="action-reveal__halo" aria-hidden="true" />

        {/* Card body */}
        <div className="action-reveal__card">
          <img src={url} alt={cardKey} draggable={false} />
        </div>

        {/* Countdown ring (only during nope window) */}
        {nopeRemainingMs != null && (
          <div className="action-reveal__countdown" aria-hidden="true">
            <svg viewBox="0 0 120 120" className="action-reveal__countdown-svg">
              <defs>
                <linearGradient id="ac-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={fx.color} />
                  <stop offset="100%" stopColor={fx.accent} />
                </linearGradient>
              </defs>
              <circle
                className="action-reveal__countdown-track"
                cx="60" cy="60" r="52"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="6"
              />
              <circle
                className="action-reveal__countdown-bar"
                cx="60" cy="60" r="52"
                fill="none"
                stroke="url(#ac-grad)"
                strokeWidth="6"
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                strokeDasharray={`${2 * Math.PI * 52 * ringPct} ${2 * Math.PI * 52}`}
              />
            </svg>
            <span className="action-reveal__countdown-text">{(nopeRemainingMs / 1000).toFixed(1)}s</span>
          </div>
        )}

        {/* Label */}
        <div className="action-reveal__label">
          <span className="action-reveal__name">
            {byMemberName || (isNopeChain ? "Ai đó" : "Bạn")}
          </span>
          <span className="action-reveal__action">
            {isNopeChain ? `${chainCount > 1 ? `lần ${chainCount}` : "vừa"} dùng "Cản"!` : `đã dùng "${cardKey}"`}
          </span>
        </div>

        {/* Nope chain badge */}
        {chainCount > 0 && (
          <span className="action-reveal__chain-badge" aria-hidden="true">
            ×{chainCount}
          </span>
        )}
      </div>
    </>
  );
}