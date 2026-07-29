// FuturePeekModal — hiển thị 3 lá trên cùng bộ bài mà chỉ player này nhìn
// được. Theo luật Exploding Kittens: future xem trước thì thấy top-3, đặt
// úp lại theo đúng thứ tự. Thứ tự hiển thị:
//   trái   = lá player sẽ rút nếu rút ngay (ĐẦU bộ bài, tức TakeLast(3)[2])
//   giữa   = lá người tiếp theo sẽ rút nếu player BỎ LƯỢT
//   phải   = lá người 2 lượt sau rút (cuối bộ bài hiện tại)
// Hệ thống không xáo lại — người chơi tự quyết định Skip/Attack dựa trên
// thông tin này.
//
// Lưu ý quan trọng về thứ tự thẻ: server trả `Deck.TakeLast(3).Reverse()`.
// `TakeLast(3)` lấy 3 phần tử CUỐI (top of stack). `Reverse()` đảo lại
// để [0] = lá sẽ rút đầu tiên (trên cùng deck), [1] = lá tiếp theo, [2] = lá
// cuối trong peek. Đây là thứ tự player RÚT.

import React from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

export function FuturePeekModal({ peek, onClose }) {
  if (!peek || peek.length === 0) return null;
  // peek is already in RÚT order: [next, after next, after after next]
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
            return (
              <div key={p.idx} className="future-peek-modal__slot">
                <div className="future-peek-modal__card">
                  <img src={cardImageUrl(key)} alt={meta.label} draggable={false} />
                  <span className="future-peek-modal__card-glow" aria-hidden="true" />
                  <span className="future-peek-modal__card-position">
                    {p.idx + 1}
                  </span>
                </div>
                <div className="future-peek-modal__slot-label">
                  <strong>{p.label}</strong>
                  <span>{p.sub}</span>
                </div>
                <div className="future-peek-modal__slot-key">{key}</div>
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