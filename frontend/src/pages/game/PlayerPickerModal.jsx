// PlayerPickerModal — modal chung để chọn 1 đối thủ trong phòng.
// Dùng cho Favor, Combo2/3. Lọc theo alive + loại bỏ chính mình.

import React from "react";

export function PlayerPickerModal({
  title = "Chọn đối thủ",
  sub,
  opponents,
  myId,
  onPick,
  onCancel,
}) {
  const list = (opponents || []).filter((o) => o.alive && o.id !== myId);
  return (
    <div className="game-modal__scrim player-pick-scrim" onClick={onCancel}>
      <div
        className="game-modal player-pick-modal"
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
        <h3 className="game-modal__title">{title}</h3>
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