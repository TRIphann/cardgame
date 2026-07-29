// DefuseModal — cinematic Cứu bom! Modal hiển thị với hiệu ứng rung nhẹ,
// bomb glyph nhịp đập cảnh báo, và sparkles bay ra từ rìa modal. Player chọn
// slot (0..5) để đặt bom trở lại chồng bài.

import React, { useEffect, useState } from "react";
import { FxBurst } from "./FxBurst.jsx";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const SLOTS = [0, 1, 2, 3, 4, 5];

export function DefuseModal({ onConfirm, onSkip }) {
  // Always show slots 0–5. Server clamps the value anyway.
  const [tickKey, setTickKey] = useState(0);
  // Trigger sparkle bursts periodically (every ~1.4s) on the modal edge.
  useEffect(() => {
    const id = setInterval(() => setTickKey((k) => k + 1), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="game-modal__scrim defuse-scrim">
      <div className="game-modal defuse-modal">
        <div className="defuse-modal__bomb" aria-hidden="true">
          <img src={cardImageUrl("bomb")} alt="" draggable={false} />
          <span className="defuse-modal__bomb-pulse" />
          <span className="defuse-modal__bomb-pulse defuse-modal__bomb-pulse--late" />
        </div>
        <h3 className="game-modal__title defuse-modal__title">
          <span className="defuse-modal__title-glyph" aria-hidden="true">💣</span>
          Cứu bom!
        </h3>
        <p className="game-modal__sub">
          Chọn vị trí đặt bom trở lại vào chồng bài (0 = trên cùng, 5 = sâu hơn).
        </p>
        <div className="defuse-slots">
          {SLOTS.map((s) => {
            const usable = true; // server clamps; always show all slots
            return (
              <button
                key={s}
                type="button"
                className={`defuse-slot${usable ? "" : " defuse-slot--disabled"}`}
                disabled={!usable ? true : undefined}
                onClick={usable ? () => onConfirm(s) : undefined}
              >
                <span className="defuse-slot__num">{s}</span>
                <span className="defuse-slot__hint">{s === 0 ? "Đỉnh" : s === 5 ? "Đáy" : ""}</span>
                <span className="defuse-slot__beam" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="game-modal__actions">
          <button type="button" className="game-action-btn" onClick={onSkip}>
            Đặt cuối
          </button>
        </div>
      </div>

      {/* Periodic sparkle bursts at random modal corners */}
      {[0, 1].map((corner) => (
        <FxBurst
          key={`${corner}-${tickKey}`}
          anchor={
            corner === 0
              ? { x: window.innerWidth / 2 - 220, y: window.innerHeight / 2 - 120 }
              : { x: window.innerWidth / 2 + 220, y: window.innerHeight / 2 + 120 }
          }
          fxKey="bomb"
          size="md"
          id={`defuse-tick-${corner}`}
        />
      ))}
    </div>
  );
}