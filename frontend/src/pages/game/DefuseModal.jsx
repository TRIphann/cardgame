// DefuseModal — appears when the player draws a bomb and has a defuse.
// 6 slot buttons (0..5) let the player choose where in the deck to insert
// the bomb back. Slot N means "N cards from the top of the deck".

import React from "react";

const SLOTS = [0, 1, 2, 3, 4, 5];

export function DefuseModal({ deckSize, onConfirm, onSkip }) {
  const maxSlot = Math.min(deckSize, 5);
  return (
    <div className="game-modal__scrim">
      <div className="game-modal">
        <h3 className="game-modal__title">Cứu bom!</h3>
        <p className="game-modal__sub">Chọn vị trí đặt bom trở lại vào chồng bài (0 = trên cùng, 5 = sâu hơn).</p>
        <div className="defuse-slots">
          {SLOTS.map((s) => {
            const usable = s <= maxSlot;
            return (
              <button
                key={s}
                type="button"
                className={`defuse-slot${usable ? "" : " defuse-slot--disabled"}`}
                disabled={!usable}
                onClick={usable ? () => onConfirm(s) : undefined}
              >
                {s}
              </button>
            );
          })}
        </div>
        <div className="game-modal__actions">
          <button type="button" className="game-action-btn" onClick={onSkip}>Đặt cuối</button>
        </div>
      </div>
    </div>
  );
}
