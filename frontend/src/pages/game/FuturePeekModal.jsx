//
// Per the user-confirmed spec (unified 10s rule):
//   1. Modal opens with ALL 3 cards face-down (no peeking during mandatory wait)
//   2. After a mandatory 10-second viewing period, cards flip one by one (400ms stagger)
//   3. ALL game actions are blocked while the modal is open
//   4. Modal auto-closes when turn timer ≤ 10s (i.e. when the parent budget runs out)
//   5. Player can close early by clicking "Úp xuống & đặt lại"

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

// Mirrors GameService.FuturePeekSeconds (10). When the mandatory wait
// elapses the Future modal hands control back to the parent, which then
// resets the turn timer back to 10 seconds (TURN_TIME_LIMIT_SEC).
const MANDATORY_VIEW_MS = 10_000; // 10 seconds: all cards face-down
const FLIP_STAGGER_MS   = 400;    // ms between each card flip
const AUTO_CLOSE_SEC    = 10;     // auto-close when turn timer ≤ this

export function FuturePeekModal({ peek, onClose, originRect, turnRemainingSec = 10 }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [isLocked, setIsLocked] = useState(true); // true = face-down wait phase
  const modalRef = useRef(null);

  // Phase 1 → Phase 2: after mandatory wait, start flipping cards
  useEffect(() => {
    if (!peek || peek.length === 0) return undefined;
    setIsLocked(true);
    setRevealedCount(0);
    const unlockT = setTimeout(() => {
      setIsLocked(false);
      const timers = peek.map((_, idx) =>
        setTimeout(() => setRevealedCount(idx + 1), idx * FLIP_STAGGER_MS)
      );
      return () => timers.forEach(clearTimeout);
    }, MANDATORY_VIEW_MS);
    return () => clearTimeout(unlockT);
  }, [peek]);

  // Auto-close when turn timer ≤ AUTO_CLOSE_SEC
  useEffect(() => {
    if (!peek || peek.length === 0) return undefined;
    if (typeof turnRemainingSec !== "number") return undefined;
    if (turnRemainingSec > AUTO_CLOSE_SEC) return undefined;
    const t = setTimeout(() => onClose?.(), 50);
    return () => clearTimeout(t);
  }, [peek, turnRemainingSec, onClose]);

  // ESC key: close instantly
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape" && e.key !== "Esc") return;
      onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!peek || peek.length === 0) return null;

  const cardW  = 130;
  const cardH  = 186;
  const vw     = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh     = typeof window !== "undefined" ? window.innerHeight : 720;
  const gap    = 28;
  const totalW = peek.length * cardW + (peek.length - 1) * gap;
  const targetX = vw / 2 - totalW / 2;
  const targetY = vh * 0.36;

  const flyFromX = originRect
    ? originRect.left + originRect.width / 2 - cardW / 2
    : vw / 2 - cardW / 2;
  const flyFromY = originRect
    ? originRect.top + originRect.height / 2 - cardH / 2
    : vh * 0.5;

  const shimmerN = 8;
  const shimmers = Array.from({ length: shimmerN }).map((_, i) => ({
    i,
    baseX: vw / 2 - 180 + (i % 4) * 90,
    baseY: vh * 0.28 + Math.floor(i / 4) * 120,
    delay: i * 280,
  }));

  return (
    <div ref={modalRef} className="future-peek-scene" role="dialog" aria-modal="true">
      {/* A11Y: visually hidden */}
      <div id="fpm-desc" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
        Xem trước 3 lá: {peek.map((k) => getCardLabel(k).label).join(", ")}. Trái = bạn rút tiếp.
      </div>

      {/* Purple glow backdrop */}
      <div className="future-peek-glow-backdrop" aria-hidden="true" />

      {/* Floating shimmer particles */}
      {shimmers.map((s) => (
        <div
          key={s.i}
          className="fp-particle"
          style={{
            left: s.baseX,
            top:  s.baseY,
            animationDelay: `${s.delay}ms`,
          }}
        />
      ))}

      {/* Cards — all face-down during mandatory wait, then flip one by one */}
      <div className="future-peek-stage">
        {peek.map((key, i) => {
          // When locked: no card is revealed yet (all face-down)
          // When unlocked: cards flip based on revealedCount
          const revealed = !isLocked && i < revealedCount;
          const cardX = targetX + i * (cardW + gap);
          const cardY = targetY;
          return (
            <div
              key={i}
              className={`fp-card${revealed ? " fp-card--revealed" : ""}${isLocked ? " fp-card--locked" : ""}`}
              style={{
                left: `${cardX}px`,
                top: `${cardY}px`,
                "--fp-fly-x": `${flyFromX - cardX}px`,
                "--fp-fly-y": `${flyFromY - cardY}px`,
                animationDelay: `${i * 80}ms`,
                zIndex: 246 + i,
              }}
            >
              <div className="fp-card__inner">
                <div className="fp-card__face fp-card__face--back">
                  <img src={cardImageUrl("back")} alt="" draggable={false} />
                </div>
                <div className="fp-card__face fp-card__face--front">
                  <img src={cardImageUrl(key) || cardImageUrl("back")} alt={getCardLabel(key).label} draggable={false} />
                </div>
              </div>
              <div className="fp-card__halo" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      {/* Info pill */}
      <div className="future-peek-info">
        <div className="future-peek-info__title">Xem trước 3 lá</div>
        <div className="future-peek-info__sub">
          {isLocked
            ? `Đang xào bài… chờ ${Math.ceil(MANDATORY_VIEW_MS / 1000)}s`
            : turnRemainingSec <= AUTO_CLOSE_SEC
              ? `Còn ${turnRemainingSec}s — sẽ tự đóng`
              : "Lá trái = bạn rút tiếp. Hai lá còn lại = người kế tiếp."}
        </div>
        {!isLocked && (
          <button
            type="button"
          className="future-peek-info__close"
          onClick={() => onClose?.()}
          aria-label="Đóng peek"
          aria-describedby="fpm-desc"
        >
          Úp xuống &amp; đặt lại
        </button>
        )}
      </div>
    </div>
  );
}
