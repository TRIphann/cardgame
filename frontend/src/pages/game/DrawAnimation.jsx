// DrawAnimation — cinematic rút bài, drive hoàn toàn bằng anime.js.
//
// Visual phases (timeline):
//   0ms     pop-off deck: scale 0→1.15, lift +30px, glow burst
//   220ms   arc-flight starts: parabolic motion deck → apex → target
//   220ms+ trail sparks start emitting along arc
//   520ms   apex flip: rotateY 0 → 180 if revealKey != bomb
//   740ms   landing impact: scale punch 1→1.4→1, burst fade-in
//   920ms   vanish: scale → 0.4 + opacity → 0 over 180ms
//   1100ms  onComplete fires
//
// All positions are computed in JS; no CSS keyframes needed.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

const FLIGHT_MS    = 520;
const FLIP_AT      = 0.55;  // fraction of flight when flip triggers
const LAND_DELAY   = 60;
const VANISH_MS    = 180;
const SPARK_N      = 14;

export function DrawAnimation({ sourceRect, targetRect, revealKey, onComplete }) {
  const [mounted, setMounted] = useState(true);
  const cardRef     = useRef(null);
  const haloRef     = useRef(null);
  const sparksRef   = useRef([]);
  const burstRef    = useRef(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => { preloadAnime(); }, []);

  useEffect(() => {
    if (!sourceRect || !targetRect) {
      setMounted(false);
      onCompleteRef.current?.();
      return undefined;
    }

    let cancelled = false;
    let instances = [];

    (async () => {
      try {
        const animate = await getAnime();
        if (cancelled) return;
        if (!cardRef.current || !haloRef.current) return;

        const startX = sourceRect.left + sourceRect.width / 2;
        const startY = sourceRect.top + sourceRect.height / 2;
        const endX   = targetRect.left + targetRect.width / 2;
        const endY   = targetRect.top + targetRect.height / 2;
        const cardW  = 110;
        const cardH  = 157;
        const apexX  = (startX + endX) / 2;
        const apexY  = Math.min(startY, endY) - 130;

        // Position card at deck start.
        const card = cardRef.current;
        card.style.left = `${startX - cardW / 2}px`;
        card.style.top  = `${startY - cardH / 2}px`;

        // Position halo at deck.
        const halo = haloRef.current;
        halo.style.left = `${startX - 90}px`;
        halo.style.top  = `${startY - 90}px`;

        // Phase 1: pop off deck
        const popInst = animate(card, {
          scale:    [0.6, 1.15, 1],
          opacity:  [0, 1],
          duration: 220,
          ease:     "outBack",
        });
        instances.push(popInst);

        const haloInst = animate(halo, {
          scale:    [0.4, 1.6],
          opacity:  [0, 0.9, 0],
          duration: 360,
          ease:     "outExpo",
        });
        instances.push(haloInst);

        // Phase 2: arc flight (parabolic). Use 3 keyframes via `keyframes` to
        // approximate the parabolic motion: start → apex (higher Y) → end.
        const flightInst = animate(card, {
          keyframes: [
            { left: `${startX - cardW / 2}px`, top: `${startY - cardH / 2}px`, scale: 1, ease: "inOutSine" },
            { left: `${apexX  - cardW / 2}px`, top: `${apexY  - cardH / 2}px`, scale: 1.1, ease: "outQuad" },
            { left: `${endX   - cardW / 2}px`, top: `${endY   - cardH / 2}px`, scale: 1, ease: "inQuad" },
          ],
          duration: FLIGHT_MS,
          delay: 220,
          ease: "linear",
        });
        instances.push(flightInst);

        // Phase 3: trail sparks following arc — each spark is positioned
        // along the arc at fraction t, animated with translate + fade.
        const sparks = sparksRef.current.filter(Boolean);
        if (sparks.length) {
          sparks.forEach((spark, i) => {
            const t = (i / (sparks.length - 1)) * 0.95;
            // Quadratic-Bezier-ish interpolation along arc.
            const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * apexX + t * t * endX;
            const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * apexY + t * t * endY;
            spark.style.left = `${x - 3}px`;
            spark.style.top  = `${y - 3}px`;

            const sparkInst = animate(spark, {
              scale:    [0.4, 1.4, 0.6],
              opacity:  [0, 0.95, 0],
              translateX: [0, (Math.random() - 0.5) * 30],
              translateY: [0, (Math.random() - 0.5) * 30],
              duration: 480 + Math.random() * 200,
              delay: 220 + i * 28,
              ease: "outExpo",
            });
            instances.push(sparkInst);
          });
        }

        // Phase 4: mid-flight flip (Y-axis)
        const flipAt = FLIGHT_MS * FLIP_AT + 220;
        if (revealKey && revealKey !== "bomb") {
          // We flip the inner .draw-card__inner element so the 3D rotation is
          // decoupled from position. Query for it.
          const inner = card.querySelector(".draw-card__inner");
          if (inner) {
            const flipInst = animate(inner, {
              rotateY: [0, 180],
              duration: 380,
              delay: flipAt,
              ease: "inOutQuad",
            });
            instances.push(flipInst);
            // Swap front face image at the midpoint of flip.
            setTimeout(() => {
              if (!cancelled) {
                const frontImg = card.querySelector(".draw-card__face--front img");
                if (frontImg) frontImg.src = cardImageUrl(revealKey);
              }
            }, flipAt + 190);
          }
        }

        // Phase 5: landing impact — burst fade-in + scale punch.
        const landAt = FLIGHT_MS + 220;
        if (burstRef.current) {
          const burst = burstRef.current;
          burst.style.left = `${endX - 60}px`;
          burst.style.top  = `${endY - 60}px`;
          const burstInst = animate(burst, {
            scale:    [0.4, 1.6, 1.2],
            opacity:  [0, 1, 0.7, 0],
            duration: 480,
            delay:    landAt,
            ease:     "outExpo",
          });
          instances.push(burstInst);
        }

        const punchInst = animate(card, {
          scale: [1, 1.32, 1.08, 1],
          duration: 360,
          delay: landAt,
          ease: "outBack",
        });
        instances.push(punchInst);

        // Phase 6: vanish
        const vanishAt = FLIGHT_MS + 220 + LAND_DELAY;
        const vanishInst = animate(card, {
          scale:    [1, 0.4],
          opacity:  [1, 0],
          duration: VANISH_MS,
          delay:    vanishAt,
          ease:     "inQuad",
        });
        instances.push(vanishInst);

        // Cleanup after the whole timeline.
        setTimeout(() => {
          if (cancelled) return;
          setMounted(false);
          onCompleteRef.current?.();
        }, vanishAt + VANISH_MS + 40);
      } catch (_) {
        /* anime.js load failed → CSS fallback */
      }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
     
  }, []);

  if (!mounted || !sourceRect || !targetRect) return null;

  return (
    <>
      {/* Halo at deck source */}
      <div
        ref={haloRef}
        className="draw-source-glow draw-source-glow--anime"
        style={{ width: 180, height: 180, position: "fixed", pointerEvents: "none", zIndex: 194 }}
      />

      {/* Trail sparks */}
      {Array.from({ length: SPARK_N }).map((_, i) => (
        <div
          key={`s-${i}`}
          ref={(el) => { sparksRef.current[i] = el; }}
          className="draw-trail-spark draw-trail-spark--anime"
          style={{
            position: "fixed",
            width: 6 + (i % 3) * 2,
            height: 6 + (i % 3) * 2,
            pointerEvents: "none",
            zIndex: 193,
          }}
        />
      ))}

      {/* The card */}
      <div
        ref={cardRef}
        className="draw-card draw-card--anime"
        style={{
          width: 110,
          height: 157,
          position: "fixed",
          zIndex: 196,
          pointerEvents: "none",
        }}
      >
        <div className="draw-card__inner">
          <div className="draw-card__face draw-card__face--back">
            <img src={cardImageUrl("back")} alt="" draggable={false} />
          </div>
          <div className="draw-card__face draw-card__face--front">
            <img src={cardImageUrl("back")} alt="" draggable={false} />
          </div>
        </div>
      </div>

      {/* Landing impact burst */}
      <div
        ref={burstRef}
        className="draw-landing-burst draw-landing-burst--anime"
        style={{
          width: 120,
          height: 120,
          position: "fixed",
          pointerEvents: "none",
          zIndex: 197,
        }}
      />
    </>
  );
}