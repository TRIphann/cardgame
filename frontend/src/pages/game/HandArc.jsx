// HandArc — render the local player's hand of cards in a fanned arc.
// Each card sits in its own slot with rotation and lift, and shows the
// card's description on hover so the player can see what it does without
// committing to playing it.

import React, { useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { CARD_LABELS } from "./cardLabels.js";

const BACK_URL = cardImageUrl("back");

// Card arc geometry. We scale down spacing aggressively when the hand is
// large so 20-card hands still fit on a phone. Outer cards tilt toward
// the centre for a fan look.
function arcStep(total) {
  if (total <= 5) return 72;
  if (total <= 8) return 56;
  if (total <= 12) return 42;
  if (total <= 16) return 32;
  return 26;
}

function slotTransform(index, total) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  // Premium fan: outer tilt gentler so cards spread beautifully.
  const totalRot = Math.max(10, 32 - (total - 5) * 1.4);
  const rot = (t - 0.5) * totalRot;
  const lift = Math.sin(t * Math.PI) * Math.min(28, 38 / Math.sqrt(total));
  const step = arcStep(total);
  const tx = (t - 0.5) * step * (total - 1);
  return {
    tx: `translateX(${tx.toFixed(1)}px)`,
    tr: `rotate(${-rot.toFixed(1)}deg)`,
    ty: `translateY(${-lift.toFixed(1)}px)`,
  };
}

export function HandArc({ hand, selectedIndex, onSelectCard, onHoverCard, lastDrawnKey }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const total = hand?.length || 0;
  if (total === 0) {
    return (
      <div className="hand-arc hand-arc--empty">
        <div style={{ opacity: 0.4, fontSize: 14 }}>Không có lá nào</div>
      </div>
    );
  }
  const step = arcStep(total);
  return (
    <div className="hand-arc" style={{ "--hand-step": `${step}px` }}>
      {hand.map((key, idx) => {
        const { tx, tr, ty } = slotTransform(idx, total);
        const selected = selectedIndex === idx;
        const hovered = hoveredIdx === idx;
        // Find the index of the freshly-drawn card. We match the LAST
        // occurrence so re-drawing the same card type still pulses.
        const isFresh = !!lastDrawnKey && key === lastDrawnKey &&
          !hand.slice(idx + 1).includes(lastDrawnKey);
        const offset = (idx - (total - 1) / 2) * step;
        const styleVars = {
          left: `calc(50% + ${offset.toFixed(1)}px)`,
          "--arc-tx": tx,
          "--arc-tr": tr,
          "--arc-ty": ty,
          "--hover-lift": hovered ? "translateY(-30px)" : ty,
          transform: hovered ? `${tx} ${tr} ${ty} translateY(-30px) scale(1.1)` : `${tx} ${tr} ${ty}`,
          zIndex: 10 + idx + (hovered ? 1000 : 0),
        };
        const url = cardImageUrl(key);
        const meta = CARD_LABELS[key] || { label: key, description: "" };
        const tooltipId = `hand-card-tip-${idx}`;
        return (
          <button
            key={`${idx}-${key}`}
            type="button"
            className={[
              "hand-card",
              selected ? "hand-card--selected" : "",
              hovered ? "hand-card--hovered" : "",
              isFresh ? "hand-card--fresh" : "",
            ].filter(Boolean).join(" ")}
            style={styleVars}
            onClick={() => onSelectCard?.(idx, key)}
            onMouseEnter={() => { setHoveredIdx(idx); onHoverCard?.(idx, key, true); }}
            onMouseLeave={() => { setHoveredIdx(null); onHoverCard?.(idx, key, false); }}
            onFocus={() => setHoveredIdx(idx)}
            onBlur={() => setHoveredIdx(null)}
            aria-label={meta.label}
            aria-describedby={tooltipId}
            data-card-key={key}
          >
            <img
              src={url || BACK_URL}
              alt={meta.label}
              draggable={false}
              loading="lazy"
              onError={(e) => {
                if (e.currentTarget.src !== BACK_URL) e.currentTarget.src = BACK_URL;
              }}
            />
            <span
              id={tooltipId}
              role="tooltip"
              className={`hand-card__tooltip${hovered ? " hand-card__tooltip--visible" : ""}`}
            >
              <span className="hand-card__tooltip-title">{meta.label}</span>
              <span className="hand-card__tooltip-desc">{meta.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
