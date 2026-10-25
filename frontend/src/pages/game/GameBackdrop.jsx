// GameBackdrop — decorative scene for the game page.
// Reuses the visual language from the landing page backdrop:
//   - ambient blobs
//   - star field
//   - floating tarot cards with CSS-only animation
// No anime.js dependency — all motion via CSS keyframes.

import React, { useMemo } from "react";

const CARD_POSITIONS = [
  { key: "card-1", top: "8%", left: "10%", rotate: -19 },
  { key: "card-2", top: "15%", right: "12%", rotate: 17 },
  { key: "card-3", top: "65%", left: "5%", rotate: 13 },
  { key: "card-4", top: "72%", right: "8%", rotate: -14 },
];

export function GameBackdrop() {
  const cards = useMemo(() => CARD_POSITIONS.map((p, i) => ({
    ...p,
    delay: `${i * 2.4}s`,
    anim: `game-card-bob-${i}`,
  })), []);

  return (
    <div className="game-backdrop" aria-hidden="true">
      {/* Ambient blobs */}
      <div className="gb-ambient gb-ambient--one" />
      <div className="gb-ambient gb-ambient--two" />

      {/* Star field */}
      <div className="gb-stars" />
      <div className="gb-stars gb-stars--2" />
      <div className="gb-stars gb-stars--3" />

      {/* Floating tarot cards */}
      <div className="gb-cards">
        {cards.map((c) => (
          <div
            key={c.key}
            className="gb-card"
            style={{
              top: c.top,
              left: c.left,
              right: c.right,
              transform: `rotate(${c.rotate}deg)`,
              animationDelay: c.delay,
            }}
          >
            <span className="gb-card__glyph">
              {["☼", "☾", "◉", "✦"][cards.indexOf(c)]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
