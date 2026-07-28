// CardActionModal — confirm dialog when player taps a card from their hand.
// Some cards (favor / 2-same combo) require target picking; this modal
// delegates that to the parent onPlay() callback.

import React from "react";

export function CardActionModal({ card, onClose, onConfirm, requiresTarget, opponents, onPickTarget }) {
  if (!card) return null;
  return (
    <div className="game-modal__scrim" onClick={onClose}>
      <div className="game-modal" onClick={(e) => e.stopPropagation()}>
        <button className="game-modal__close" type="button" onClick={onClose} aria-label="Đóng">×</button>
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
  );
}
