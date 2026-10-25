// ActionCardReveal — 3D card flip rendered in the centre of the screen.
//
// Visual stack (back to front):
//   1. Glow halo (pulsing aura tinted by card color)
//   2. 3D card flying from deck → centre with full Y-flip
//   3. Label below with Nope countdown
//
// Animation drive bằng anime.js:
//   • Halo: pulse loop scale + opacity
//   • Card: arc-flight keyframes + rotateY flip
//   • Label: pop in
//   • Exit: scale + opacity fade-out
//
// CSS keyframes giữ làm fallback.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getCardLabel } from "./cardLabels.js";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

const FLIP_MS = 720;
// HOLD_MS removed (was 5000): every action is now a 10s unified budget.
// The card flips in, shows for EXIT_MS, then fades out — no more 5s lock.
// The 10s turn timer / Nope window continues to count independently in
// the header / picker so the player can still react to the played card.
const HOLD_MS = 0;
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
  const [phase, setPhase] = useState("in");
  const haloRef  = useRef(null);
  const cardRef  = useRef(null);
  const innerRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => { preloadAnime(); }, []);

  // Drive the in/hold/out phase transitions. The `key` prop on
  // <ActionCardReveal> (set to `${at}::${chain}::${cardKey}` in GamePage)
  // forces a remount on every new card — so we don't need a module-level
  // mutex here. The previous code used a module-level `_activeInstance`
  // flag, but that flag was only cleared on unmount, which created a
  // window where a NEW reveal mounted while an OLD timer was still
  // finishing — the new reveal saw the flag set and called `setShow(false)`,
  // rendering nothing while the player waited up to 6s for any feedback.
  // Removing the flag fixes the "card reveals blank / face-down when a new
  // card is played during the action window" symptom.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), FLIP_MS);
    const t2 = setTimeout(() => setPhase("out"), FLIP_MS + HOLD_MS);
    const t3 = setTimeout(() => setShow(false), FLIP_MS + HOLD_MS + EXIT_MS);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, []);

  // Anime.js driven animation
  useEffect(() => {
    if (!show || !cardRef.current || !haloRef.current || !innerRef.current) return undefined;
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    let instances = [];

    (async () => {
      try {
        const animate = await getAnime();
        if (cancelled) return;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const endX = vw / 2 - CARD_W / 2;
        const endY = vh / 2 - CARD_H / 2;

        let startX = endX, startY = endY, inFlight = false;
        if (originRect && originRect.width && originRect.height) {
          startX = originRect.left + (originRect.width - CARD_W) / 2;
          startY = originRect.top + (originRect.height - CARD_H) / 2;
          inFlight = true;
        }

        const apexX = (startX + endX) / 2;
        const apexY = Math.min(startY, endY) - 90;

        const card  = cardRef.current;
        const inner = innerRef.current;
        const halo  = haloRef.current;

        // Halo: pulse loop from start.
        instances.push(animate(halo, {
          scale:   [0.5, 1.4, 1.1],
          opacity: [0, 0.9, 0.7],
          duration: 800,
          ease:    "outExpo",
        }));
        instances.push(animate(halo, {
          scale:    [1.1, 1.4, 1.1],
          opacity:  [0.7, 0.4, 0.7],
          duration: 1500,
          delay:    800,
          loop:     true,
          alternate: true,
          ease:     "inOutSine",
        }));

        if (inFlight) {
          // Card: arc-flight via keyframes
          instances.push(animate(card, {
            keyframes: [
              { left: `${startX}px`, top: `${startY}px`, scale: 0.85, ease: "inOutSine" },
              { left: `${apexX}px`,  top: `${apexY}px`,  scale: 1.1,  ease: "outQuad" },
              { left: `${endX}px`,   top: `${endY}px`,   scale: 1,    ease: "inQuad" },
            ],
            duration: FLIP_MS,
            ease:     "linear",
          }));
        } else {
          // Pop in
          instances.push(animate(card, {
            scale:    [0.4, 1.1, 1],
            opacity:  [0, 1],
            duration: 460,
            ease:     "outBack",
          }));
        }

        // Flip Y at FLIP_MS / 2 (mid-flight) — independent of position.
        // Use a subtle scale + brightness pulse instead of a full 3D flip
        // so the player doesn't get disoriented by the spinning card.
        // BUGFIX-2026-09-16: keep rotateY locked at 180deg throughout the
        // pulse. Use a STRING value instead of `[180, 180]` because the
        // array form is treated as a no-op by anime.js when start === end
        // — leaving the inner's transform string unset, which lets the
        // browser fall back to the LITERAL back-of-card image. A plain
        // string is always written into `style.transform`, so the inline
        // rotateY(180deg) survives every subsequent scale / filter pulse.
        instances.push(animate(inner, {
          scale:    [1, 0.85, 1],
          rotateY:  "180deg",
          filter:   ["brightness(1)", "brightness(1.6)", "brightness(1)"],
          duration: 380,
          delay:    FLIP_MS * 0.45,
          ease:     "inOutQuad",
        }));

        // Label pop-in
        if (labelRef.current) {
          instances.push(animate(labelRef.current, {
            opacity:   [0, 1],
            scale:     [0.7, 1.04, 1],
            translateY: [20, 0],
            duration:  500,
            delay:     FLIP_MS,
            ease:      "outBack",
          }));
        }

        // Exit at phase="out"
        const cleanupExit = () => {
          if (cancelled) return;
          if (card) {
            animate(card, {
              opacity: [1, 0],
              scale:   [1, 0.7],
              duration: EXIT_MS,
              ease:     "outQuad",
            });
          }
          if (halo) {
            animate(halo, {
              opacity: [0.7, 0],
              scale:   [1, 1.6],
              duration: EXIT_MS,
              ease:     "outQuad",
            });
          }
        };
        const exitId = setTimeout(cleanupExit, FLIP_MS + HOLD_MS);
        instances.push({ cancel: () => clearTimeout(exitId) });
      } catch (_) { /* */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, [show, cardKey, originRect?.left, originRect?.top]);

  if (!show) return null;

  const safeCardKey = cardKey || "general";
  const url = cardImageUrl(safeCardKey);
  const meta = getCardLabel(safeCardKey);
  const haloColor = HALO_COLOR[safeCardKey] || HALO_COLOR.general;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const endX = vw / 2 - CARD_W / 2;
  const endY = vh / 2 - CARD_H / 2;

  const cssVars = {
    "--card-w": `${CARD_W}px`,
    "--card-h": `${CARD_H}px`,
    "--halo-color": haloColor,
  };

  const wrapperClass = `card-flip card-flip--anime${phase === "out" ? " card-flip--out" : ""}`;
  const remainingSec = nopeRemainingMs != null ? Math.max(0, nopeRemainingMs / 1000) : null;

  return (
    <>
      <div className="card-flip-scene" aria-hidden="true">
        <div
          ref={haloRef}
          className="card-flip-halo card-flip-halo--anime"
          style={{ ...cssVars, left: `${endX + CARD_W / 2}px`, top: `${endY + CARD_H / 2}px` }}
        />
        <div
          ref={cardRef}
          className={wrapperClass}
          style={{
            ...cssVars,
            left: `${endX}px`,
            top: `${endY}px`,
            width: `${CARD_W}px`,
            height: `${CARD_H}px`,
            transformStyle: "preserve-3d",
          }}
          aria-label={`${byMemberName || ""} vừa dùng ${meta.label}`}
        >
          {/* BUGFIX-2026-09-16: explicit rotateY(180deg) so the FRONT face
              is visible from mount. Without this the inner stays at
              rotateY(0) which shows the LITERAL back-of-card image (the
              user called this "the reveal shows face-down instead of the
              played card"). The CSS keyframe animation that would flip the
              inner 0→180 is disabled by the `--anime` class — the JS
              pulse animation never rotates the inner, so the static
              rotateY(0) state was the only thing visible. Setting the
              inline transform to 180deg makes the front face the one
              facing the camera while still keeping the JS scale/brightness
              pulse animation working. */}
          <div
            ref={innerRef}
            className="card-flip__inner"
            style={{ transform: "rotateY(180deg)" }}
          >
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
        <div ref={labelRef} className="card-flip-label">
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