// useDeckAnimation — drives the deck + 4 flying cards on the lobby page.
//
// State machine:
//   idle (wiggle 5s → wiggle 4s → wiggle 2s) → flying (4 cards orbit around
//   the deck via requestAnimationFrame; when each card's orbit-angle lands
//   near the front of the camera it flips to reveal the card face, holds
//   1.5s, then flips back) → return to deck → idle.
//
// `wiggleLevel` controls which CSS class the deck uses for its idle wiggle.
// `flyingCards` is an array of refs the hook writes inline transforms into.
//
// The hook returns { wiggleLevel, isFlying, setWiggleLevel } so the React
// component only needs to render the markup; all timing logic is here.

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

const N = 4;
const PHASE_OFFSET = (Math.PI * 2) / N;
const ORBIT_RADIUS = 95;
const ORBIT_DURATION_MS = 9000;
const REVEAL_HOLD_MS = 1500;

const TIMINGS = {
  wiggle1Delay: 5000,
  wiggle2Delay: 4000,
  wiggle3Delay: 2000,
  returnDelay: 480,
};

function placeholderCard() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function useDeckAnimation({ cardImageUrls }) {
  const reduced = useReducedMotion();
  const [wiggleLevel, setWiggleLevel] = useState(0); // 0 idle, 1/2/3 = wiggle level
  const [isFlying, setIsFlying] = useState(false);
  const [phase, setPhase] = useState("idle"); // 'idle' | 'flying' | 'returning'

  const timeoutsRef = useRef([]);
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);

  const clearTimers = () => {
    for (const id of timeoutsRef.current) clearTimeout(id);
    timeoutsRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  useEffect(() => () => clearTimers(), []);

  // Entry: start idle cycle.
  useEffect(() => {
    setPhase("idle");
    setWiggleLevel(0);

    if (reduced) {
      // For motion-reduced users we still show the cycle but without
      // transform-based motion; we just reveal cards sequentially instead.
      const id = setInterval(() => {
        setPhase("flying");
        setTimeout(() => setPhase("idle"), 3000);
      }, 12000);
      timeoutsRef.current.push(id);
      return () => {
        for (const t of timeoutsRef.current) clearTimeout(t);
        timeoutsRef.current = [];
      };
    }

    const w1 = setTimeout(() => setWiggleLevel(1), TIMINGS.wiggle1Delay);
    timeoutsRef.current.push(w1);
    return () => clearTimers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle cascade.
  useEffect(() => {
    if (phase !== "idle") return;
    if (wiggleLevel === 1) {
      const id = setTimeout(() => setWiggleLevel(2), TIMINGS.wiggle2Delay);
      timeoutsRef.current.push(id);
    } else if (wiggleLevel === 2) {
      const id = setTimeout(() => setWiggleLevel(3), TIMINGS.wiggle3Delay);
      timeoutsRef.current.push(id);
    } else if (wiggleLevel === 3) {
      setPhase("flying");
    }
  }, [phase, wiggleLevel]);

  // rAF orbit while phase === "flying".
  useEffect(() => {
    if (phase !== "flying" || reduced) return;

    // Pick random face images for each flying card.
    const cards = [];
    for (let i = 0; i < N; i += 1) {
      const url = cardImageUrls[Math.floor(Math.random() * cardImageUrls.length)];
      cards.push(url);
    }

    // Write to a global so the lobby component can read face URLs (it's
    // mounted once but receives them via prop).
    flyingCardUrlsRef.current = cards;

    startTimeRef.current = performance.now();
    setIsFlying(true);

    const tick = (now) => {
      const elapsed = now - startTimeRef.current;
      const baseAngle = (elapsed / ORBIT_DURATION_MS) * Math.PI * 2;

      for (let i = 0; i < N; i += 1) {
        const angle = baseAngle + i * PHASE_OFFSET;
        const x = Math.sin(angle) * ORBIT_RADIUS;
        const y = -Math.cos(angle) * ORBIT_RADIUS;
        const tilt = Math.sin(angle) * 8;
        const depth = Math.cos(angle);
        const scale = 0.9 + (0.2 * (depth + 1)) / 2;

        const transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotateZ(${tilt.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
        const zIndex = String(100 + Math.round(depth * 10));
        const revealed = depth > 0.85;

        const node = flyingCardRefs.current[i];
        if (!node) continue;
        node.style.transform = transform;
        node.style.zIndex = zIndex;
        node.classList.toggle("revealed", revealed);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const cycleMs = ORBIT_DURATION_MS + REVEAL_HOLD_MS + 400;
    const cycle = setTimeout(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      setPhase("returning");
    }, cycleMs);

    timeoutsRef.current.push(cycle);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      for (const id of timeoutsRef.current) clearTimeout(id);
      timeoutsRef.current = [];
    };
  }, [phase, reduced, cardImageUrls]);

  // Returning animation.
  useEffect(() => {
    if (phase !== "returning") return;
    for (let i = 0; i < N; i += 1) {
      const node = flyingCardRefs.current[i];
      if (!node) continue;
      node.style.transition = "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease";
      node.style.transform = "translate(-50%, -50%) scale(0.1) rotateZ(0deg)";
      node.style.opacity = "0";
      node.classList.remove("revealed");
    }

    const id = setTimeout(() => {
      for (let i = 0; i < N; i += 1) {
        const node = flyingCardRefs.current[i];
        if (!node) continue;
        node.style.transition = "";
        node.style.transform = "";
        node.style.opacity = "";
        node.style.zIndex = "";
        node.classList.remove("revealed");
      }
      setIsFlying(false);
      setPhase("idle");
      setWiggleLevel(0);
    }, TIMINGS.returnDelay);

    timeoutsRef.current.push(id);
  }, [phase]);

  const flyingCardRefs = useRef([]);
  const flyingCardUrlsRef = useRef([]);

  return {
    wiggleLevel,
    isFlying,
    phase,
    flyingCardRefs,
    flyingCardUrls: flyingCardUrlsRef.current,
    placeholderCode: placeholderCard,
  };
}