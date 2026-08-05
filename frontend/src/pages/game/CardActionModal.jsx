// CardActionModal — cinematic xác nhận đánh bài. Hiển thị card art lớn, tên
// + mô tả, hiệu ứng nền theo loại (glow ring tinted theo card key), floating
// glyphs đặc trưng (attack → ⚔, future → ◉, v.v.).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { fxFor } from "./cardFx.js";

export function CardActionModal({
  card, onClose, onConfirm, requiresTarget, opponents, onPickTarget,
}) {
  const fx = useMemo(() => fxFor(card?.key || "general"), [card?.key]);
  // UX-1 fix: guard against double-clicking a target button before the
  // request resolves. The parent handles the actual flow; we just disable
  // after the first click.
  const [pickedId, setPickedId] = useState(null);
  const handlePick = useCallback((id) => {
    if (pickedId !== null) return;
    setPickedId(id);
    onPickTarget(id);
  }, [pickedId, onPickTarget]);

  // A11Y-3 fix: ESC key + focus trap + role="dialog".
  const modalRef = useRef(null);
  const titleId = "cam-title";
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

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

  if (!card) return null;
  const url = cardImageUrl(card.key);

  return (
    <div className="game-modal__scrim card-action-scrim" onClick={onClose}>
      {/* Backdrop colored by card fx */}
      <div
        className="card-action-modal__backdrop"
        style={{
          "--fx-color": fx.color,
          "--fx-accent": fx.accent,
        }}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        className={`game-modal card-action-modal card-action-modal--${card.key}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{ "--fx-color": fx.color, "--fx-accent": fx.accent }}
      >
        <button className="game-modal__close" type="button" onClick={onClose} aria-label="Đóng">×</button>
        <div className="card-action-modal__layout">
          <div className="card-action-modal__art">
            <img src={url} alt={card.label || card.key} draggable={false} />
            <span className="card-action-modal__art-glow" aria-hidden="true" />
            <span className="card-action-modal__art-glyph" aria-hidden="true">{fx.glyph}</span>
          </div>
          <div className="card-action-modal__body">
            <h3 className="game-modal__title" id={titleId}>Dùng lá: {card.label || card.key}</h3>
            <p className="game-modal__sub">{card.description || "Xác nhận để sử dụng."}</p>

            {requiresTarget && (
              <>
                <p style={{ fontSize: 12, opacity: 0.7 }}>Chọn đối thủ:</p>
                <div className="combo-grid">
                  {(opponents || [])
                    .filter((o) => o.alive)
                    .map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="combo-card"
                        disabled={pickedId !== null}
                        aria-disabled={pickedId !== null}
                        aria-label={`Chọn ${o.name}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cinzel, serif" }}
                        onClick={() => handlePick(o.id)}
                      >
                        {o.name}
                      </button>
                    ))}
                </div>
              </>
            )}

            {!requiresTarget && (
              <div className="game-modal__actions">
                <button type="button" className="game-action-btn" onClick={onClose}>Huỷ</button>
                <button type="button" className="game-action-btn game-action-btn--primary" onClick={onConfirm}>
                  Xác nhận
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}