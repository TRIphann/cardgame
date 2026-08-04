// FuturePeekModal — 3 lá trên cùng bộ bài chỉ player này nhìn được.
//
// Hiệu ứng: 3 lá bay từ deck pile (originRect) lên giữa màn hình, flip từ
// mặt sau sang mặt trước lần lượt theo stagger. Không border/box/scrim chỉ
// có 3 card image + close button.

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

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

export function FuturePeekModal({ peek, onClose, originRect }) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (!peek || peek.length === 0) return undefined;
    // Reveal cards one at a time so the user sees the flip cascade.
    const timers = peek.map((_, idx) =>
      setTimeout(() => setRevealedCount((c) => Math.max(c, idx + 1)),
        500 + idx * REVEAL_INTERVAL_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [peek]);

  useEffect(() => {
    if (!peek || peek.length === 0) return undefined;
    // Auto-dismiss after the hold window closes (4.5s after the last flip).
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
    top: baseY,
  }));

  return (
    <div className="future-peek-scene" aria-modal="true" role="dialog">
      <div className="future-peek-stage">
        {peek.map((key, i) => {
          const target = targets[i];
          const revealed = i < revealedCount;
          const arrivalProgress = Math.min(1, revealedCount - i > 0 ? 1 : 0);
          const transform = flightTransform(originRect, target, arrivalProgress);
          const meta = getCardLabel(key);
          return (
            <div
              key={i}
              className={`future-peek-card${revealed ? " future-peek-card--revealed" : ""}`}
              style={{
                "--card-w": `${cardW}px`,
                "--card-h": `${cardH}px`,
                "--fly-x": `${target.left}px`,
                "--fly-y": `${target.top}px`,
                transform,
                zIndex: 30 + i,
              }}
              aria-hidden="true"
            >
              <div className="future-peek-card__inner">
                <div className="future-peek-card__face future-peek-card__face--back">
                  <img src={cardImageUrl("back")} alt="" draggable={false} />
                </div>
                <div className="future-peek-card__face future-peek-card__face--front">
                  <img src={cardImageUrl(key) || cardImageUrl("back")} alt={meta.label} draggable={false} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="future-peek-info">
        <div className="future-peek-info__title">Xem trước 3 lá</div>
        <div className="future-peek-info__sub">
          Lá trái = bạn sẽ rút tiếp. Hai lá còn lại = người kế tiếp.
        </div>
        <button
          type="button"
          className="future-peek-info__close"
          onClick={() => onClose?.()}
        >
          Úp xuống &amp; đặt lại theo thứ tự
        </button>
      </div>
    </div>
  );
}
