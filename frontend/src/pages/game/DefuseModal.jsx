// DefuseModal — premium cinematic "Cứu bom!" Modal.
// Hiệu ứng nâng cấp toàn diện:
//   • Bomb glow pulse + screen tint
//   • 6 slot buttons dạng radial carousel — chọn vị trí đặt bom
//   • Hover/select glow cường đại cao
//   • Sparkle bursts liên tục quanh modal

import React, { useEffect, useRef, useState } from "react";
import { FxBurst } from "./FxBurst.jsx";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const SLOTS = [
  { idx: 0, label: "Đỉnh", sub: "Rút tiếp", tint: "#ff8a7a" },
  { idx: 1, label: "", sub: "+1", tint: "#ff8a4a" },
  { idx: 2, label: "", sub: "+2", tint: "#ffaa5a" },
  { idx: 3, label: "", sub: "+3", tint: "#ffce7a" },
  { idx: 4, label: "", sub: "+4", tint: "#ffd86b" },
  { idx: 5, label: "Đáy", sub: "Sâu nhất", tint: "#ffeaa3" },
];

export function DefuseModal({ onConfirm, onSkip }) {
  const [tickKey, setTickKey] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const modalRef = useRef(null);
  const titleId = "dm-title";
  // A11Y: capture viewport dimensions once on mount.
  const [vp, setVp] = useState(() =>
    typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : { w: 1280, h: 720 }
  );

  useEffect(() => {
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTickKey((k) => k + 1), 1400);
    return () => clearInterval(id);
  }, []);

  // A11Y: ESC key closes (calls onSkip = place at bottom).
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onSkip?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSkip]);

  // A11Y: focus trap inside modal.
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button:not([disabled])');
    focusable[0]?.focus();
  }, []);

  return (
    <div className="game-modal__scrim defuse-scrim" role="presentation">
      {/* Massive red flash scrim */}
      <div className="defuse-scrim__danger" aria-hidden="true" />

      {/* Sparkle bursts at modal corners */}
      {[0, 1].map((corner) => (
        <FxBurst
          key={`${corner}-${tickKey}`}
          anchor={
            corner === 0
              ? { x: vp.w / 2 - 240, y: vp.h / 2 - 140 }
              : { x: vp.w / 2 + 240, y: vp.h / 2 + 140 }
          }
          fxKey="bomb"
          size="md"
          id={`defuse-tick-${corner}`}
        />
      ))}

      <div
        ref={modalRef}
        className="game-modal defuse-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Bomb icon top of modal with pulsing halo */}
        <div className="defuse-modal__bomb" aria-hidden="true">
          <div className="defuse-modal__bomb-halo" />
          <img src={cardImageUrl("bomb")} alt="" draggable={false} />
          <span className="defuse-modal__bomb-pulse" />
          <span className="defuse-modal__bomb-pulse defuse-modal__bomb-pulse--late" />
          <span className="defuse-modal__bomb-pulse defuse-modal__bomb-pulse--late2" />
        </div>

        <h3 className="game-modal__title defuse-modal__title" id={titleId}>
          <span className="defuse-modal__title-glyph" aria-hidden="true">💣</span>
          Cứu bom!
        </h3>
        <p className="game-modal__sub">
          Chọn vị trí đặt bom trở lại vào chồng bài (0 = trên cùng, 5 = sâu hơn).
        </p>

        <div className="defuse-slots" role="group" aria-label="Vị trí đặt bom">
          {SLOTS.map((s) => {
            const isSelected = selectedSlot === s.idx;
            return (
              <button
                key={s.idx}
                type="button"
                className={`defuse-slot${isSelected ? " defuse-slot--selected" : ""}`}
                onMouseEnter={() => setSelectedSlot(s.idx)}
                onMouseLeave={() => setSelectedSlot(null)}
                onClick={() => onConfirm(s.idx)}
                aria-label={`Vị trí ${s.idx}: ${s.label || s.sub}`}
              >
                <span className="defuse-slot__num">{s.idx}</span>
                <span className="defuse-slot__hint">{s.label || s.sub}</span>
                <span className="defuse-slot__beam" aria-hidden="true" />
                <span className="defuse-slot__ring" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="game-modal__actions">
          <button type="button" className="game-action-btn" onClick={onSkip} aria-label="Đặt bom cuối bộ bài (ESC)">
            Đặt cuối bộ bài
          </button>
        </div>
      </div>
    </div>
  );
}