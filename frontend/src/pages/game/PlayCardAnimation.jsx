// PlayCardAnimation — lá bài bay từ tay người chơi lên discard pile, sau đó
// bung particle/rings theo CARD_FX (loại lá bài vừa đánh).
//
// Animation hoàn toàn drive bằng anime.js v4. CSS keyframes giữ làm fallback.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { FxBurst } from "./FxBurst.jsx";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

const FLIGHT_MS = 620;

export function PlayCardAnimation({ sourceRect, cardKey, targetRect }) {
  const [phase, setPhase] = useState("flying");
  const [mounted, setMounted] = useState(true);
  const cardRef = useRef(null);
  const haloRef = useRef(null);

  useEffect(() => { preloadAnime(); }, []);

  useEffect(() => {
    if (!sourceRect || !cardRef.current || !haloRef.current) return undefined;
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    let instances = [];

    (async () => {
      try {
        const animate = await getAnime();
        if (cancelled) return;

        const startX = sourceRect.left + sourceRect.width / 2;
        const startY = sourceRect.top + sourceRect.height / 2;
        const endX = targetRect ? targetRect.left + targetRect.width / 2 : startX;
        const endY = targetRect ? targetRect.top + targetRect.height / 2 : startY;

        const apexX = (startX + endX) / 2;
        const apexY = Math.min(startY, endY) - 80;
        const W = 86, H = 124;

        const card = cardRef.current;
        const halo = haloRef.current;

        // Initial position
        card.style.left = `${startX - W / 2}px`;
        card.style.top  = `${startY - H / 2}px`;
        halo.style.left = `${startX - 60}px`;
        halo.style.top  = `${startY - 60}px`;

        // Phase 1: pop + halo pulse
        instances.push(animate(card, {
          scale:    [0.7, 1.08, 1],
          opacity:  [0, 1],
          duration: 200,
          ease:     "outBack",
        }));
        instances.push(animate(halo, {
          scale:    [0.3, 1.4, 0.8],
          opacity:  [0, 0.8, 0],
          duration: 320,
          ease:     "outExpo",
        }));

        // Phase 2: parabolic arc flight via keyframes (start → apex → end).
        instances.push(animate(card, {
          keyframes: [
            { left: `${startX - W / 2}px`, top: `${startY - H / 2}px`, rotate: 0, ease: "inOutSine" },
            { left: `${apexX  - W / 2}px`, top: `${apexY  - H / 2}px`, rotate: -8, ease: "outQuad" },
            { left: `${endX   - W / 2}px`, top: `${endY   - H / 2}px`, rotate: 0, ease: "inQuad" },
          ],
          duration: FLIGHT_MS,
          delay: 200,
          ease: "linear",
        }));

        // Phase 3: spin Y mid-flight (3D flip illusion)
        instances.push(animate(card, {
          rotateY: [0, 180, 360],
          duration: FLIGHT_MS,
          delay: 200,
          ease: "inOutQuad",
        }));

        // Phase 4: landing punch + burst fire.
        setTimeout(() => {
          if (!cancelled) setPhase("burst");
        }, FLIGHT_MS + 200);

        instances.push(animate(card, {
          scale: [1, 1.3, 0.85],
          opacity: [1, 1, 0],
          duration: 280,
          delay: FLIGHT_MS + 200,
          ease: "outQuad",
        }));

        setTimeout(() => {
          if (!cancelled) {
            setPhase("done");
            setMounted(false);
          }
        }, FLIGHT_MS + 200 + 1100);
      } catch (_) { /* silent */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
     
  }, []);

  if (!mounted || !sourceRect) return null;

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect ? targetRect.left + targetRect.width / 2 : startX;
  const endY = targetRect ? targetRect.top + targetRect.height / 2 : startY;

  return (
    <>
      <div
        ref={haloRef}
        className="play-card-anim__halo play-card-anim__halo--anime"
        style={{
          position: "fixed",
          width: 120,
          height: 120,
          zIndex: 194,
          pointerEvents: "none",
          transform: "translate(-50%, -50%)",
          marginLeft: 0,
        }}
      />
      <div
        ref={cardRef}
        className={`play-card-anim play-card-anim--anime`}
        style={{
          position: "fixed",
          width: 86,
          height: 124,
          zIndex: 195,
          pointerEvents: "none",
          transformStyle: "preserve-3d",
        }}
      >
        <img src={cardImageUrl(cardKey)} alt={cardKey} draggable={false} />
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