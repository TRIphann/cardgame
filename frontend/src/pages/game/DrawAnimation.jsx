// DrawAnimation — a transient overlay that flies a "card" sprite from the
// deck to your hand. Used when a player draws a non-bomb card so the deck
// pile visibly loses a layer.

import React, { useEffect, useState } from "react";
import { CARD_CLOUDINARY } from "@games/exploding-cats/cardCloudinary.js";

function urlFor(key) {
  return CARD_CLOUDINARY.cards[key] || "";
}

const FLIGHT_MS = 700;

export function DrawAnimation({ sourceRect, targetRect, cardKey, onComplete }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setMounted(false);
      onComplete?.();
    }, FLIGHT_MS);
    return () => clearTimeout(id);
  }, [onComplete]);

  if (!mounted || !sourceRect || !targetRect) return null;

  const url = urlFor(cardKey);
  // Compute the start/end in fixed coords. Because the player viewport is
  // not always 100vh-tall we use viewport-relative coordinates.
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;

  const style = {
    position: "fixed",
    left: 0, top: 0,
    width: 80, height: 116,
    transform: `translate(${startX - 40}px, ${startY - 58}px)`,
    transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.5, 0.0, 0.4, 1)`,
    zIndex: 200,
    pointerEvents: "none",
  };

  // After mount, kick the transition by mutating transform via a ref-less trick.
  // Easiest: schedule the destination transform on next tick.
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = document.getElementById("draw-anim-node");
        if (node) {
          node.style.transform = `translate(${endX - 40}px, ${endY - 58}px) scale(0.6)`;
          node.style.opacity = "0";
        }
      });
    });
  }, [endX, endY]);

  return (
    <div id="draw-anim-node" className="draw-anim" style={style}>
      {url ? (
        <img src={url} alt={cardKey} style={{ width: "100%", height: "100%", borderRadius: 9 }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "#1a1a4e", borderRadius: 9 }} />
      )}
    </div>
  );
}
