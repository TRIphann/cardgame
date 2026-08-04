// DrawAnimation — cinematic rút bài. Phiên bản nâng cấp:
//   1. Card 3D xoay từ "nằm trong deck" → bay lên → vào tay
//   2. Glow trail theo path
//   3. Sparkles tỏa ra lúc cất vào tay (FxBurst)
//   4. Magic-circle glow dưới deck + dưới tay để anchor
//
// Card back làm texture khi rút (vì người rút không biết lá gì). Sau khi
// response về server, parent có thể re-mount với `revealKey` để card flip
// mở mặt.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { FxBurst } from "./FxBurst.jsx";

const FLIGHT_MS = 850;
const REVEAL_FLIP_MS = 350;
const VANISH_MS = 280;

export function DrawAnimation({ sourceRect, targetRect, cardKey = "back", revealKey, onComplete }) {
  const [phase, setPhase] = useState("flying"); // flying → landing → done
  const [mounted, setMounted] = useState(true);
  // Stash the latest onComplete in a ref so we don't restart the animation
  // when the parent re-renders with a new callback closure (e.g. after the
  // draw response lands and we set the revealKey). The original bug was that
  // the back card kept showing because the timeouts were being cleared and
  // re-armed on every re-render.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("landing"), FLIGHT_MS - 80);
    const t2 = setTimeout(() => setPhase("done"), FLIGHT_MS + 40);
    // Wait long enough for the vanish animation to finish before unmounting.
    const t3 = setTimeout(() => {
      setMounted(false);
      onCompleteRef.current?.();
    }, FLIGHT_MS + 40 + VANISH_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (!mounted || !sourceRect || !targetRect) return null;

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;

  // Card 3D starts flat (matching the deck perspective), rotates upright
  // mid-flight, then lands on the hand.
  const cardStyle = {
    position: "fixed",
    left: 0,
    top: 0,
    width: 92,
    height: 132,
    zIndex: 200,
    pointerEvents: "none",
    "--start-x": `${startX - 46}px`,
    "--start-y": `${startY - 66}px`,
    "--end-x":   `${endX   - 46}px`,
    "--end-y":   `${endY   - 66}px`,
  };

  const showFace = !!revealKey;

  return (
    <>
      {/* Magic circle under the deck while flying */}
      <span
        className="fx-magic-circle"
        style={{
          position: "fixed",
          left: startX,
          top: startY + sourceRect.height / 2 + 6,
          transform: "translateX(-50%)",
          zIndex: 198,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />

      {/* Trailing glow */}
      <span
        className="fx-draw-trail"
        style={{
          position: "fixed",
          left: startX,
          top: startY,
          width: 200,
          height: 200,
          transform: "translate(-50%, -50%)",
          zIndex: 199,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />

      {/* Flying card */}
      <div className={`draw-anim draw-anim--${phase}${showFace ? " draw-anim--reveal" : ""}`} style={cardStyle}>
        <div className="draw-anim__inner">
          <div className="draw-anim__face draw-anim__face--back">
            <img src={cardImageUrl("back")} alt="" draggable={false} />
          </div>
          {showFace && (
            <div className="draw-anim__face draw-anim__face--front">
              <img src={cardImageUrl(revealKey)} alt={revealKey} draggable={false} />
            </div>
          )}
        </div>
      </div>

      {/* Magic ring under the receiving hand */}
      <span
        className="fx-magic-circle fx-magic-circle--target"
        style={{
          position: "fixed",
          left: endX,
          top: endY,
          transform: "translate(-50%, -50%)",
          zIndex: 197,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />

      {/* Sparkles when the card "lands" */}
      {phase === "landing" && (
        <FxBurst
          anchor={{ x: endX, y: endY }}
          fxKey={showFace ? revealKey : "draw"}
          size="lg"
          id={`draw-${Date.now()}`}
        />
      )}
    </>
  );
}