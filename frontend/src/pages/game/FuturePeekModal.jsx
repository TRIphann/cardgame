// FuturePeekModal — cinematic 3-card reveal.
//
// Per the user-confirmed spec the player can study the 3 cards and the modal
// MUST stay open until either:
//   * the local player's turn timer drops to <= 10s (then we auto-close), or
//   * the player explicitly clicks "Úp xuống & đặt lại" (with a confirm
//     dialog if > 20s remain on the turn clock — the spec says "nếu thời gian
//     còn 20s thì không hiện thông báo đó", meaning ≥20s requires confirm).
//
// When the modal closes the player continues with their normal turn — the
// deck positions are NOT altered (the spec says "Úp xuống & đặt lại", i.e.
// just hide the peek overlay, the cards stay where they were).

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

const FLIP_STAGGER_MS       = 400;  // ms between each card flip (still fast but readable)
const AUTO_CLOSE_SEC       = 10;   // auto-close when turn timer ≤ this
const CONFIRM_THRESHOLD_SEC = 20;  // confirm dialog when turn timer > this

export function FuturePeekModal({ peek, onClose, originRect, turnRemainingSec = 60 }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const modalRef   = useRef(null);
  const confirmRef  = useRef(null);

  // Cascade reveal: one card flips per FLIP_STAGGER_MS.
  useEffect(() => {
    if (!peek || peek.length === 0) return undefined;
    const timers = peek.map((_, idx) =>
      setTimeout(() => setRevealedCount(idx + 1), idx * FLIP_STAGGER_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [peek]);

  // Auto-close when the local player's turn drops to ≤ AUTO_CLOSE_SEC.
  // The actor still keeps their turn clock — closing the peek just hides
  // the overlay, doesn't draw or change anything in the deck.
  useEffect(() => {
    if (!peek || peek.length === 0) return undefined;
    if (typeof turnRemainingSec !== "number") return undefined;
    if (turnRemainingSec > AUTO_CLOSE_SEC) return undefined;
    const t = setTimeout(() => onClose?.(), 50);
    return () => clearTimeout(t);
  }, [peek, turnRemainingSec, onClose]);

  // ESC key: trigger confirm logic or direct close.
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape" && e.key !== "Esc") return;
      if (showConfirm) { setShowConfirm(false); return; }
      if (turnRemainingSec > CONFIRM_THRESHOLD_SEC) {
        setShowConfirm(true);
        setTimeout(() => confirmRef.current?.querySelector("button")?.focus(), 50);
      } else {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showConfirm, turnRemainingSec, onClose]);

  // ESC key: trigger confirm logic or direct close.
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape" && e.key !== "Esc") return;
      if (showConfirm) { setShowConfirm(false); return; }
      if (turnRemainingSec > CONFIRM_THRESHOLD_SEC) {
        setShowConfirm(true);
        setTimeout(() => confirmRef.current?.querySelector("button")?.focus(), 50);
      } else {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showConfirm, turnRemainingSec, onClose]);

  // Focus management for confirm sub-dialog.
  useEffect(() => {
    if (showConfirm) {
      setTimeout(() => confirmRef.current?.querySelector("button")?.focus(), 50);
    } else {
      modalRef.current?.querySelector(".future-peek-info__close")?.focus();
    }
  }, [showConfirm]);

  const cancelConfirm = useCallback(() => {
    setShowConfirm(false);
    setTimeout(() => modalRef.current?.querySelector(".future-peek-info__close")?.focus(), 30);
  }, []);

  if (!peek || peek.length === 0) return null;

  const cardW  = 130;
  const cardH  = 186;
  const vw     = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh     = typeof window !== "undefined" ? window.innerHeight : 720;
  const gap     = 28;
  const totalW  = peek.length * cardW + (peek.length - 1) * gap;
  const startX  = vw / 2 - totalW / 2;
  const baseY   = vh * 0.36;

  // Target positions (where each card lands).
  const targets = peek.map((_, i) => ({
    x: startX + i * (cardW + gap),
    y: baseY,
  }));

  // Source (deck pile rect → originRect prop) → compute fly-from delta.
  // Default: fly in from centre-top if no origin given.
  const flyFromX = originRect
    ? originRect.left + originRect.width / 2 - cardW / 2
    : vw / 2 - cardW / 2;
  const flyFromY = originRect
    ? originRect.top + originRect.height / 2 - cardH / 2
    : vh * 0.55;

  // Floating shimmer particles (fixed set, reused).
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
        Xem trước 3 lá: {peek.map((k, i) => getCardLabel(k).label).join(", ")}. Trái = bạn rút tiếp.
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

      {/* Cards */}
      <div className="future-peek-stage">
        {peek.map((key, i) => {
          const revealed = i < revealedCount;
          return (
            <div
              key={i}
              className={`fp-card${revealed ? " fp-card--revealed" : ""}`}
              style={{
                "--fp-x":       `${targets[i].x}px`,
                "--fp-y":       `${targets[i].y}px`,
                "--fp-fly-x":   `${flyFromX - targets[i].x}px`,
                "--fp-fly-y":   `${flyFromY - targets[i].y}px`,
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
          {turnRemainingSec <= AUTO_CLOSE_SEC
            ? `Còn ${turnRemainingSec}s — sẽ tự đóng sau khi bạn sẵn sàng`
            : turnRemainingSec <= CONFIRM_THRESHOLD_SEC
              ? `Còn ${turnRemainingSec}s — đóng không cần xác nhận`
              : "Lá trái = bạn rút tiếp. Hai lá còn lại = người kế tiếp."}
        </div>
        <button
          type="button"
          className="future-peek-info__close"
          onClick={() => {
            if (turnRemainingSec > CONFIRM_THRESHOLD_SEC) {
              setShowConfirm(true);
              setTimeout(() => confirmRef.current?.querySelector("button")?.focus(), 50);
            } else {
              onClose?.();
            }
          }}
          aria-label="Đóng peek"
          aria-describedby="fpm-desc"
        >
          Úp xuống &amp; đặt lại
        </button>
      </div>

      {/* Confirm sub-dialog */}
      {showConfirm && (
        <div className="game-modal__scrim" role="presentation" onClick={cancelConfirm}>
          <div
            ref={confirmRef}
            className="game-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fpm-confirm-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 360 }}
          >
            <h3 className="game-modal__title" id="fpm-confirm-title">Xác nhận đóng peek?</h3>
            <p className="game-modal__sub">
              Còn <strong>{turnRemainingSec}s</strong> trên lượt. Đóng ngay có thể khiến bạn bỏ lỡ thông tin.
            </p>
            <div className="game-modal__actions">
              <button type="button" className="game-action-btn" onClick={cancelConfirm} autoFocus>
                Ở lại
              </button>
              <button
                type="button"
                className="game-action-btn game-action-btn--danger"
                onClick={() => { setShowConfirm(false); onClose?.(); }}
              >
                Đóng peek
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
