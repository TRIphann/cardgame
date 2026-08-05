// PlayerPickerModal — modal chung để chọn 1 đối thủ trong phòng.
// Dùng cho Favor, Combo2/3. Lọc theo alive + loại bỏ chính mình.
// UX-2 fix: also filter out players with 0 cards for Favor (can't take from empty hand).

import React, { useEffect, useRef } from "react";

export function PlayerPickerModal({
  title = "Chọn đối thủ",
  sub,
  opponents,
  myId,
  onPick,
  onCancel,
  // A11Y-3 fix: indicate whether picking is a Favor (needs cards) or Combo (always valid).
  pickingForFavor = false,
}) {
  const modalRef = useRef(null);
  const titleId = "ppm-title";

  // A11Y-3 fix: ESC key closes the modal.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onCancel?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  // A11Y-3 fix: trap focus inside the modal.
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      }
    };
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, []);

  // UX-2 fix: for Favor, only show players who have at least 1 card.
  // Combo picks are always valid (just take a random card).
  const list = (opponents || []).filter((o) => {
    if (!o.alive || o.id === myId) return false;
    if (pickingForFavor && (o.handCount || 0) === 0) return false;
    return true;
  });

  return (
    <div className="game-modal__scrim player-pick-scrim" onClick={onCancel}>
      <div
        ref={modalRef}
        className="game-modal player-pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="game-modal__close"
          type="button"
          onClick={onCancel}
          aria-label="Đóng"
        >
          ×
        </button>
        <h3 className="game-modal__title" id={titleId}>{title}</h3>
        {sub && <p className="game-modal__sub">{sub}</p>}
        <div className="player-pick-grid">
          {list.length === 0 && (
            <p className="game-modal__sub" style={{ textAlign: "center" }}>
              Không có đối thủ hợp lệ.
            </p>
          )}
          {list.map((o) => (
            <button
              key={o.id}
              type="button"
              className="player-pick-card"
              onClick={() => onPick(o.id)}
              aria-label={`Chọn ${o.name}${o.handCount != null ? `, ${o.handCount} lá trên tay` : ""}`}
            >
              <span className="player-pick-card__avatar">
                {o.name?.[0]?.toUpperCase() || "?"}
              </span>
              <span className="player-pick-card__name">{o.name}</span>
              <span className="player-pick-card__meta">{o.handCount || 0} lá</span>
            </button>
          ))}
        </div>
        <div className="game-modal__actions">
          <button type="button" className="game-action-btn" onClick={onCancel}>Huỷ</button>
        </div>
      </div>
    </div>
  );
}