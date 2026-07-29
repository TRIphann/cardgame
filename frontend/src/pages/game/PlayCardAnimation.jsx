// PlayCardAnimation — lá bài bay từ tay người chơi lên discard pile, sau đó
// bung particle/rings theo CARD_FX (loại lá bài vừa đánh).

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { FxBurst } from "./FxBurst.jsx";

const FLIGHT_MS = 620;

export function PlayCardAnimation({ sourceRect, cardKey, targetRect }) {
  const [phase, setPhase] = useState("flying"); // flying → burst → done
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("burst"), FLIGHT_MS);
    const t2 = setTimeout(() => setPhase("done"), FLIGHT_MS + 900);
    const t3 = setTimeout(() => setMounted(false), FLIGHT_MS + 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (!mounted || !sourceRect) return null;

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect ? targetRect.left + targetRect.width / 2 : startX;
  const endY = targetRect ? targetRect.top + targetRect.height / 2 : startY;

  return (
    <>
      <div
        className={`play-card-anim play-card-anim--${phase}`}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 86,
          height: 124,
          zIndex: 195,
          pointerEvents: "none",
          "--start-x": `${startX - 43}px`,
          "--start-y": `${startY - 62}px`,
          "--end-x":   `${endX   - 43}px`,
          "--end-y":   `${endY   - 62}px`,
        }}
      >
        <img src={cardImageUrl(cardKey)} alt={cardKey} draggable={false} />
        <span className="play-card-anim__halo" aria-hidden="true" />
      </div>

      {phase === "burst" && targetRect && (
        <FxBurst
          anchor={{ x: endX, y: endY }}
          fxKey={cardKey}
          size="lg"
          id={`play-${cardKey}-${Date.now()}`}
        />
      )}
    </>
  );
}