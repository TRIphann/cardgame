// DrawAnimation — cinematic rút bài.
//
// Card peels off the top of the deck (back face), flies in an arc toward
// the player's hand, flips mid-flight, then GLOW-PUNCHES into the hand and
// vanishes — no lingering ghost cards.
//
// Visual phases:
//   1. Pop off deck (scale up + lift)
//   2. Arc flight with trailing sparks
//   3. Y-axis flip at apex (mid-flight)
//   4. Landing impact: glow burst + scale punch + immediate vanish

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const FLIGHT_MS  = 520;   // total animation duration (ms)
const FLIP_AT    = 0.45;  // fraction of flight when flip triggers (0–1)
const LAND_DELAY = 60;     // ms after landing before vanish starts
const VANISH_MS  = 180;   // vanish fade+scale duration
const SPARK_N    = 14;    // trail spark count

export function DrawAnimation({
  sourceRect,
  targetRect,
  revealKey,
  onComplete,
}) {
  const [mounted, setMounted] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!sourceRect || !targetRect) {
      setMounted(false);
      onCompleteRef.current?.();
      return undefined;
    }
    // Flip triggers at FLIGHT_MS * FLIP_AT of the flight.
    const tFlip = setTimeout(() => {
      if (revealKey && revealKey !== "bomb") setFlipped(true);
    }, FLIGHT_MS * FLIP_AT);

    // After landing impact delay, vanish the card.
    const tVanish = setTimeout(() => {
      setMounted(false);
      // Call onComplete after the vanish transition finishes.
      setTimeout(() => onCompleteRef.current?.(), VANISH_MS);
    }, FLIGHT_MS + LAND_DELAY);

    return () => { clearTimeout(tFlip); clearTimeout(tVanish); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted || !sourceRect || !targetRect) return null;

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX   = targetRect.left + targetRect.width / 2;
  const endY   = targetRect.top + targetRect.height / 2;
  const cardW  = 110;
  const cardH  = 157;

  // Apex of the arc (higher than both start & end).
  const apexX  = (startX + endX) / 2;
  const apexY  = Math.min(startY, endY) - 110;

  // Landing position (end of flight).
  const endScaledX = endX - cardW / 2;
  const endScaledY = endY - cardH / 2;

  const showFace = flipped && !!revealKey && revealKey !== "bomb";

  // Trail sparks staggered along the arc.
  const sparks = Array.from({ length: SPARK_N }).map((_, i) => ({
    i,
    // Interpolate position along the arc at fraction t.
    t:     (i / (SPARK_N - 1)) * 0.85,
    delay: (i / SPARK_N) * FLIGHT_MS * 0.65,
    size:  3 + (i % 3) * 2,
  }));

  return (
    <>
      {/* Trail sparks — follow the card arc then dissipate */}
      {sparks.map((s) => {
        const frac  = s.t;
        const x     = startX + (apexX - startX) * frac + (endX - apexX) * frac;
        const y     = startY + (apexY - startY) * frac + (endY - apexY) * frac;
        const sx    = x - 3;
        const sy    = y - 3;
        return (
          <div
            key={s.i}
            className="draw-trail-spark"
            style={{
              left:       sx,
              top:        sy,
              width:      s.size,
              height:     s.size,
              animationDelay: `${s.delay}ms`,
            }}
          />
        );
      })}

      {/* Glow halo at deck source — "something is leaving" */}
      <div
        className="draw-source-glow"
        style={{
          left:   startX - 90,
          top:    startY - 90,
          width:  180,
          height: 180,
        }}
      />

      {/* The card itself */}
      <div
        className={`draw-card${showFace ? " draw-card--flipped" : ""}`}
        style={{
          width:                  cardW,
          height:                 cardH,
          ["--dc-start-x"]:       `${startX - cardW / 2}px`,
          ["--dc-start-y"]:       `${startY - cardH / 2}px`,
          ["--dc-apex-x"]:        `${apexX - cardW / 2}px`,
          ["--dc-apex-y"]:        `${apexY - cardH / 2}px`,
          ["--dc-end-x"]:         `${endScaledX}px`,
          ["--dc-end-y"]:         `${endScaledY}px`,
          ["--dc-flip-at"]:       FLIGHT_MS * FLIP_AT,
        }}
      >
        <div className="draw-card__inner">
          <div className="draw-card__face draw-card__face--back">
            <img src={cardImageUrl("back")} alt="" draggable={false} />
          </div>
          <div className="draw-card__face draw-card__face--front">
            {showFace && (
              <img src={cardImageUrl(revealKey)} alt={revealKey} draggable={false} />
            )}
          </div>
        </div>
      </div>

      {/* Landing impact burst */}
      <div
        className="draw-landing-burst"
        style={{
          left:   endX,
          top:    endY,
        }}
      />
    </>
  );
}
