// AmbientBackdrop — fixed-position decoration (blobs, stars, floating
// tarot cards) shared across all routes. Mounted once in <App />.

import React from "react";

const FLOATING_CARDS = [
  { glyph: "☼", title: "SOL", cls: "card-sun" },
  { glyph: "☾", title: "LUNA", cls: "card-moon" },
  { glyph: "◉", title: "ORACLE", cls: "card-eye" },
  { glyph: "✦", title: "ASTRA", cls: "card-star" },
  { glyph: "♠", title: "IGNIS", cls: "card-flame" },
];

export function AmbientBackdrop() {
  return (
    <div className="arc-ambient" aria-hidden="true">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="stars" />
      <div className="cards-scene">
        {FLOATING_CARDS.map((c) => (
          <article key={c.title} className={`floating-card ${c.cls}`}>
            <span className="card-glyph">{c.glyph}</span>
            <span className="card-title">{c.title}</span>
          </article>
        ))}
      </div>
    </div>
  );
}