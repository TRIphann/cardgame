// FlyingCards — renders the 4 flying cards used by the deck animation.
// Refs are forwarded so the hook can mutate transforms without re-rendering.

import React from "react";

// Fallback gradient for broken/missing card images
const FALLBACK_GRADIENT = "linear-gradient(135deg, #1a1a4e, #0d0d2e)";
const FALLBACK_BORDER   = "1.5px solid rgba(255,200,100,0.4)";

// Guard against null parentElement when image fails to load
function handleImgError(e) {
  const parent = e.currentTarget?.parentElement;
  if (!parent) return;
  e.currentTarget.style.display = "none";
  parent.style.background = FALLBACK_GRADIENT;
  parent.style.border = FALLBACK_BORDER;
}

function handleFaceError(e) {
  const parent = e.currentTarget?.parentElement;
  if (!parent) return;
  e.currentTarget.style.display = "none";
  parent.style.background = "linear-gradient(135deg, #2d1a5e, #1a0d3e)";
  parent.style.border = "1.5px solid rgba(168,85,247,0.5)";
  parent.style.display = "flex";
  parent.style.alignItems = "center";
  parent.style.justifyContent = "center";
  parent.style.fontSize = "48px";
  parent.style.color = "rgba(168,85,247,0.6)";
  parent.textContent = "★";
}

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
            src={backUrl}
            alt=""
            className="card-back-img"
            draggable="false"
            onError={handleImgError}
          />
        </div>
        <div className="card-face card-front-face">
          <img
            src={faceUrls[i] || ""}
            alt=""
            className="card-img"
            draggable="false"
            onError={handleFaceError}
          />
        </div>
      </div>,
    );
  }
  return <div className="flying-cards-container">{items}</div>;
}