// HandArc — render the local player's hand of cards in a fanned arc.
// Each card is placed at a fixed slot in the arc with its own rotation.
// Click a card to open its action modal.

import React from "react";
import { CARD_CLOUDINARY } from "@games/exploding-cats/cardCloudinary.js";

function urlFor(key) {
  return CARD_CLOUDINARY.cards[key] || "";
}

// Card arc geometry. Tweak TOTAL_ROT so 5-card hand stays visible
// without overlap; outer cards angle toward the table center.
const TOTAL_ROT = 28; // degrees — outermost cards tilt toward center
const MAX_LIFT = 18;  // px — middle card sits a touch higher

function slotTransform(index, total) {
  // Symmetric around the centre: index 0 → left, last → right.
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const rot = (t - 0.5) * TOTAL_ROT;
  const lift = Math.sin(t * Math.PI) * MAX_LIFT;
  const tx = (t - 0.5) * (total > 5 ? 130 : 110) * (total / 5);
  return {
    tx: `translateX(${tx.toFixed(1)}px)`,
    tr: `rotate(${-rot.toFixed(1)}deg)`,
    ty: `translateY(${-lift.toFixed(1)}px)`,
  };
}

export function HandArc({ hand, selectedIndex, onSelectCard }) {
  if (!hand || hand.length === 0) {
    return (
      <div className="hand-arc hand-arc--empty">
        <div style={{ opacity: 0.4, fontSize: 14 }}>Không có lá nào</div>
      </div>
    );
  }
  return (
    <div className="hand-arc">
      {hand.map((key, idx) => {
        const { tx, tr, ty } = slotTransform(idx, hand.length);
        const selected = selectedIndex === idx;
        const styleVars = {
          left: `calc(50% + ${((idx - (hand.length - 1) / 2) * (hand.length > 5 ? 130 : 110) * (hand.length / 5)).toFixed(1)}px)`,
          "--arc-tx": tx,
          "--arc-tr": tr,
          "--arc-ty": ty,
          transform: `${tx} ${tr} ${ty}`,
          zIndex: 1 + idx,
        };
        const url = urlFor(key);
        return (
          <button
            key={`${idx}-${key}`}
            type="button"
            className={`hand-card${selected ? " hand-card--selected" : ""}`}
            style={styleVars}
            onClick={() => onSelectCard?.(idx, key)}
            aria-label={key}
            data-card-key={key}
          >
            {url ? (
              <img src={url} alt={key} draggable={false} />
            ) : (
              <span style={{ fontSize: 12, color: "#fff" }}>{key}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
