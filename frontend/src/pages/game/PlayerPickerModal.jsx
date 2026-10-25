// PlayerPickerModal — modal chung để chọn 1 đối thủ trong phòng.
// Dùng cho Favor, Combo2/3. Lọc theo alive + loại bỏ chính mình.
//
// Favor picks: show all alive opponents even if their handCount is 0 (per
// user request — they want to see who has cards vs. who doesn't, and
// clicking a 0-card player should show a toast instead of silently doing
// nothing). Combo picks still filter out 0-card targets (combo always
// steals something — leaving them off the list avoids click confusion).

import React, { useEffect, useRef } from "react";

export function PlayerPickerModal({
  title = "Chọn đối thủ",
  sub,
  opponents,
  myId,
  onPick,
  onCancel,
  pickingForFavor = false,
}) {
  const modalRef = useRef(null);
  const titleId = "ppm-title";

  // A11Y: ESC closes the modal.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onCancel?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  // Focus trap inside the modal.
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

  // Combo picks filter 0-card opponents; Favor picks show everyone so the
  // player can SEE who has cards (and gets a friendly toast if they pick
  // someone empty-handed).
  const list = (opponents || []).filter((o) => {
    if (!o.alive || o.id === myId) return false;
    if (!pickingForFavor && (o.handCount || 0) === 0) return false;
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
          {list.map((o) => {
            const isEmpty = (o.handCount || 0) === 0;
            return (
              <button
                key={o.id}
                type="button"
                className={
                  "player-pick-card" +
                  (pickingForFavor && isEmpty ? " player-pick-card--empty" : "")
                }
                title={
                  pickingForFavor && isEmpty
                    ? `${o.name} đang không có lá bài nào trên tay — không thể Xin.`
                    : undefined
                }
                onClick={() => {
                  if (pickingForFavor && isEmpty) {
                    // Don't silently fail. Server-side would 400 with
                    // "target_empty" — match that here so the player sees
                    // the same constraint pre-flight.
                    onPick?.(o.id, { emptyTarget: true });
                    return;
                  }
                  onPick?.(o.id);
                }}
                aria-label={`Chọn ${o.name}${o.handCount != null ? `, ${o.handCount} lá trên tay` : ""}`}
              >
                <span className="player-pick-card__avatar">
                  {o.name?.[0]?.toUpperCase() || "?"}
                </span>
                <span className="player-pick-card__name">{o.name}</span>
                <span className="player-pick-card__meta">
                  {isEmpty
                    ? "0 lá — không thể chọn"
                    : `${o.handCount || 0} lá`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="game-modal__actions">
          <button type="button" className="game-action-btn" onClick={onCancel}>Huỷ</button>
        </div>
      </div>
    </div>
  );
}
