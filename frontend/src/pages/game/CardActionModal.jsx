// CardActionModal — cinematic xác nhận đánh bài. Hiển thị card art lớn, tên
// + mô tả, hiệu ứng nền theo loại (glow ring tinted theo card key), floating
// glyphs đặc trưng (attack → ⚔, future → ◉, v.v.).

import React, { useMemo } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { fxFor } from "./cardFx.js";

export function CardActionModal({
  card, onClose, onConfirm, requiresTarget, opponents, onPickTarget,
}) {
  const fx = useMemo(() => fxFor(card?.key || "general"), [card?.key]);
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
        className={`game-modal card-action-modal card-action-modal--${card.key}`}
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
            <h3 className="game-modal__title">Dùng lá: {card.label || card.key}</h3>
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
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cinzel, serif" }}
                        onClick={() => onPickTarget(o.id)}
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