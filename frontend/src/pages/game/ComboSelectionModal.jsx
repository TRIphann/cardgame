// ComboSelectionModal — lets player choose between 2-card, 3-card, or 5-card combo.
// Shows when clicking a combo card (ninja, superman, etc.) if multiple combo types are available.
//
// Unified 10-second rule: this picker auto-cancels after 10s so the
// parent turn budget (GameService.PickerTimeoutSeconds) is never
// exceeded. If the modal times out the combo card stays in the player's
// hand and the game continues with whatever else they choose.

import React, { useEffect, useRef, useState } from "react";
import { getCardLabel } from "./cardLabels.js";

// Mirrors GameService.PickerTimeoutSeconds (10).
const PICKER_TIMEOUT_SEC = 10;

export function ComboSelectionModal({
  cardKey,        // The combo card key (ninja, superman, etc.)
  comboCounts,     // { two: number, three: number, five: number } - how many of each type available
  onSelect,        // (comboKind: 'TwoSame' | 'ThreeSame' | 'FiveAny') => void
  onCancel,        // () => void
}) {
  const modalRef = useRef(null);
  const [, setTick] = useState(0);
  const [timeLeft, setTimeLeft] = useState(PICKER_TIMEOUT_SEC);

  // Auto-cancel after the unified 10s picker timeout.
  useEffect(() => {
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    const guard = setTimeout(() => onCancel?.(), PICKER_TIMEOUT_SEC * 1000);
    return () => {
      clearInterval(id);
      clearTimeout(guard);
    };
  }, [onCancel]);

  // Pulse animation for the modal
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const cardLabel = getCardLabel(cardKey);
  const canDoTwo = comboCounts.two >= 2;
  const canDoThree = comboCounts.three >= 3;
  const canDoFive = comboCounts.five >= 5;

  // Focus trap
  useEffect(() => {
    modalRef.current?.querySelector("button")?.focus();
  }, []);

  // ESC to cancel
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onCancel?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="game-modal__scrim"
      role="presentation"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className="game-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="combo-title"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 420,
          textAlign: "center",
          padding: "28px 32px",
        }}
      >
        <h3 className="game-modal__title" id="combo-title">
          Dùng combo: {cardLabel?.label || cardKey}
        </h3>

        <span
          className="game-modal__timer"
          aria-label={`Còn ${timeLeft}s`}
          title={`Tự đóng sau ${timeLeft}s`}
        >
          ⏱ {timeLeft}s
        </span>

        <p className="game-modal__sub" style={{ marginBottom: 20 }}>
          Chọn loại combo muốn sử dụng:
        </p>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 20,
        }}>
          {/* Combo 5 - any 5 combo cards */}
          <button
            type="button"
            className={`combo-option-btn${!canDoFive ? " combo-option-btn--disabled" : ""}`}
            disabled={!canDoFive}
            onClick={() => canDoFive && onSelect("FiveAny")}
          >
            <span className="combo-option-btn__num">5</span>
            <span className="combo-option-btn__label">
              Combo 5 lá bất kỳ
            </span>
            <span className="combo-option-btn__desc">
              Lấy 1 lá từ chồng bỏ
            </span>
          </button>

          {/* Combo 3 - 3 lá cùng loại */}
          <button
            type="button"
            className={`combo-option-btn${!canDoThree ? " combo-option-btn--disabled" : ""}`}
            disabled={!canDoThree}
            onClick={() => canDoThree && onSelect("ThreeSame")}
          >
            <span className="combo-option-btn__num">3</span>
            <span className="combo-option-btn__label">
              Combo 3 lá cùng loại
            </span>
            <span className="combo-option-btn__desc">
              Yêu cầu đối thủ đưa 1 lá chỉ định
            </span>
          </button>

          {/* Combo 2 - 2 lá cùng loại */}
          <button
            type="button"
            className={`combo-option-btn${!canDoTwo ? " combo-option-btn--disabled" : ""}`}
            disabled={!canDoTwo}
            onClick={() => canDoTwo && onSelect("TwoSame")}
          >
            <span className="combo-option-btn__num">2</span>
            <span className="combo-option-btn__label">
              Combo 2 lá cùng loại
            </span>
            <span className="combo-option-btn__desc">
              Lấy 1 lá ngẫu nhiên từ tay đối thủ
            </span>
          </button>
        </div>

        <div className="game-modal__actions">
          <button
            type="button"
            className="game-action-btn"
            onClick={onCancel}
          >
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}
