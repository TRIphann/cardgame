// useDeckAnimation — drives the deck + 4 flying cards on the lobby page.
//
// Spec (from user):
//   • Deck sits idle, then wiggle 1 → wiggle 2 → wiggle 3 in cascade:
//       5s after mount      → wiggle 1 (nhẹ)
//       +4s                 → wiggle 2 (mạnh hơn)
//       +2s                 → wiggle 3 (mạnh nhất)
//       then flying phase begins.
//   • Flying: 4 cards from the top of the deck fly out face-down and orbit
//     around the deck. When a card is closest to the camera (front of the
//     orbit) it flips to reveal a random card face — *once per cycle* per
//     card. After flipping, it flips back so all 4 cards stay face-down
//     while continuing to orbit.
//   • Once all 4 cards have been revealed, return them to the deck.
//   • Loop forever: 5s + 4s + 2s of idle cascade then flying again.
//
// "Closest to the camera" = depth ≈ 1 in our orbit math (cos(angle) close
// to 1). We trigger a reveal the first time each card crosses that band.

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

const N = 4;
const PHASE_OFFSET = (Math.PI * 2) / N;
const ORBIT_RADIUS = 95;
const ORBIT_DURATION_MS = 9000;        // one full orbit
const REVEAL_HOLD_MS = 1500;            // how long the card stays flipped
const REVEAL_DEPTH_THRESHOLD = 0.85;    // when depth > threshold, flip

const TIMINGS = {
  wiggle1Delay: 5000,
  wiggle2Delay: 4000,
  wiggle3Delay: 2000,
  returnDurationMs: 480,
};

export function useDeckAnimation({ cardImageUrls }) {
  const reduced = useReducedMotion();
  const [wiggleLevel, setWiggleLevel] = useState(0); // 0 idle, 1/2/3 = wiggle level
  const [isFlying, setIsFlying] = useState(false);
  const [phase, setPhase] = useState("idle"); // 'idle' | 'flying' | 'returning'

  const timeoutsRef = useRef([]);
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);

  // Refs that the FlyingCards component populates so we can mutate transforms
  // without re-rendering. The hook owns these — the component just forwards.
  const flyingCardRefs = useRef([]);
  const flyingCardUrlsRef = useRef([]);

  // Track per-card "has this card been revealed yet in this cycle?"
  const revealedSetRef = useRef(new Set());
  const flipTimerRef = useRef(null);

  const clearTimers = () => {
    for (const id of timeoutsRef.current) clearTimeout(id);
    timeoutsRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    flipTimerRef.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  // Reduced-motion fallback: still show the cycle, just with shorter phases
  // and no transform-based animation. We toggle the "flying" flag so the
  // CSS-based fallback in the component can take over.
  useEffect(() => {
    if (!reduced) return undefined;
    setPhase("idle");
    setWiggleLevel(0);
    const id = setInterval(() => {
      setPhase("flying");
      setTimeout(() => setPhase("idle"), 3000);
    }, 12000);
    timeoutsRef.current.push(id);
    return () => clearTimers();
  }, [reduced]);

  // Idle cascade: 0 → 1 (5s) → 2 (+4s) → 3 (+2s) → flying.
  useEffect(() => {
    if (reduced) return undefined;
    if (phase !== "idle") return undefined;

    if (wiggleLevel === 0) {
      const id = setTimeout(() => setWiggleLevel(1), TIMINGS.wiggle1Delay);
      timeoutsRef.current.push(id);
    } else if (wiggleLevel === 1) {
      const id = setTimeout(() => setWiggleLevel(2), TIMINGS.wiggle2Delay);
      timeoutsRef.current.push(id);
    } else if (wiggleLevel === 2) {
      const id = setTimeout(() => setWiggleLevel(3), TIMINGS.wiggle3Delay);
      timeoutsRef.current.push(id);
    } else if (wiggleLevel === 3) {
      // Pick a fresh batch of face URLs for this cycle and reset the
      // per-cycle "already revealed" set.
      const pool = Array.isArray(cardImageUrls) && cardImageUrls.length > 0
        ? cardImageUrls
        : [];
      flyingCardUrlsRef.current = Array.from({ length: N }, () =>
        pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : "",
      );
      revealedSetRef.current = new Set();
      setPhase("flying");
    }

    return () => clearTimers();
  }, [phase, wiggleLevel, reduced, cardImageUrls]);

  // rAF orbit + flip-on-front behaviour while phase === "flying".
  useEffect(() => {
    if (reduced) return undefined;
    if (phase !== "flying") return undefined;

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

        const transform =
          `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) ` +
          `rotateZ(${tilt.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
        const zIndex = String(100 + Math.round(depth * 10));

        const node = flyingCardRefs.current[i];
        if (!node) continue;
        node.style.transform = transform;
        node.style.zIndex = zIndex;

        // Reveal the card *once* per cycle when it's closest to the camera.
        if (depth > REVEAL_DEPTH_THRESHOLD && !revealedSetRef.current.has(i)) {
          revealedSetRef.current.add(i);
          node.classList.add("revealed");
          // Schedule the flip back to face-down after a short hold.
          if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
          flipTimerRef.current = setTimeout(() => {
            for (let j = 0; j < N; j += 1) {
              const n = flyingCardRefs.current[j];
              if (n) n.classList.remove("revealed");
            }
          }, REVEAL_HOLD_MS);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    };
  }, [phase, reduced]);

  // After enough time, end the flying phase and return to deck. The user
  // wants the cards to come back once they've all been revealed, but to
  // keep things visually predictable we also hard-cap the flying duration
  // in case some cards never crossed the reveal band (small orbit glitch).
  useEffect(() => {
    if (reduced) return undefined;
    if (phase !== "flying") return undefined;

    const cycleMs = ORBIT_DURATION_MS + REVEAL_HOLD_MS + 200;
    const id = setTimeout(() => setPhase("returning"), cycleMs);
    timeoutsRef.current.push(id);
    return () => clearTimeout(id);
  }, [phase, reduced]);

  // Returning animation: shrink + fade all flying cards back to the deck.
  useEffect(() => {
    if (phase !== "returning") return undefined;

    for (let i = 0; i < N; i += 1) {
      const node = flyingCardRefs.current[i];
      if (!node) continue;
      node.style.transition =
        "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease";
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
      setWiggleLevel(0); // restart the idle cascade from level 0
    }, TIMINGS.returnDurationMs);

    timeoutsRef.current.push(id);
    return () => clearTimeout(id);
  }, [phase]);

  return {
    wiggleLevel,
    isFlying,
    phase,
    flyingCardRefs,
    flyingCardUrls: flyingCardUrlsRef.current,
  };
}