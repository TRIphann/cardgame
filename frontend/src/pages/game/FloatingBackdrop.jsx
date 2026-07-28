// FloatingBackdrop — shared scene used by Lobby and Game pages.
// 4 floating cards (Sun / Moon / Eye / Star) drifting on a slow loop,
// with same ambient blobs as Lobby. Renders inside a fixed container so
// pages stay above it.

import React from "react";

const FLOATING_GLYPHS = ["☀", "☾", "◉", "✦"];

export function FloatingBackdrop() {
  return (
    <div className="arc-ambient" aria-hidden="true">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="stars" />
      <div className="cards-scene">
        {FLOATING_GLYPHS.map((g, i) => {
          const positions = [
            { top: "8%",  left: "10%" },
            { top: "20%", right: "12%" },
            { top: "70%", left: "6%" },
            { top: "80%", right: "8%" },
          ];
          const pos = positions[i] || {};
          return (
            <div
              key={i}
              className="floating-card"
              style={{ ...pos, animationDelay: `${i * 1.6}s` }}
            >
              <span className="card-glyph">{g}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
