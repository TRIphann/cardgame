// FxBurst — bùng nổ particle + ring shockwave tại 1 vị trí bất kỳ. Được gọi
// khi 1 lá bài vừa được đánh, hoặc khi rút được defuse, v.v.
//
// Mỗi burst sinh N particle (config theo CARD_FX) bay ra theo hình tròn, và
// (tuỳ chọn) 1 ring shockwave lan rộng. Dùng CSS keyframes + seed delays
// (không cần RAF) để chi phí thấp.
//
// `anchor` có thể là:
//   - DOMRect  → render tại tâm anchor
//   - {x, y}   → render tại tọa độ viewport cố định
//   - null     → bỏ qua (component không render)

import React, { useMemo } from "react";
import { fxFor } from "./cardFx.js";

const PARTICLE_COUNT = 18;

function seedAngle(i, n) {
  // Distribute roughly evenly with a small jitter so they don't look gridded.
  return (i / n) * Math.PI * 2 + (Math.sin(i * 11.3) * 0.18);
}

function seedDistance(i) {
  return 60 + Math.sin(i * 7.7) * 20;
}

function seedSize(i) {
  return 6 + Math.sin(i * 3.1) * 2.5;
}

export function FxBurst({ anchor, fxKey = "general", size = "md", id = "burst" }) {
  const fx = fxFor(fxKey);
  const count = Math.min(PARTICLE_COUNT, fx.count || 12);
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
        dur: 700 + Math.random() * 280,
        glyph: i % 3 === 0 ? fx.glyph : fx.particle,
      });
    }
    return arr;
  }, [count, fx]);

  if (!anchor) return null;
  const cx = "left" in anchor ? anchor.left + anchor.width / 2 : anchor.x;
  const cy = "top"  in anchor ? anchor.top  + anchor.height / 2 : anchor.y;

  const scale = size === "lg" ? 1.6 : size === "sm" ? 0.6 : 1;

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
      {/* Central glyph flash */}
      <span
        className="fx-burst__glyph"
        style={{
          color: fx.accent,
          textShadow: `0 0 18px ${fx.color}, 0 0 32px ${fx.color}`,
        }}
      >
        {fx.glyph}
      </span>

      {/* Shockwave ring */}
      {fx.ring && (
        <>
          <span
            className="fx-burst__ring"
            style={{ borderColor: fx.color, boxShadow: `0 0 28px ${fx.color}` }}
          />
          <span
            className="fx-burst__ring fx-burst__ring--delay"
            style={{ borderColor: fx.accent, boxShadow: `0 0 22px ${fx.accent}` }}
          />
        </>
      )}

      {/* Particles */}
      {seeds.map((p) => (
        <span
          key={p.i}
          className="fx-burst__particle"
          style={{
            color: p.i % 2 === 0 ? fx.color : fx.accent,
            textShadow: `0 0 12px ${fx.color}, 0 0 22px ${fx.accent}`,
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
    </div>
  );
}