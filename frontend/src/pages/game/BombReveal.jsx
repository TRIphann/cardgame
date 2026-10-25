// BombReveal — cinematic "lá bom được rút" hiện giữa màn hình cho
// MỌI người chơi thấy. Drive hoàn toàn bằng anime.js.
//
// Phase timeline:
//   0ms       card back pops in (scale 0.3 → 1, opacity 0 → 1)
//   200ms     flip animation starts (rotateY 0 → 180)
//   580ms     bomb face revealed, shockwave + countdown ring start
//   3000ms    → fadeout (has defuse) OR → explode (no defuse)
//
// All positions, shake, ring expansion, countdown depletion đều do anime.js
// drive. CSS keyframes giữ làm fallback cho reduced-motion / load fail.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

const REVEAL_MS  = 3000;
const FLIP_MS    = 200;
const FLIP_DELAY = 180;

export function BombReveal({ memberName, willDefuse, onComplete }) {
  const [phase, setPhase] = useState("back");
  const [mounted, setMounted] = useState(true);
  const rootRef   = useRef(null);
  const cardRef   = useRef(null);
  const innerRef  = useRef(null);
  const auraRef   = useRef(null);
  const shockRefs = useRef([]);
  const sparkRefs = useRef([]);
  const pulseRef  = useRef(null);
  const countdownRef = useRef(null);
  const labelRef  = useRef(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => { preloadAnime(); }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    let instances = [];

    (async () => {
      try {
        const animate = await getAnime();
        if (cancelled) return;
        if (!cardRef.current || !innerRef.current) return;

        const card  = cardRef.current;
        const inner = innerRef.current;

        // Phase 1: pop in
        instances.push(animate(card, {
          scale:    [0.3, 1.1, 1],
          opacity:  [0, 1],
          duration: 380,
          ease:     "outBack",
        }));

        // Aura glow: pulsing radius
        if (auraRef.current) {
          instances.push(animate(auraRef.current, {
            scale:    [0.6, 1.4, 1.1],
            opacity:  [0, 0.9, 0.7],
            duration: 800,
            ease:     "outExpo",
          }));
          // Loop pulse
          instances.push(animate(auraRef.current, {
            scale:    [1.1, 1.4, 1.1],
            opacity:  [0.7, 0.4, 0.7],
            duration: 1400,
            delay:    800,
            loop:     true,
            alternate: true,
            ease:     "inOutSine",
          }));
        }

        // Pre-fire sparks: radial fly-out staggered
        const sparks = sparkRefs.current.filter(Boolean);
        sparks.forEach((sp, i) => {
          const angleDeg = parseFloat(sp.style.getPropertyValue("--ang")) || 0;
          const dist     = parseFloat(sp.style.getPropertyValue("--dist")) || 200;
          const rad      = (angleDeg * Math.PI) / 180;
          const tx       = Math.cos(rad) * dist;
          const ty       = Math.sin(rad) * dist;
          instances.push(animate(sp, {
            translateX: [0, tx],
            translateY: [0, ty],
            scale:      [0.2, 1.2, 0.4],
            opacity:    [0, 1, 0],
            rotate:     [0, angleDeg],
            duration:   900,
            delay:      i * 40,
            ease:       "outExpo",
          }));
        });

        // Phase 2: flip Y at FLIP_DELAY, swap face mid-flip
        setTimeout(() => { if (!cancelled) setPhase("flip"); }, FLIP_DELAY);
        instances.push(animate(inner, {
          rotateY:  [0, 180],
          duration: FLIP_MS,
          delay:    FLIP_DELAY,
          ease:     "inOutQuad",
        }));

        // Phase 3: face revealed + infinite shake
        setTimeout(() => { if (!cancelled) setPhase("face"); }, FLIP_DELAY + FLIP_MS);
        instances.push(animate(card, {
          translateX: [0, -3, 3, -2, 2, 0],
          translateY: [0, -1, 1, 0],
          rotate:     [0, -1.5, 1.5, -1, 0],
          duration:   1400,
          delay:      FLIP_DELAY + FLIP_MS,
          loop:       true,
          ease:       "inOutSine",
        }));

        // Pulse ring: scale 0→2, opacity 1→0, looping
        if (pulseRef.current) {
          instances.push(animate(pulseRef.current, {
            scale:   [0.5, 2.2],
            opacity: [0.9, 0],
            duration: 1100,
            delay:    FLIP_DELAY + FLIP_MS,
            loop:     true,
            ease:     "outCubic",
          }));
        }

        // Shockwave rings: stagger outward expansion
        const shocks = shockRefs.current.filter(Boolean);
        shocks.forEach((sh, i) => {
          instances.push(animate(sh, {
            scale:    [0.2, 3.2],
            opacity:  [0, 0.7, 0],
            duration: 1400,
            delay:    FLIP_DELAY + FLIP_MS + i * 280,
            ease:     "outExpo",
          }));
        });

        // Countdown SVG ring: animate stroke-dashoffset from full → empty.
        if (countdownRef.current) {
          const len = 2 * Math.PI * 54; // matches CSS r=54
          instances.push(animate(countdownRef.current, {
            strokeDashoffset: [0, len],
            duration: REVEAL_MS - FLIP_DELAY - FLIP_MS,
            delay:    FLIP_DELAY + FLIP_MS,
            ease:     "linear",
          }));
        }

        // Phase 4: end → fadeout OR explode
        setTimeout(() => {
          if (cancelled) return;
          setPhase(willDefuse ? "fadeout" : "explode");
          // Label fade-in (always)
          if (labelRef.current) {
            animate(labelRef.current, {
              opacity:  [0, 1],
              translateY: [10, 0],
              duration: 400,
              ease:     "outQuad",
            });
          }
        }, REVEAL_MS);

        // Schedule cleanup
        const cleanupDelay = willDefuse ? 450 : 200;
        setTimeout(() => {
          if (cancelled) return;
          // Animate exit
          if (willDefuse) {
            if (rootRef.current) {
              animate(rootRef.current, {
                opacity:  [1, 0],
                scale:    [1, 0.85],
                duration: 420,
                ease:     "outQuad",
              });
            }
          } else {
            // Explode: scale + opacity + extra shake
            if (rootRef.current) {
              animate(rootRef.current, {
                scale:    [1, 1.4, 1.6],
                opacity:  [1, 1, 0],
                duration: 800,
                ease:     "outExpo",
              });
            }
          }
          setTimeout(() => {
            if (cancelled) return;
            setMounted(false);
            onCompleteRef.current?.();
          }, cleanupDelay);
        }, REVEAL_MS);
      } catch (_) { /* silent */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, [willDefuse]);

  if (!mounted) return null;

  const backUrl = cardImageUrl("back");
  const faceUrl = cardImageUrl("bomb");
  const CARD_W  = 240;
  const CARD_H  = 344;

  return (
    <div ref={rootRef} className="bomb-reveal-root bomb-reveal-root--anime" aria-hidden={!mounted}>
      {/* Scrim */}
      <div className={`bomb-reveal-scrim bomb-reveal-scrim--${phase}`} aria-hidden="true" />

      {/* Pre-fire sparks */}
      <div className="bomb-sparks-field" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={`s-${i}`}
            ref={(el) => { sparkRefs.current[i] = el; }}
            className="bomb-sparks__spark"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              "--ang":   `${(i / 24) * 360}deg`,
              "--dist":  `${280 + (i % 5) * 80}px`,
              "--delay": `${i * 40}ms`,
            }}
          />
        ))}
      </div>

      {/* Main bomb card */}
      <div
        ref={cardRef}
        className={`bomb-reveal bomb-reveal--${phase} bomb-reveal--anime`}
        style={{
          position: "fixed",
          width: CARD_W,
          height: CARD_H,
          left: "50%",
          top: "50%",
          marginLeft: -CARD_W / 2,
          marginTop: -CARD_H / 2,
          transformStyle: "preserve-3d",
        }}
      >
        <div ref={auraRef} className="bomb-reveal__outer-glow" aria-hidden="true" />

        <div ref={innerRef} className="bomb-reveal__inner">
          <div className="bomb-reveal__face bomb-reveal__face--back">
            <img src={backUrl} alt="" draggable={false} />
          </div>
          <div className="bomb-reveal__face bomb-reveal__face--front">
            <img src={faceUrl} alt="💣" draggable={false} />
            <div ref={pulseRef} className="bomb-reveal__pulse-ring" aria-hidden="true" />
          </div>
        </div>

        {/* Countdown SVG ring */}
        <div className="bomb-reveal__countdown" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="bomb-countdown-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff8a4a" />
                <stop offset="100%" stopColor="#ff2020" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="none"
              stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle
              ref={countdownRef}
              cx="60" cy="60" r="54" fill="none"
              stroke="url(#bomb-countdown-grad)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 54} ${2 * Math.PI * 54}`}
              style={{ strokeDashoffset: 0 }}
            />
          </svg>
        </div>

        <div ref={labelRef} className="bomb-reveal__label">
          <div className="bomb-reveal__name">{memberName || "Bạn"}</div>
          <div className="bomb-reveal__text">
            {phase === "back"  && "Đang rút..."}
            {(phase === "flip" || phase === "face" || phase === "hold") && "💣 rút trúng bom!"}
            {phase === "explode" && "💥 NỔ!"}
            {phase === "fadeout" && "💚 An toàn"}
          </div>
        </div>
      </div>

      {/* Shockwave rings */}
      <div className="bomb-shockwaves" aria-hidden="true">
        {[0,1,2,3,4].map((i) => (
          <span
            key={i}
            ref={(el) => { shockRefs.current[i] = el; }}
            className="bomb-shockwave"
          />
        ))}
      </div>

      {/* Flash on explode */}
      {phase === "explode" && (
        <div className="bomb-camera-flash" aria-hidden="true" />
      )}
    </div>
  );
}

