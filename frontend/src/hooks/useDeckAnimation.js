// useDeckAnimation — drives the deck + 4 flying cards on the lobby page.
//
// Spec (from user):
//   • Show a *tilted stack* of cards (not a single card on its own).
//   • Idle cascade: 5s → wiggle 1 → +4s → wiggle 2 → +2s → wiggle 3 → fly.
//   • 4 cards fly OUT of the deck and orbit AROUND it. The deck stays
//     visible the whole time (no disappearing swap).
//   • When a card crosses the front (closest to the viewer) it flips to
//     reveal a random face. Each card reveals exactly once per cycle.
//   • After all 4 have been revealed, cards fly BACK to the deck and the
//     idle cascade restarts.
//   • Loop forever.
//
// "Closest to camera" is depth ≈ 1 in our orbit math (cos(angle) close to 1).

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

const N = 4;
const PHASE_OFFSET = (Math.PI * 2) / N;
const ORBIT_RADIUS_X = 110;   // horizontal radius (ellipse, wider than tall)
const ORBIT_RADIUS_Y = 78;    // vertical radius
const ORBIT_DURATION_MS = 9000;     // one full orbit
const REVEAL_HOLD_MS = 1600;        // how long the card stays flipped
const REVEAL_DEPTH_THRESHOLD = 0.85;
const FLIGHT_OUT_MS = 700;          // launching from the deck
const FLIGHT_BACK_MS = 700;         // returning to the deck
const FLIGHT_PHASE_MS = 1100;       // total lift-out before orbit starts

const TIMINGS = {
  wiggle1Delay: 5000,
  wiggle2Delay: 4000,
  wiggle3Delay: 2000,
};

