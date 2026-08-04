// DrawAnimation — cinematic rút bài.
//
// Single card flips from face-down (deck back) to face-up (the drawn card)
// mid-flight. Travels from the deck pile to the hand with a smooth arc.
// No magic circles, no sparkles — just a clean card motion so the player
// can focus on the drawn card.
//
// Sequence:
//   1. Card peels off the top of the deck (back face).
//   2. Flies in an arc toward the player's hand.
//   3. If revealKey arrives (server returned a non-bomb card), flips the
//      card to its face mid-flight — at landing the player already sees
//      the drawn card.
//   4. Fades out as the hand absorbs it.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const FLIGHT_MS = 720;
const FLIP_AT_PCT = 0.55; // flip when ~55% through flight
const VANISH_MS = 280;

export function DrawAnimation({
  sourceRect,
  targetRect,
  cardKey = "back",
  revealKey,
  onComplete,
}) {
  const [mounted, setMounted] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const tFlip = setTimeout(() => {
      // Only flip when the server has told us what the card was.
      if (revealKey && revealKey !== "bomb") setFlipped(true);
    }, FLIGHT_MS * FLIP_AT_PCT);
    const tDone = setTimeout(() => setMounted(false), FLIGHT_MS + VANISH_MS);
    return () => { clearTimeout(tFlip); clearTimeout(tDone); };
    // Mount-once timer: we don't want to restart when `revealKey` updates
    // from the response. The flip will fire on the original schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted || !sourceRect || !targetRect) return null;

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  const cardW = 100;
  const cardH = 143;

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

  return (
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
  );
}