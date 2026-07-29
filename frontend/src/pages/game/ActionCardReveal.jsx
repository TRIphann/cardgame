// ActionCardReveal — premium cinematic overlay hiển thị lá bài vừa được
// đánh lên GIỮA MÀN HÌNH rất lớn, đảm bảo tất cả người chơi đều thấy rõ.
//
// 3 phases:
//   enter: card bay từ deck lên giữa, scale up + halo expansion
//   hold:  full size + breathing pulse + countdown ring + label
//   exit:  card shrink fade xuống rồi unmount
//
// Reset triggers: key thay đổi (LastPlayedAt mới) → remount với phase mới.

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { fxFor } from "./cardFx.js";
import { getCardLabel } from "./cardLabels.js";

const ENTER_MS = 420;
const EXIT_MS = 360;

export function ActionCardReveal({
  cardKey,
  byMemberName,
  isNopeChain,
  chainCount,
  nopeRemainingMs,
  onComplete,
}) {
  const [phase, setPhase] = useState("enter");
  const [mounted, setMounted] = useState(true);

  const fx = fxFor(cardKey || "general");
  const safeCardKey = cardKey || "general";
  const url = cardImageUrl(safeCardKey);
  const meta = getCardLabel(safeCardKey);

  useEffect(() => {
    setPhase("enter");
    const t1 = setTimeout(() => setPhase("hold"), ENTER_MS);
    return () => clearTimeout(t1);
  }, []);

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

  const ringPct = nopeRemainingMs != null
    ? Math.max(0, Math.min(1, nopeRemainingMs / 3000))
    : 0;

  return (
    <>
      {/* Backdrop — radial color tint per card type with animated gradient */}
      <div
        className={`action-reveal__scrim action-reveal__scrim--${phase} action-reveal__scrim--${safeCardKey}`}
        aria-hidden="true"
        style={{ "--fx-color": fx.color, "--fx-accent": fx.accent }}
      />

      {/* Rotating radial burst behind card */}
      <div
        className={`action-reveal__rays action-reveal__rays--${phase}`}
        aria-hidden="true"
        style={{ "--fx-color": fx.color }}
      />

      {/* Main card reveal — large, centered, always visible */}
      <div
        className={`action-reveal action-reveal--${phase} action-reveal--${safeCardKey}`}
        style={{ "--fx-color": fx.color, "--fx-accent": fx.accent }}
      >
        {/* Outer pulsing ring */}
        <span className="action-reveal__pulse-ring" aria-hidden="true" />
        <span className="action-reveal__pulse-ring action-reveal__pulse-ring--2" aria-hidden="true" />

        {/* Big glyph floating above */}
        <span className="action-reveal__glyph" aria-hidden="true">
          {fx.glyph}
        </span>

        {/* Color-tinted halo */}
        <span className="action-reveal__halo" aria-hidden="true" />

        {/* Light beams emanating */}
        <span className="action-reveal__beam action-reveal__beam--1" aria-hidden="true" />
        <span className="action-reveal__beam action-reveal__beam--2" aria-hidden="true" />
        <span className="action-reveal__beam action-reveal__beam--3" aria-hidden="true" />

        {/* The card itself — LARGE */}
        <div className="action-reveal__card">
          <img src={url} alt={meta.label} draggable={false} />
          <span className="action-reveal__card-shine" aria-hidden="true" />
          <span className="action-reveal__card-glow" aria-hidden="true" />
        </div>

        {/* Countdown ring */}
        {nopeRemainingMs != null && (
          <div className="action-reveal__countdown" aria-hidden="true">
            <svg viewBox="0 0 160 160" className="action-reveal__countdown-svg">
              <defs>
                <linearGradient id={`ac-grad-${safeCardKey}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={fx.color} />
                  <stop offset="100%" stopColor={fx.accent} />
                </linearGradient>
              </defs>
              <circle
                className="action-reveal__countdown-track"
                cx="80" cy="80" r="72"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              <circle
                className="action-reveal__countdown-bar"
                cx="80" cy="80" r="72"
                fill="none"
                stroke={`url(#ac-grad-${safeCardKey})`}
                strokeWidth="8"
                strokeLinecap="round"
                transform="rotate(-90 80 80)"
                strokeDasharray={`${2 * Math.PI * 72 * ringPct} ${2 * Math.PI * 72}`}
              />
            </svg>
            <span className="action-reveal__countdown-text">{(nopeRemainingMs / 1000).toFixed(1)}s</span>
          </div>
        )}

        {/* Bottom label — name + action text */}
        <div className="action-reveal__label">
          <span className="action-reveal__name">
            {byMemberName || (isNopeChain ? "Ai đó" : "Bạn")}
          </span>
          <span className="action-reveal__action">
            {isNopeChain
              ? `đã dùng "Cản"${chainCount > 1 ? ` × ${chainCount}` : ""}!`
              : `đã dùng "${meta.label}"`}
          </span>
        </div>

        {/* Nope chain badge */}
        {chainCount > 1 && (
          <span className="action-reveal__chain-badge" aria-hidden="true">
            ×{chainCount}
          </span>
        )}
      </div>
    </>
  );
}