export function useDeckAnimation({ cardImageUrls }) {
  const reduced = useReducedMotion();
  const [wiggleLevel, setWiggleLevel] = useState(0); // 0 idle, 1/2/3 = wiggle level
  const [isFlying, setIsFlying] = useState(false);
  const [phase, setPhase] = useState("idle"); // 'idle' | 'flying' | 'returning'

  const timeoutsRef = useRef([]);
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);

  // Refs populated by the FlyingCards component.
  const flyingCardRefs = useRef([]);
  const flyingCardUrlsRef = useRef([]);

  // Per-cycle bookkeeping: which cards have already been revealed, and the
  // face URL each one is showing while flipped.
  const revealedSetRef = useRef(new Set());
  const cardFacesRef = useRef([]);
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

  // Reduced-motion fallback: just toggle the "flying" flag for the CSS to take
  // over. The tilt stack itself still renders, no JS animation.
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

  // Idle cascade 0 -> 1 (5s) -> 2 (+4s) -> 3 (+2s) -> flying.
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
      // Pick *per-card* random faces so the four reveals can all be
      // different cards from the deck.
      const pool = Array.isArray(cardImageUrls) ? cardImageUrls : [];
      if (pool.length > 0) {
        // Fisher-Yates-ish shuffle a copy and take the first N unique faces.
        const copy = [...pool];
        for (let k = copy.length - 1; k > 0; k -= 1) {
          const r = Math.floor(Math.random() * (k + 1));
          [copy[k], copy[r]] = [copy[r], copy[k]];
        }
        cardFacesRef.current = copy.slice(0, N);
        // Make sure the refs/urls the FlyingCards component reads match.
        flyingCardUrlsRef.current = cardFacesRef.current;
      } else {
        cardFacesRef.current = Array(N).fill("");
        flyingCardUrlsRef.current = cardFacesRef.current;
      }

      revealedSetRef.current = new Set();
      setIsFlying(true);
      setPhase("flying");
    }

    return () => clearTimers();
  }, [phase, wiggleLevel, reduced, cardImageUrls]);

  // Orbit + reveal-on-front behaviour while phase === "flying".
  //
  // Animation phases per card:
  //   0  .. FLIGHT_PHASE_MS       launching up out of the deck
  //   FLIGHT_PHASE_MS .. END      orbiting around the deck (with flips)
  //   END (all done)              return-to-deck animation
  useEffect(() => {
    if (reduced) return undefined;
    if (phase !== "flying") return undefined;

    startTimeRef.current = performance.now();
    const orbitMs = ORBIT_DURATION_MS;
    const totalFlightMs = FLIGHT_PHASE_MS + orbitMs;

    const tick = (now) => {
      const elapsed = now - startTimeRef.current;

      for (let i = 0; i < N; i += 1) {
        const node = flyingCardRefs.current[i];
        if (!node) continue;

        let progress, liftT;
        if (elapsed < FLIGHT_PHASE_MS) {
          // Phase A: rising out of the deck. Cards pop up from the centre,
          // staggered so they fan out, then settle into orbit positions.
          progress = elapsed / FLIGHT_PHASE_MS;
          liftT = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          // Each card is offset slightly in angle so they fan upward.
          const fanAngle = -Math.PI / 2 + (i - (N - 1) / 2) * 0.35;
          const liftR = 30 + liftT * 20;
          const x = Math.cos(fanAngle) * liftR;
          const y = Math.sin(fanAngle) * liftR - liftT * 50;
          const tilt = (i - (N - 1) / 2) * 8 - liftT * 4;
          const scale = 0.6 + liftT * 0.4;
          node.style.transform =
            `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) ` +
            `rotateZ(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
          node.style.opacity = String(0.2 + liftT * 0.8);
          node.style.zIndex = String(80 + i);
        } else {
          // Phase B: orbit. baseAngle advances at orbitMs per revolution.
          const orbitElapsed = elapsed - FLIGHT_PHASE_MS;
          const baseAngle = (orbitElapsed / orbitMs) * Math.PI * 2;

          const angle = baseAngle + i * PHASE_OFFSET;
          const x = Math.sin(angle) * ORBIT_RADIUS_X;
          const y = -Math.cos(angle) * ORBIT_RADIUS_Y;
          const tilt = Math.sin(angle) * 10;
          const depth = Math.cos(angle);
          const scale = 0.92 + (0.18 * (depth + 1)) / 2;

          node.style.transform =
            `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) ` +
            `rotateZ(${tilt.toFixed(1)}deg) rotateY(${(depth * 22).toFixed(1)}deg) ` +
            `scale(${scale.toFixed(3)})`;
          // The card nearest the camera is in front of the stack.
          node.style.zIndex = String(100 + Math.round(depth * 10));
          node.style.opacity = "1";

          // Reveal-on-front: each card flips once per cycle when its depth
          // crosses the threshold and it hasn't been revealed yet.
          if (depth > REVEAL_DEPTH_THRESHOLD && !revealedSetRef.current.has(i)) {
            revealedSetRef.current.add(i);
            node.classList.add("revealed");
            if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
            flipTimerRef.current = setTimeout(() => {
              // Flip back to face-down *only if* this card is still showing
              // its reveal. Other cards (further along the orbit) keep theirs.
              const n = flyingCardRefs.current[i];
              if (n && n.classList.contains("revealed")) {
                n.classList.remove("revealed");
              }
            }, REVEAL_HOLD_MS);
          }
        }
      }

      if (elapsed < totalFlightMs) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    };
  }, [phase, reduced]);

  // After all 4 cards have been revealed (or after a hard time cap), end
  // the flying phase and start the return animation.
  useEffect(() => {
    if (reduced) return undefined;
    if (phase !== "flying") return undefined;

    const orbitMs = ORBIT_DURATION_MS;
    const totalMs = FLIGHT_PHASE_MS + orbitMs + REVEAL_HOLD_MS + 200;
    const id = setTimeout(() => setPhase("returning"), totalMs);
    timeoutsRef.current.push(id);
    return () => clearTimeout(id);
  }, [phase, reduced]);

  // Returning animation: each card glides back to the deck centre with an
  // ease-in-out cubic, then fades. The deck stays visible throughout.
  useEffect(() => {
    if (phase !== "returning") return undefined;

    const start = performance.now();
    const startPositions = [];
    for (let i = 0; i < N; i += 1) {
      const node = flyingCardRefs.current[i];
      const rect = node ? node.getBoundingClientRect() : null;
      startPositions.push(rect ? { left: rect.left, top: rect.top } : null);
      if (!node) continue;
      node.style.transition =
        "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease";
      node.classList.remove("revealed");
    }

    const stepMs = 16;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / FLIGHT_BACK_MS);
      for (let i = 0; i < N; i += 1) {
        const node = flyingCardRefs.current[i];
        if (!node) continue;
        const x = (1 - t) * 0; // shrink back to centre
        const y = (1 - t) * 0;
        // Slight over-shoot for a satisfying "click" into the deck.
        const settle = t > 0.85 ? (t - 0.85) / 0.15 : 0;
        const squeeze = 1 - settle * 0.06;
        node.style.transform = `translate(-50%, -50%) scale(${(0.05 + t * 0.55) * squeeze}) rotateZ(${((1 - t) * 12).toFixed(1)}deg)`;
        node.style.opacity = String(1 - t);
        node.style.zIndex = String(120 + i);
      }
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const end = setTimeout(() => {
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
    }, FLIGHT_BACK_MS + 60);

    timeoutsRef.current.push(end);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      clearTimeout(end);
    };
  }, [phase]);

  return {
    wiggleLevel,
    isFlying,
    phase,
    flyingCardRefs,
    flyingCardUrls: flyingCardUrlsRef.current,
  };
}