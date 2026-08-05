// CardPickModal — modal chung để chọn 1 lá từ 1 danh sách khóa cho trước.
// Được dùng cho:
//   • Favor — phase 2: chọn 1 lá từ tay đã xáo của đối thủ
//   • Combo3: chọn 1 lá bất kỳ từ cloudinary public catalogue
//   • Combo5: chọn 1 lá unique trong chồng bỏ
//
// Props:
//   title       — tiêu đề modal
//   sub         — phụ đề (giải thích)
//   candidates  — danh sách card key để chọn
//   onPick      — (key) => void
//   onCancel    — () => void

import React, { useEffect, useRef } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

export function CardPickModal({
  title,
  sub,
  candidates,
  onPick,
  onCancel,
  fxColor = "#ffd86b",
  fxAccent = "#a4f2dc",
}) {
  if (!candidates) return null;
  const list = Array.from(new Set(candidates));
  const modalRef = useRef(null);
  const titleId = "cpm-title";

  // A11Y: ESC key + focus trap + role="dialog".
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onCancel?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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

  return (
    <div className="game-modal__scrim card-pick-scrim" onClick={onCancel}>
      <div
        ref={modalRef}
        className="game-modal card-pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{ "--fx-color": fxColor, "--fx-accent": fxAccent }}
      >
        <button
          className="game-modal__close"
          type="button"
          onClick={onCancel}
          aria-label="Đóng"
        >
          ×
        </button>
        <h3 className="game-modal__title" id={titleId}>{title || "Chọn 1 lá"}</h3>
        {sub && <p className="game-modal__sub">{sub}</p>}

        <div className="card-pick-grid">
          {list.length === 0 && (
            <p className="game-modal__sub" style={{ textAlign: "center" }}>
              Không có lá nào khả dụng.
            </p>
          )}
          {list.map((key) => {
            const meta = getCardLabel(key);
            return (
              <button
                key={key}
                type="button"
                className={`card-pick-card card-pick-card--${key}`}
                onClick={() => onPick(key)}
                title={meta.label}
                aria-label={`Chọn lá ${meta.label}`}
              >
                <img src={cardImageUrl(key)} alt={meta.label} draggable={false} />
                <span className="card-pick-card__glow" aria-hidden="true" />
                <span className="card-pick-card__name">{meta.label}</span>
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