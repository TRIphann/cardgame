// ActionCardReveal — 3D card flip rendered in the centre of the screen.
//
// Renders ONE card (back face) that flips to the front face (the played
// action card). Originates from the deck pile (originRect) and flies
// towards viewport centre while flipping. All players in the room see it
// so anyone can chain a Nope during the 5s reaction window.
//
// Visual stack (back to front):
//   1. Glow halo (pulsing aura tinted by card color)
//   2. 3D card flying from deck → centre with full Y-flip
//   3. Label below with Nope countdown
//
// We use a proper 3D scene wrapper so the back face is hidden via
// backface-visibility inside a transformed container.

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";

const FLIP_MS = 720;
const HOLD_MS = 5000; // mirror server's 5s nope window
const EXIT_MS = 400;
const CARD_W = 220;
const CARD_H = 314;

const HALO_COLOR = {
  attack: "rgba(255, 88, 88, 0.55)",
  skip: "rgba(122, 223, 255, 0.55)",
  favor: "rgba(255, 215, 130, 0.55)",
  future: "rgba(154, 120, 255, 0.55)",
  shuffle: "rgba(95, 220, 182, 0.55)",
  nope: "rgba(255, 90, 110, 0.55)",
  general: "rgba(255, 215, 160, 0.55)",
};

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
  const haloColor = HALO_COLOR[safeCardKey] || HALO_COLOR.general;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const endX = vw / 2 - CARD_W / 2;
  const endY = vh / 2 - CARD_H / 2;

  let startX = endX;
  let startY = endY;
  let inFlight = false;
  if (originRect && originRect.width && originRect.height) {
    startX = originRect.left + (originRect.width - CARD_W) / 2;
    startY = originRect.top + (originRect.height - CARD_H) / 2;
    inFlight = true;
  }

  const cssVars = {
    "--card-w": `${CARD_W}px`,
    "--card-h": `${CARD_H}px`,
    "--start-x": `${startX}px`,
    "--start-y": `${startY}px`,
    "--end-x": `${endX}px`,
    "--end-y": `${endY}px`,
    "--halo-color": haloColor,
  };

  const wrapperClass = `card-flip${inFlight ? " card-flip--in-flight" : ""}${phase === "out" ? " card-flip--out" : ""}`;
  const remainingSec = nopeRemainingMs != null ? Math.max(0, nopeRemainingMs / 1000) : null;

  return (
    <>
      <div className="card-flip-scene" aria-hidden="true">
        <div className="card-flip-halo" style={cssVars} />
        <div
          className={wrapperClass}
          style={cssVars}
          aria-label={`${byMemberName || ""} vừa dùng ${meta.label}`}
        >
          <div className="card-flip__inner">
            <div className="card-flip__face card-flip__face--back">
              <img src={cardImageUrl("back")} alt="" draggable={false} />
            </div>
            <div className="card-flip__face card-flip__face--front">
              <img src={url || cardImageUrl("back")} alt={meta.label} draggable={false} />
            </div>
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
