// FlyingCards — renders the 4 flying cards used by the deck animation.
// Refs are forwarded so the hook can mutate transforms without re-rendering.

import React from "react";

export function FlyingCards({ refs, faceUrls, backUrl }) {
  const items = [];
  for (let i = 0; i < 4; i += 1) {
    items.push(
      <div
        key={i}
        ref={(el) => { refs.current[i] = el; }}
        className="flying-card"
        data-index={i}
        aria-hidden="true"
      >
        <div className="card-face card-back-face">
          <img
            src={backUrl || "/assets/cards/default/cards/back.svg"}
            alt=""
            className="card-back-img"
            draggable="false"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement.style.background = "linear-gradient(135deg, #1a1a4e, #0d0d2e)";
              e.currentTarget.parentElement.style.border = "1.5px solid rgba(255,200,100,0.4)";
            }}
          />
        </div>
        <div className="card-face card-front-face">
          <img
            src={faceUrls[i] || ""}
            alt=""
            className="card-img"
            draggable="false"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement.style.background = "linear-gradient(135deg, #2d1a5e, #1a0d3e)";
              e.currentTarget.parentElement.style.border = "1.5px solid rgba(168,85,247,0.5)";
              e.currentTarget.parentElement.style.display = "flex";
              e.currentTarget.parentElement.style.alignItems = "center";
              e.currentTarget.parentElement.style.justifyContent = "center";
              e.currentTarget.parentElement.style.fontSize = "48px";
              e.currentTarget.parentElement.style.color = "rgba(168,85,247,0.6)";
              e.currentTarget.parentElement.textContent = "★";
            }}
          />
        </div>
      </div>,
    );
  }
  return <div className="flying-cards-container">{items}</div>;
}