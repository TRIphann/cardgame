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
          <img src={backUrl || "/assets/cards/default/cards/back.svg"} alt="" className="card-back-img" draggable="false" />
        </div>
        <div className="card-face card-front-face">
          <img src={faceUrls[i] || ""} alt="" className="card-img" draggable="false" />
        </div>
      </div>,
    );
  }
  return <div className="flying-cards-container">{items}</div>;
}