// ComboModal — used by 2-same (random-pick from target's face-down hand)
// and 5-any (pick from discard pile). Shown after the actor already chose
// a target.

import React from "react";
import { CARD_CLOUDINARY } from "@games/exploding-cats/cardCloudinary.js";

function urlFor(key) {
  return CARD_CLOUDINARY.cards[key] || "";
}

export function ComboModal({ kind, targetName, handCards, discardPile, onPick, onCancel }) {
  if (kind === "TwoSame") {
    return (
      <div className="game-modal__scrim">
        <div className="game-modal">
          <h3 className="game-modal__title">Lấy 1 lá từ {targetName}</h3>
          <p className="game-modal__sub">Mặt bài úp xuống. Bạn chọn 1, các lá còn lại quay về tay đối thủ.</p>
          <div className="combo-grid">
            {handCards.map((key, i) => (
              <button
                key={i}
                type="button"
                className="combo-card combo-card--face-down"
                onClick={() => onPick(key)}
                aria-label={`Lá ${i + 1}`}
              >?</button>
            ))}
          </div>
          <div className="game-modal__actions">
            <button type="button" className="game-action-btn" onClick={onCancel}>Huỷ</button>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "ThreeSame") {
    return (
      <div className="game-modal__scrim">
        <div className="game-modal">
          <h3 className="game-modal__title">Chỉ định lá muốn lấy từ {targetName}</h3>
          <p className="game-modal__sub">Nếu đối thủ không có lá đó thì hành động không có tác dụng.</p>
          <div className="combo-grid">
            {handCards.map((key, i) => {
              const url = urlFor(key);
              return (
                <button
                  key={i}
                  type="button"
                  className="combo-card"
                  onClick={() => onPick(key)}
                >
                  {url ? <img src={url} alt={key} /> : key}
                </button>
              );
            })}
          </div>
          <div className="game-modal__actions">
            <button type="button" className="game-action-btn" onClick={onCancel}>Bỏ qua</button>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "FiveAny") {
    if (!discardPile || discardPile.length === 0) {
      return (
        <div className="game-modal__scrim">
          <div className="game-modal">
            <h3 className="game-modal__title">Chọn 1 lá từ chồng bỏ</h3>
            <p className="game-modal__sub">Chồng bỏ trống — không thể dùng combo 5-any.</p>
            <div className="game-modal__actions">
              <button type="button" className="game-action-btn" onClick={onCancel}>Đóng</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="game-modal__scrim">
        <div className="game-modal">
          <h3 className="game-modal__title">Chọn 1 lá từ chồng bỏ</h3>
          <p className="game-modal__sub">Lá bạn chọn sẽ về tay bạn.</p>
          <div className="discard-picker">
            {discardPile.map((key, i) => {
              const url = urlFor(key);
              return (
                <button
                  key={`${i}-${key}`}
                  type="button"
                  className="combo-card"
                  onClick={() => onPick(key)}
                >
                  {url ? <img src={url} alt={key} /> : key}
                </button>
              );
            })}
          </div>
          <div className="game-modal__actions">
            <button type="button" className="game-action-btn" onClick={onCancel}>Bỏ qua</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
