// FloatingBackdrop — shared scene used by Lobby and Game pages.
// 4 floating cards (Sun / Moon / Eye / Star) drifting on a slow loop,
// with same ambient blobs as Lobby. Renders inside a fixed container so
// pages stay above it.
//
// Cinematic upgrades:
//   • Background ambient dust (rising glowing motes) generated via CSS
//   • Faint horizontal "arc" lines flowing from left to right
//   • Each floating card has its own gentle wobble + glow trail

import React, { useMemo } from "react";

const FLOATING_GLYPHS = ["☀", "☾", "◉", "✦"];
const DUST_COUNT = 22;
const ARC_COUNT = 4;

export function FloatingBackdrop() {
  // Pre-compute the dust seeds once so they don't reshuffle every render.
  const dust = useMemo(() => {
    return Array.from({ length: DUST_COUNT }).map((_, i) => ({
      i,
      left: Math.random() * 100,
      delay: Math.random() * 12,
      dur: 12 + Math.random() * 8,
      size: 1.5 + Math.random() * 3,
      hue: i % 3 === 0 ? "rgba(255, 215, 130, 0.85)" : i % 3 === 1 ? "rgba(154, 115, 255, 0.85)" : "rgba(122, 223, 255, 0.85)",
    }));
  }, []);

  return (
    <div className="arc-ambient" aria-hidden="true">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="stars" />

      {/* Ambient dust layer */}
      <div className="arc-dust" aria-hidden="true">
        {dust.map((d) => (
          <span
            key={d.i}
            className="arc-dust__mote"
            style={{
              left: `${d.left}%`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              background: d.hue,
              boxShadow: `0 0 12px ${d.hue}, 0 0 24px ${d.hue}`,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.dur}s`,
            }}
          />
        ))}
      </div>

      {/* Horizontal arcs of light sweeping across */}
      <div className="arc-sweep" aria-hidden="true">
        {Array.from({ length: ARC_COUNT }).map((_, i) => (
          <span
            key={i}
            className="arc-sweep__line"
            style={{
              animationDelay: `${i * 1.6}s`,
              animationDuration: `${10 + i * 2}s`,
              top: `${15 + i * 18}%`,
            }}
          />
        ))}
      </div>

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
              className="floating-card floating-card--fx"
              style={{ ...pos, animationDelay: `${i * 1.6}s` }}
            >
              <span className="card-glyph">{g}</span>
              <span className="floating-card__trail" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  );
}