// ── BombExplode — full-screen fireball overlay ─────────────────────────
export function BombExplode({ memberName, onComplete }) {
  const [mounted, setMounted] = useState(true);
  const rootRef   = useRef(null);
  const flashRef  = useRef(null);
  const vignetteRef = useRef(null);
  const coreRef   = useRef(null);
  const ringRefs  = useRef([]);
  const flameRef  = useRef(null);
  const shardRefs = useRef([]);
  const sparkRefs = useRef([]);
  const puffRefs  = useRef([]);
  const labelRef  = useRef(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => { preloadAnime(); }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    let instances = [];

    (async () => {
      try {
        const animate = await getAnime();
        if (cancelled) return;

        // White flash: quick pop then fade.
        if (flashRef.current) {
          instances.push(animate(flashRef.current, {
            opacity: [0, 1, 0.6, 0],
            scale:   [0.6, 1.1, 1],
            duration: 380,
            ease:    "outQuad",
          }));
        }

        // Red vignette: fades in, stays
        if (vignetteRef.current) {
          instances.push(animate(vignetteRef.current, {
            opacity: [0, 0.85],
            duration: 400,
            delay: 80,
            ease:    "outQuad",
          }));
        }

        // Fireball core: scale 0→1.4 → 1.1, looping pulse.
        if (coreRef.current) {
          instances.push(animate(coreRef.current, {
            scale:   [0, 1.6, 1.1],
            opacity: [0, 1, 0.95],
            duration: 480,
            ease:    "outExpo",
          }));
          instances.push(animate(coreRef.current, {
            scale:   [1.1, 1.35, 1.1],
            duration: 600,
            delay:    480,
            loop:     true,
            alternate: true,
            ease:     "inOutSine",
          }));
        }

        // Flame ring: scale out + fade
        if (flameRef.current) {
          instances.push(animate(flameRef.current, {
            scale:   [0.3, 2.4],
            opacity: [0, 0.9, 0],
            duration: 900,
            ease:    "outExpo",
          }));
        }

        // Shockwave rings: stagger outward
        const rings = ringRefs.current.filter(Boolean);
        rings.forEach((r, i) => {
          instances.push(animate(r, {
            scale:   [0.2, 3.6],
            opacity: [0, 0.85, 0],
            duration: 1100,
            delay:    60 + i * 160,
            ease:    "outExpo",
          }));
        });

        // Shards
        const shards = shardRefs.current.filter(Boolean);
        shards.forEach((sp) => {
          const ang = parseFloat(sp.style.getPropertyValue("--ang")) || 0;
          const dist = parseFloat(sp.style.getPropertyValue("--dist")) || 320;
          const rad = (ang * Math.PI) / 180;
          instances.push(animate(sp, {
            translateX: [0, Math.cos(rad) * dist],
            translateY: [0, Math.sin(rad) * dist],
            scale:      [0.3, 1, 0.4],
            opacity:    [0, 1, 0],
            rotate:     [0, ang * 2],
            duration:   1400,
            delay:      parseFloat(sp.style.getPropertyValue("--delay")) || 0,
            ease:       "outExpo",
          }));
        });

        // Sparks
        const sparks = sparkRefs.current.filter(Boolean);
        sparks.forEach((sp) => {
          const ang = parseFloat(sp.style.getPropertyValue("--ang")) || 0;
          const dist = parseFloat(sp.style.getPropertyValue("--dist")) || 200;
          const rad = (ang * Math.PI) / 180;
          instances.push(animate(sp, {
            translateX: [0, Math.cos(rad) * dist],
            translateY: [0, Math.sin(rad) * dist],
            scale:      [0.2, 1.4, 0.6],
            opacity:    [0, 1, 0],
            rotate:     [0, ang * 1.5],
            duration:   1100,
            delay:      parseFloat(sp.style.getPropertyValue("--delay")) || 0,
            ease:       "outExpo",
          }));
        });

        // Smoke puffs
        const puffs = puffRefs.current.filter(Boolean);
        puffs.forEach((pf) => {
          const ang = parseFloat(pf.style.getPropertyValue("--ang")) || 0;
          const rad = (ang * Math.PI) / 180;
          instances.push(animate(pf, {
            translateX: [0, Math.cos(rad) * 140],
            translateY: [0, Math.sin(rad) * 140 - 40],
            scale:      [0.4, 2],
            opacity:    [0, 0.8, 0],
            duration:   1500,
            delay:      parseFloat(pf.style.getPropertyValue("--delay")) || 0,
            ease:       "outExpo",
          }));
        });

        // Label: pop in
        if (labelRef.current) {
          instances.push(animate(labelRef.current, {
            opacity:   [0, 1],
            scale:     [0.4, 1.1, 1],
            translateY: [20, 0],
            duration:  600,
            delay:     400,
            ease:      "outBack",
          }));
        }

        // Cleanup
        setTimeout(() => {
          if (cancelled) return;
          if (rootRef.current) {
            animate(rootRef.current, {
              opacity: [1, 0],
              duration: 360,
              ease:    "outQuad",
            });
          }
          setTimeout(() => {
            if (cancelled) return;
            setMounted(false);
            onCompleteRef.current?.();
          }, 360);
        }, 2400 - 360);
      } catch (_) { /* */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, []);

  if (!mounted) return null;

  return (
    <div ref={rootRef} className="bomb-explode-root bomb-explode-root--anime">
      <div ref={flashRef} className="bomb-explode-flash" aria-hidden="true" />
      <div ref={vignetteRef} className="bomb-explode-vignette" aria-hidden="true" />
      <div ref={coreRef} className="bomb-explode bomb-explode--core" aria-hidden="true">
        <div className="bomb-explode__core-inner" />
      </div>
      <div ref={flameRef} className="bomb-explode__flame-ring" aria-hidden="true" />
      {[0,1,2].map((i) => (
        <div
          key={i}
          ref={(el) => { ringRefs.current[i] = el; }}
          className={`bomb-explode bomb-explode__ring bomb-explode__ring--${i}`}
          aria-hidden="true"
        />
      ))}
      {Array.from({ length: 20 }).map((_, i) => (
        <span
          key={`shard-${i}`}
          ref={(el) => { shardRefs.current[i] = el; }}
          className="bomb-explode__shard"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            "--ang":   `${(i / 20) * 360}deg`,
            "--dist":  `${320 + (i % 4) * 90}px`,
            "--delay": `${60 + (i % 5) * 50}ms`,
          }}
        />
      ))}
      {Array.from({ length: 32 }).map((_, i) => (
        <span
          key={`sp-${i}`}
          ref={(el) => { sparkRefs.current[i] = el; }}
          className="bomb-explode__spark"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            "--ang":   `${((i * 17.3) % 360)}deg`,
            "--dist":  `${200 + ((i * 13) % 220)}px`,
            "--delay": `${30 + (i % 6) * 30}ms`,
            color:     i % 3 === 0 ? "#ffeb6b" : i % 3 === 1 ? "#ff8a4a" : "#ff4242",
          }}
        />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={`puff-${i}`}
          ref={(el) => { puffRefs.current[i] = el; }}
          className="bomb-explode__puff"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            "--ang":   `${(i / 8) * 360}deg`,
            "--delay": `${120 + (i % 4) * 80}ms`,
          }}
        />
      ))}
      <div ref={labelRef} className="bomb-explode-label">
        <div className="bomb-explode-label__glyph">💥</div>
        <div className="bomb-explode-label__text">
          {memberName ? `${memberName} đã nổ` : "Bạn đã nổ"}
        </div>
        <div className="bomb-explode-label__sub">Đã bị loại khỏi ván</div>
      </div>
    </div>
  );
}