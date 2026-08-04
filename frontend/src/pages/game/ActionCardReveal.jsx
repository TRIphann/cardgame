// ActionCardReveal — 3D card flip rendered in the centre of the screen.
//
// Renders ONE card (back face) that flips to the front face (the played
// action card). Originates from the deck pile (originRect) and flies
// towards viewport centre while flipping. All players in the room see it
// so anyone can chain a Nope during the 5s reaction window.
//
// Minimal visual: no border, no box, no scrim, no rays, no glyph. The
// card image itself does all the talking.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

const FLIP_MS = 700;
const HOLD_MS = 5000; // mirror server's 5s nope window
const EXIT_MS = 360;

export function ActionCardReveal({
  cardKey,
  byMemberName,
  isNopeChain,
  chainCount,
  nopeRemainingMs,
  originRect,
}) {
  const [show, setShow] = useState(true);
  const [phase, setPhase] = useState("in"); // in → hold → out

  // Auto unmount after hold + exit.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), FLIP_MS);
    const t2 = setTimeout(() => setPhase("out"), FLIP_MS + HOLD_MS);
    const t3 = setTimeout(() => setShow(false), FLIP_MS + HOLD_MS + EXIT_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (!show) return null;

  const safeCardKey = cardKey || "general";
  const url = cardImageUrl(safeCardKey);
  const meta = getCardLabel(safeCardKey);

  // Compute flight start/end coordinates. If we know the deck rect, fly
  // from there to viewport centre. Otherwise just stay centred.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const cardW = 180;
  const cardH = 257;
  const endX = vw / 2 - cardW / 2;
  const endY = vh / 2 - cardH / 2;
  let startX = endX;
  let startY = endY;
  let inFlight = false;
  if (originRect && originRect.width) {
    startX = originRect.left + (originRect.width - cardW) / 2;
    startY = originRect.top + (originRect.height - cardH) / 2;
    inFlight = true;
  }

  const wrapperStyle = inFlight
    ? {
        "--start-x": `${startX}px`,
        "--start-y": `${startY}px`,
        "--end-x": `${endX}px`,
        "--end-y": `${endY}px`,
      }
    : {
        left: `${endX}px`,
        top: `${endY}px`,
      };

  const wrapperClass = `card-flip${inFlight ? " card-flip--in-flight" : ""}${phase === "out" ? " card-flip--out" : ""}`;
  const remainingSec = nopeRemainingMs != null ? Math.max(0, nopeRemainingMs / 1000) : null;

  return (
    <>
      <div
        className={wrapperClass}
        style={wrapperStyle}
        aria-label={`${byMemberName || ""} vừa dùng ${meta.label}`}
      >
        <div className="card-flip__inner">
          <div className="card-flip__face card-flip__face--back">
            <img src={cardImageUrl("back")} alt="" draggable={false} />
          </div>
          <div className="card-flip__face card-flip__face--front">
            <img src={url} alt={meta.label} draggable={false} />
          </div>
        </div>
      </div>
      {phase !== "out" && (
        <div className="card-flip-label">
          <span>
            {byMemberName || (isNopeChain ? "Ai đó" : "Bạn")}
            {isNopeChain
              ? ` đã dùng Cản${chainCount > 1 ? ` × ${chainCount}` : ""}`
              : ` đã dùng ${meta.label}`}
          </span>
          {remainingSec != null && (
            <span className="card-flip-label__count">
              {remainingSec.toFixed(1)}s để cản
            </span>
          )}
        </div>
      )}
    </>
  );
}