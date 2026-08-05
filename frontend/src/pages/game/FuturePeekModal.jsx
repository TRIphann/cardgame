// FuturePeekModal — 3 lá trên cùng bộ bài chỉ player này nhìn được.
//
// Hiệu ứng: 3 lá bay từ deck pile (originRect) lên giữa màn hình, flip từ
// mặt sau sang mặt trước lần lượt theo stagger. Không border/box/scrim chỉ
// có 3 card image + close button.
//
// F-1 fix: nếu turn timer còn > 20s khi user đóng modal,
// hiện confirm dialog trước khi đóng.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

const REVEAL_INTERVAL_MS = 600;
const TOTAL_HOLD_MS = 4500;
const CONFIRM_THRESHOLD_SEC = 20;

function flightTransform(origin, target, progress) {
  if (!origin || !target) {
    return `translate3d(${target.left}px, ${target.top}px, 0)`;
  }
  const x = origin.left + (target.left - origin.left) * progress;
  const y = origin.top + (target.top - origin.top) * progress;
  const arc = Math.sin(progress * Math.PI) * 80;
  return `translate3d(${x}px, ${y - arc}px, 0)`;
}

export function FuturePeekModal({ peek, onClose, originRect, turnRemainingSec = 60 }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const modalRef = useRef(null);
  const confirmRef = useRef(null);
  const titleId = "fpm-title";
  const descId = "fpm-desc";

  // F-1 fix: close with confirm dialog if >20s remain, otherwise direct close.
  const requestClose = useCallback(() => {
    if (turnRemainingSec > CONFIRM_THRESHOLD_SEC) {
      setShowConfirm(true);
      // Focus the confirm dialog's cancel button
      setTimeout(() => confirmRef.current?.querySelector("button")?.focus(), 50);
    } else {
      onClose?.();
    }
  }, [turnRemainingSec, onClose]);

  // Close the confirm sub-dialog.
  const cancelConfirm = useCallback(() => {
    setShowConfirm(false);
    // Return focus to the close button
    modalRef.current?.querySelector(".future-peek-info__close")?.focus();
  }, []);

  // A11Y: ESC key triggers confirm logic.
  useEffect(() => {
    if (showConfirm) {
      // ESC inside confirm dialog closes the confirm sub-dialog.
      const handler = (e) => {
        if (e.key === "Escape" || e.key === "Esc") cancelConfirm();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
    // ESC outside confirm dialog triggers the close-with-confirm flow.
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") requestClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showConfirm, requestClose, cancelConfirm]);

  // A11Y: auto-focus the close button when modal opens (and not in confirm mode).
  useEffect(() => {
    if (!showConfirm) {
      modalRef.current?.querySelector(".future-peek-info__close")?.focus();
    }
  }, [showConfirm]);

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
    // F-1 fix: the auto-dismiss ALWAYS fires after 4.5s regardless of turn timer.
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

  // Build accessible card descriptions for screen readers.
  const cardDescs = peek.map((key, i) => {
    const meta = getCardLabel(key);
    return `Lá ${i + 1}: ${meta.label}`;
  }).join(". ");

  return (
    <div
      className="future-peek-scene"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      ref={modalRef}
    >
      {/* A11Y-4 fix: visually-hidden text that screen readers announce */}
      <div
        id={descId}
        style={{
          position: "absolute", width: 1, height: 1,
          padding: 0, margin: -1, overflow: "hidden",
          clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
        }}
      >
        {`Xem trước 3 lá trên cùng bộ bài: ${cardDescs}. ${peek.length >= 2 ? `Lá trái = bạn sẽ rút tiếp. Hai lá còn lại = người kế tiếp.` : ""}`}
      </div>

      {/* F-1 fix: confirm sub-dialog when closing early */}
      {showConfirm && (
        <div
          className="game-modal__scrim"
          role="presentation"
          onClick={cancelConfirm}
        >
          <div
            ref={confirmRef}
            className="game-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fpm-confirm-title"
            aria-describedby="fpm-confirm-desc"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 360 }}
          >
            <h3 className="game-modal__title" id="fpm-confirm-title">
              Xác nhận đóng peek?
            </h3>
            <p className="game-modal__sub" id="fpm-confirm-desc">
              Còn <strong>{turnRemainingSec}s</strong> trên lượt của bạn. Đóng bây giờ có thể khiến bạn bỏ lỡ thông tin quan trọng.
            </p>
            <div className="game-modal__actions">
              <button
                type="button"
                className="game-action-btn"
                onClick={cancelConfirm}
                autoFocus
              >
                Ở lại
              </button>
              <button
                type="button"
                className="game-action-btn game-action-btn--danger"
                onClick={() => {
                  setShowConfirm(false);
                  onClose?.();
                }}
              >
                Đóng peek
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="future-peek-info__title" id={titleId}>Xem trước 3 lá</div>
        <div className="future-peek-info__sub">
          Lá trái = bạn sẽ rút tiếp. Hai lá còn lại = người kế tiếp.
          {turnRemainingSec <= CONFIRM_THRESHOLD_SEC && (
            <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 11 }}>
              (còn {turnRemainingSec}s — đóng không cần xác nhận)
            </span>
          )}
        </div>
        <button
          type="button"
          className="future-peek-info__close"
          onClick={requestClose}
          aria-label="Đóng peek"
        >
          Úp xuống &amp; đặt lại theo thứ tự
        </button>
      </div>
    </div>
  );
}
