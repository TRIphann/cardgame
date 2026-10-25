// FxBurst — premium particle burst tại 1 vị trí bất kỳ. Được gọi khi:
//   • 1 lá bài vừa được đánh (hand → discard)
//   • Rút được defuse
//   • Bất cứ effect nào cần celebration
//
// Particles bao gồm:
//   • Central glyph flash với scale-up mượt (anime.js)
//   • 3 shockwave rings lan rộng với stagger (anime.js)
//   • 18 particles bay radial với easing overshoot (anime.js)
//   • Light streaks ngẫu nhiên (anime.js)
//   • Cross-shape beams cho sword/lightning effects (anime.js)
//
// Lưu ý: anime.js v4 được load lazily, khi load xong ta attach một `animate()`
// call cho mỗi layer (flash, glyph, rings, particles, streaks, beams). CSS
// keyframes vẫn được giữ làm fallback cho trường hợp:
//   • anime.js chưa load kịp (rất khó xảy ra trong prod nhưng an toàn)
//   • User bật `prefers-reduced-motion` → ta skip anime.js hoàn toàn

import React, { useEffect, useMemo, useRef } from "react";
import { fxFor } from "./cardFx.js";
import { animateOnce, getAnime } from "@shared/animation/useAnimeFx.js";

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

  const rootRef = useRef(null);
  const flashRef = useRef(null);
  const glyphRef = useRef(null);
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const ringCRef = useRef(null);
  const beamHRef = useRef(null);
  const beamVRef = useRef(null);
  const streakRefs = useRef([]);

  // Run anime.js animations once mounted. CSS keyframes are still defined so
  // reduced-motion users (and the brief window before the JS animation kicks
  // in) get a graceful fallback.
  useEffect(() => {
    if (!rootRef.current) return undefined;
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    const cleanups = [];

    (async () => {
      try {
        await getAnime();
        if (cancelled || !rootRef.current) return;

        // ── Flash: fast scale-out fade ──────────────────────────────
        if (flashRef.current) {
          const a = await animateOnce(flashRef.current, {
            scale: [0, 2.4],
            opacity: [0, 0.85, 0],
            duration: 520,
            ease: "outExpo",
          });
          cleanups.push(() => a?.cancel?.());
        }

        // ── Central glyph: bounce up + rotate ─────────────────────
        if (glyphRef.current) {
          const a = await animateOnce(glyphRef.current, {
            translateY: [0, -110],
            scale: [0.4, 1.15, 1],
            rotate: [0, 360],
            opacity: [0, 1, 0],
            duration: 1100,
            ease: "outQuart",
          });
          cleanups.push(() => a?.cancel?.());
        }

        // ── Rings: stagger outward expansion ──────────────────────
        const ringTargets = [ringARef.current, ringBRef.current, ringCRef.current]
          .filter(Boolean);
        if (ringTargets.length) {
          const a = await animateOnce(ringTargets, {
            scale: [0.2, 2.6],
            opacity: [0.9, 0],
            duration: 900,
            delay: (el, i) => i * 140,
            ease: "outCubic",
          });
          cleanups.push(() => a?.cancel?.());
        }

        // ── Cross beams for attack ────────────────────────────────
        const beams = [beamHRef.current, beamVRef.current].filter(Boolean);
        if (beams.length) {
          const a = await animateOnce(beams, {
            scale: [0, 1.4],
            opacity: [0, 1, 0],
            duration: 380,
            delay: (el, i) => i * 60,
            ease: "outExpo",
          });
          cleanups.push(() => a?.cancel?.());
        }

        // ── Particles: radial fly-out with overshoot ──────────────
        const particles = rootRef.current.querySelectorAll(".fx-burst__particle");
        if (particles.length) {
          const a = await animateOnce(particles, {
            translateX: (el) => {
              const ax = parseFloat(el.style.getPropertyValue("--ang-x")) || 0;
              return [0, ax];
            },
            translateY: (el) => {
              const ay = parseFloat(el.style.getPropertyValue("--ang-y")) || 0;
              return [0, ay];
            },
            scale: [0.2, 1.4, 0.6],
            opacity: [0, 1, 0],
            rotate: (_el, _i) => [0, (_i % 2 ? 240 : -240)],
            duration: (_el, _i) => 700 + (_i % 5) * 60,
            delay: (el) => {
              const d = parseFloat(el.style.getPropertyValue("--delay")) || 0;
              return d;
            },
            ease: "outExpo",
          });
          cleanups.push(() => a?.cancel?.());
        }

        // ── Streaks: fast outward dashes ───────────────────────────
        const streaks = streakRefs.current.filter(Boolean);
        if (streaks.length) {
          const a = await animateOnce(streaks, {
            translateX: (el, i) => {
              const angle = (i / streaks.length) * Math.PI * 2;
              return [0, Math.cos(angle) * 110];
            },
            translateY: (el, i) => {
              const angle = (i / streaks.length) * Math.PI * 2;
              return [0, Math.sin(angle) * 110];
            },
            scaleX: [0, 1.6],
            opacity: [0, 0.9, 0],
            duration: 480,
            delay: (el, i) => i * 40,
            ease: "outQuart",
          });
          cleanups.push(() => a?.cancel?.());
        }

        // Mark root so CSS keyframes stop competing.
        if (rootRef.current && !cancelled) {
          rootRef.current.classList.add("anime-driven");
        }
      } catch (_) {
        /* anime.js failed → CSS fallback handles it */
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => {
        try { fn(); } catch (_) { /* ignore */ }
      });
    };
  }, [seeds.length, variant]);

  if (!anchor) return null;
  const cx = "left" in anchor ? anchor.left + anchor.width / 2 : anchor.x;
  const cy = "top" in anchor ? anchor.top + anchor.height / 2 : anchor.y;

  const scale = size === "lg" ? 1.7 : size === "sm" ? 0.6 : 1;

  return (
    <div
      ref={rootRef}
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
        ref={flashRef}
        className="fx-burst__flash"
        style={{
          background: `radial-gradient(circle, ${fx.color} 0%, ${fx.accent} 50%, transparent 80%)`,
        }}
      />

      {/* Central glyph with halo */}
      <span
        ref={glyphRef}
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
            ref={ringARef}
            className="fx-burst__ring"
            style={{
              borderColor: fx.color,
              boxShadow: `0 0 36px ${fx.color}, inset 0 0 24px ${fx.color}40`,
            }}
          />
          <span
            ref={ringBRef}
            className="fx-burst__ring fx-burst__ring--delay"
            style={{
              borderColor: fx.accent,
              boxShadow: `0 0 28px ${fx.accent}`,
            }}
          />
          <span
            ref={ringCRef}
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
          <span ref={beamHRef} className="burst-beam-h" style={{ background: fx.color }} />
          <span ref={beamVRef} className="burst-beam-v" style={{ background: fx.accent }} />
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
            "--ang-x": `${Math.cos(p.angle) * p.dist * scale}px`,
            "--ang-y": `${Math.sin(p.angle) * p.dist * scale}px`,
            "--delay": `${p.delay}ms`,
            "--dur": `${p.dur}ms`,
          }}
        >
          {p.glyph}
        </span>
      ))}

      {/* Streaks */}
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={`streak-${i}`}
          ref={(el) => { streakRefs.current[i] = el; }}
          className="fx-burst__streak"
          style={{
            background: i % 2 === 0 ? fx.color : fx.accent,
          }}
        />
      ))}
    </div>
  );
}