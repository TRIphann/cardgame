// FuturePeekModal — 3 lá trên cùng bộ bài chỉ player này nhìn được.
//
// 3 lá flip từ mặt sau (`back`) sang mặt trước (3 card image) lần lượt
// theo stagger 250ms. Không border, không box — chỉ card image và label
// phía dưới.

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

export function FuturePeekModal({ peek, onClose }) {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (!peek || peek.length === 0) return;
    const timers = peek.map((_, idx) =>
      setTimeout(() => setRevealedCount((c) => Math.max(c, idx + 1)), 400 + idx * 600)
    );
    return () => timers.forEach(clearTimeout);
  }, [peek]);

  if (!peek || peek.length === 0) return null;

  const positions = [
    { idx: 0, label: "Rút tiếp",  sub: "Lá bạn sẽ rút nếu rút ngay" },
    { idx: 1, label: "Lượt sau",  sub: "Lá người kế tiếp rút (nếu bạn bỏ)" },
    { idx: 2, label: "2 lượt sau", sub: "Lá người 2 turn sau rút" },
  ];

  return (
    <div className="game-modal__scrim future-peek-scrim" onClick={onClose}>
      <div
        className="game-modal future-peek-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ "--fx-color": "#9a78ff", "--fx-accent": "#cdb9ff" }}
      >
        <button
          className="game-modal__close"
          type="button"
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>
        <div className="future-peek-modal__icon" aria-hidden="true">◉</div>
        <h3 className="game-modal__title">Xem trước 3 lá</h3>
        <p className="game-modal__sub">
          Chỉ bạn mới thấy — đếm từ đầu bộ bài (lá sẽ rút tiếp).
        </p>

        <div className="future-peek-modal__row">
          {positions.map((p) => {
            const key = peek[p.idx];
            if (!key) return null;
            const meta = getCardLabel(key);
            const revealed = p.idx < revealedCount;
            return (
              <div
                key={p.idx}
                className={`future-peek-slot${revealed ? " future-peek-slot--revealed" : ""}`}
                style={{ "--reveal-delay": `${p.idx * 0.6}s` }}
              >
                <div className="future-peek-slot__card-wrap">
                  <div className="future-peek-slot__inner">
                    <div className="future-peek-slot__face future-peek-slot__face--back">
                      <img src={cardImageUrl("back")} alt="" draggable={false} />
                    </div>
                    <div className="future-peek-slot__face future-peek-slot__face--front">
                      <img src={cardImageUrl(key)} alt={meta.label} draggable={false} />
                    </div>
                  </div>
                  <span className="future-peek-slot__position">{p.idx + 1}</span>
                </div>
                <div className="future-peek-slot__label">
                  <strong>{p.label}</strong>
                  <span>{p.sub}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="game-modal__actions">
          <button type="button" className="game-action-btn game-action-btn--primary" onClick={onClose}>
            Úp xuống & đặt lại theo thứ tự
          </button>
        </div>
      </div>
    </div>
  );
}