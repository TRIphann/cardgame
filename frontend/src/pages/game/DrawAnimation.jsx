// DrawAnimation — cinematic rút bài.
//
// Card peels off the top of the deck (back face), flies in an arc towards
// the player's hand, then flips to its face mid-flight. Lands smoothly with
// a soft glow that fades as the hand absorbs the card.
//
// Visual stack:
//   1. Trail particle fountain (gold) following the card mid-flight
//   2. Soft glow halo behind the card
//   3. The card itself, flipping around the Y axis
//   4. Sparkle burst at the hand on landing

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const FLIGHT_MS = 780;
const FLIP_AT_PCT = 0.55;
const VANISH_MS = 320;
const SPARK_COUNT = 12;

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
    const tFlip = setTimeout(() => {
      if (revealKey && revealKey !== "bomb") setFlipped(true);
    }, FLIGHT_MS * FLIP_AT_PCT);
    const tDone = setTimeout(() => {
      setMounted(false);
      onCompleteRef.current?.();
    }, FLIGHT_MS + VANISH_MS);
    return () => { clearTimeout(tFlip); clearTimeout(tDone); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted || !sourceRect || !targetRect) return null;

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  const cardW = 110;
  const cardH = 157;

  const cardStyle = {
    position: "fixed",
    left: 0,
    top: 0,
    width: cardW,
    height: cardH,
    zIndex: 200,
    pointerEvents: "none",
    "--start-x": `${startX - cardW / 2}px`,
    "--start-y": `${startY - cardH / 2}px`,
    "--end-x":   `${endX   - cardW / 2}px`,
    "--end-y":   `${endY   - cardH / 2}px`,
  };

  const showFace = flipped && !!revealKey && revealKey !== "bomb";

  // Trail particles - 12 small sparks that follow the card mid-flight
  const trail = Array.from({ length: SPARK_COUNT }).map((_, i) => ({
    i,
    delay: (i / SPARK_COUNT) * FLIGHT_MS * 0.7,
    size: 4 + (i % 3) * 2,
  }));

  return (
    <>
      {/* Trail particle fountain following the card */}
      <div className="draw-anim-trail" style={cardStyle}>
        {trail.map((t) => (
          <span
            key={t.i}
            className="draw-anim-trail__spark"
            style={{
              "--delay": `${t.delay}ms`,
              width: `${t.size}px`,
              height: `${t.size}px`,
            }}
          />
        ))}
      </div>

      {/* Glow halo at the source (deck) - signals something was drawn */}
      <div
        className="draw-anim-halo"
        style={{
          position: "fixed",
          left: startX - 80,
          top: startY - 80,
          width: 160,
          height: 160,
          pointerEvents: "none",
          zIndex: 199,
        }}
      />

      {/* The card itself */}
      <div className="draw-anim" style={cardStyle}>
        <div className={`draw-anim__inner${showFace ? " draw-anim__inner--flipped" : ""}`}>
          <div className="draw-anim__face draw-anim__face--back">
            <img src={cardImageUrl("back")} alt="" draggable={false} />
          </div>
          <div className="draw-anim__face draw-anim__face--front">
            {showFace && (
              <img src={cardImageUrl(revealKey)} alt={revealKey} draggable={false} />
            )}
          </div>
        </div>
      </div>

      {/* Sparkle burst at landing target */}
      <div
        className="draw-anim-burst"
        style={{
          position: "fixed",
          left: endX,
          top: endY,
          width: 0,
          height: 0,
          pointerEvents: "none",
          zIndex: 201,
        }}
        aria-hidden="true"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="draw-anim-burst__spark"
            style={{
              "--angle": `${(i / 8) * 360}deg`,
            }}
          />
        ))}
      </div>
    </>
  );
}
