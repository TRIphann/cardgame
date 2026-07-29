// FxBurst — premium particle burst tại 1 vị trí bất kỳ. Được gọi khi:
//   • 1 lá bài vừa được đánh (hand → discard)
//   • Rút được defuse
//   • Bất cứ effect nào cần celebration
//
// Particles bao gồm:
//   • Central glyph flash với scale-up
//   • 2 shockwave rings lan rộng với stagger
//   • 18 particles bay radial
//   • Light streaks ngẫu nhiên
//   • Cross-shape beams cho sword/lightning effects

import React, { useMemo } from "react";
import { fxFor } from "./cardFx.js";

const PARTICLE_COUNT = 20;

function seedAngle(i, n) {
  return (i / n) * Math.PI * 2 + (Math.sin(i * 11.3) * 0.18);
}

function seedDistance(i) {
  return 80 + Math.sin(i * 7.7) * 30;
}

function seedSize(i) {
  return 7 + Math.sin(i * 3.1) * 3;
}

export function FxBurst({ anchor, fxKey = "general", size = "md", id = "burst" }) {
  const fx = fxFor(fxKey);
  const count = Math.min(PARTICLE_COUNT, fx.count || 14);
  const variant = fxKey;

  const seeds = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i += 1) {
      arr.push({
        i,
        angle: seedAngle(i, count),
        dist: seedDistance(i),
        size: seedSize(i),
        delay: Math.random() * 80,
        dur: 800 + Math.random() * 320,
        glyph: i % 3 === 0 ? fx.glyph : fx.particle,
      });
    }
    return arr;
  }, [count, fx]);

  if (!anchor) return null;
  const cx = "left" in anchor ? anchor.left + anchor.width / 2 : anchor.x;
  const cy = "top"  in anchor ? anchor.top  + anchor.height / 2 : anchor.y;

  const scale = size === "lg" ? 1.7 : size === "sm" ? 0.6 : 1;

  return (
    <div
      className={`fx-burst fx-burst--${variant}`}
      style={{
        position: "fixed",
        left: cx,
        top: cy,
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 220,
      }}
      data-burst-id={id}
    >
      {/* Central flash */}
      <span
        className="fx-burst__flash"
        style={{
          background: `radial-gradient(circle, ${fx.color} 0%, ${fx.accent} 50%, transparent 80%)`,
        }}
      />

      {/* Central glyph with halo */}
      <span
        className="fx-burst__glyph"
        style={{
          color: fx.accent,
          textShadow: `0 0 22px ${fx.color}, 0 0 44px ${fx.color}`,
        }}
      >
        {fx.glyph}
      </span>

      {/* Shockwave rings — 3 layers with stagger */}
      {fx.ring && (
        <>
          <span
            className="fx-burst__ring"
            style={{
              borderColor: fx.color,
              boxShadow: `0 0 36px ${fx.color}, inset 0 0 24px ${fx.color}40`,
            }}
          />
          <span
            className="fx-burst__ring fx-burst__ring--delay"
            style={{
              borderColor: fx.accent,
              boxShadow: `0 0 28px ${fx.accent}`,
            }}
          />
          <span
            className="fx-burst__ring fx-burst__ring--late"
            style={{
              borderColor: fx.color,
              boxShadow: `0 0 24px ${fx.color}`,
            }}
          />
        </>
      )}

      {/* Cross beams for sword-style attacks */}
      {fxKey === "attack" && (
        <>
          <span className="fx-burst__beam fx-burst__beam--h" style={{ background: fx.color }} />
          <span className="fx-burst__beam fx-burst__beam--v" style={{ background: fx.accent }} />
        </>
      )}

      {/* Particles */}
      {seeds.map((p) => (
        <span
          key={p.i}
          className="fx-burst__particle"
          style={{
            color: p.i % 2 === 0 ? fx.color : fx.accent,
            textShadow: `0 0 14px ${fx.color}, 0 0 26px ${fx.accent}`,
            fontSize: `${p.size * 4 * scale}px`,
            "--ang": `${p.angle}rad`,
            "--dist": `${p.dist * scale}px`,
            "--delay": `${p.delay}ms`,
            "--dur": `${p.dur}ms`,
          }}
        >
          {p.glyph}
        </span>
      ))}

      {/* Streaks — small light dashes that fly out fast */}
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={`streak-${i}`}
          className="fx-burst__streak"
          style={{
            "--ang": `${(i / 4) * Math.PI * 2 + 0.4}rad`,
            "--dist": `${120 * scale}px`,
            background: i % 2 === 0 ? fx.color : fx.accent,
          }}
        />
      ))}
    </div>
  );
}