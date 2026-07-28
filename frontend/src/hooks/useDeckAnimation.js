// useDeckAnimation — lobby deck animation engine.
//
// ┌──────────────────────────────────────────────────────────────┐
// │  PHASE TIMELINE                                              │
// │                                                              │
// │  IDLE ────(5s)────► WIGGLE-1 ──(4s)──► WIGGLE-2            │
// │                    ──(2s)──► WIGGLE-3 ──(fly)──►           │
// │  FLYING:   fan-out → orbit (12s/rev) → fan-in              │
// │             cards rotate from flat (90deg) to upright (0deg)│
// │             on way out, and back to flat on way in          │
// └──────────────────────────────────────────────────────────────┘
//
// Cards start FLAT (rotated 90deg, like the deck pile perspective).
// When flying OUT: rotate to upright (0deg) as they leave.
// When flying IN: rotate back to flat (90deg) as they return.

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

const N = 4;

// Cards fan out in REVERSE index order with stagger.
// Card 0 (last to leave) will be at the BOTTOM of orbit.
const FANOUT_ORDER = [3, 2, 1, 0];
const FANOUT_STAGGER_MS = 180;
const FANIN_STAGGER_MS  = 180;

// ── Orbit geometry ──────────────────────────────────────────────────────
// Orbit is adjusted to stay fully within viewport (no clipping)
const ORBIT_RX = 200;  // horizontal radius
const ORBIT_RY = 70;   // vertical radius (tightened to prevent bottom clip)
const ORBIT_MS = 12000; // slower orbit for better visibility

// ── Per-card phase offsets ────────────────────────────────────────────────
const PHASE_OFFSET = (Math.PI * 2) / N;

// ── Timing constants ─────────────────────────────────────────────────────
const WIGGLE_DELAYS   = [5000, 4000, 2000];
const FLIGHT_OUT_MS   = 1000;  // fan-out duration
const FLIGHT_BACK_MS  = 1000;  // fan-in duration
const REVEAL_HOLD_MS  = 2000;  // front face visible time
const REVEAL_THRESH   = 0.60;  // when to flip to front face

// ── Easing helpers ───────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t)  { return t * t * t; }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── RAF loop factory ─────────────────────────────────────────────────────
function makeTick({ flyingCardRefs, revealedSetRef, flipTimersRef,
                    orbitMs, flightOutMs, flightBackMs, onEnd }) {
  let rafId  = 0;
  let startMs = 0;

  // ── Fan-in: cards return to deck, rotating from upright to flat ──────
  // Cards land in FORWARD order (0,1,2,3) so they stack naturally
  const FANIN_ORDER = [0, 1, 2, 3];

  const tickFanIn = (now) => {
    const el = now - startMs;
    const totalDuration = flightBackMs + (N - 1) * FANIN_STAGGER_MS + 200;

    if (el >= totalDuration) {
      cancelAnimationFrame(rafId);
      for (let k = 0; k < N; k += 1) {
        const nd = flyingCardRefs.current[k];
        if (!nd) continue;
        // Reset to flat position (hidden under deck)
        nd.style.transform = "";
        nd.style.opacity = "0";
        nd.style.zIndex = "80";
        nd.classList.remove("revealed");
      }
      onEnd();
      return;
    }

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const slot  = FANIN_ORDER.indexOf(k);
      const delay = slot * FANIN_STAGGER_MS;
      const cardEl = el - delay;

      // Card hasn't started returning yet
      if (cardEl < 0) {
        // Keep at orbit position
        nd.style.opacity = "1";
        nd.style.zIndex  = String(100 + k);
        continue;
      }

      const prog = clamp(cardEl / flightBackMs, 0, 1);
      const ek   = easeInOutCubic(prog);

      // Start from orbit position, return to deck center
      const ta   = k * PHASE_OFFSET;
      const sa   = Math.PI / 2;

      // Position: orbit → deck center
      const rx   = ORBIT_RX * (1 - ek);
      const ry   = ORBIT_RY * (1 - ek);
      const fx   = Math.sin(ta) * rx;
      const fy   = -Math.cos(ta) * ry;

      // Scale: shrink slightly as it approaches deck
      const fsc  = 1.0 - ek * 0.5;

      // Rotation: from upright (0deg) back to flat (90deg around X)
      // This mimics the deck pile's perspective angle
      const rxAngle = ek * 58; // rotate around X axis to lie flat
      const ryAngle = ta * 15; // slight Y rotation based on position
      const rzAngle = -9 + ta * 10; // slight Z rotation

      nd.style.transform =
        `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) ` +
        `rotateX(${rxAngle.toFixed(1)}deg) ` +
        `rotateY(${ryAngle.toFixed(1)}deg) ` +
        `rotateZ(${rzAngle.toFixed(1)}deg) ` +
        `scale(${fsc.toFixed(3)})`;

      // Fade out as approaching deck
      let opacity = 1;
      if (prog > 0.6) {
        opacity = 1 - (prog - 0.6) / 0.4;
      }
      nd.style.opacity = String(Math.max(0, opacity));
      nd.style.zIndex  = String(Math.round(100 - prog * 15));
    }
    rafId = requestAnimationFrame(tickFanIn);
  };

  // ── Fan-out: cards leave deck, rotating from flat to upright ─────────
  const tickFanOut = (now) => {
    const fanDur = flightOutMs + (N - 1) * FANOUT_STAGGER_MS;
    const el = now - startMs;

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const slot  = FANOUT_ORDER.indexOf(k);
      const delay = slot * FANOUT_STAGGER_MS;
      const cardEl = el - delay;

      // Card hasn't started flying yet
      if (cardEl < 0) {
        // Start flat (like deck pile perspective)
        const ta   = k * PHASE_OFFSET;
        const ryAngle = ta * 15;
        const rzAngle = -9 + ta * 10;
        nd.style.transform =
          `translate(calc(-50% + 0px), calc(-50% + 0px)) ` +
          `rotateX(58deg) ` +
          `rotateY(${ryAngle.toFixed(1)}deg) ` +
          `rotateZ(${rzAngle.toFixed(1)}deg) ` +
          `scale(0.3)`;
        nd.style.opacity = "0";
        nd.style.zIndex  = String(80 + k);
        continue;
      }

      const prog = clamp(cardEl / flightOutMs, 0, 1);
      const ek   = easeOutCubic(prog);

      const ta   = k * PHASE_OFFSET;
      const sa   = Math.PI / 2;

      // Position: deck center → orbit
      const rx   = 20 + ek * (ORBIT_RX - 20);
      const ry   = 15 + ek * (ORBIT_RY - 15);
      const fx   = Math.sin(sa + (ta - sa) * ek) * rx;
      const fy   = -Math.cos(sa + (ta - sa) * ek) * ry;

      // Scale: grow from small to full
      const fsc  = 0.3 + ek * 0.7;

      // Rotation: from flat (58deg) to upright (0deg) around X
      const rxAngle = 58 * (1 - ek);
      const ryAngle = ta * 15 * (1 - ek);
      const rzAngle = (-9 + ta * 10) * (1 - ek);

      nd.style.transform =
        `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) ` +
        `rotateX(${rxAngle.toFixed(1)}deg) ` +
        `rotateY(${ryAngle.toFixed(1)}deg) ` +
        `rotateZ(${rzAngle.toFixed(1)}deg) ` +
        `scale(${fsc.toFixed(3)})`;

      nd.style.opacity = String(Math.min(1, 0.1 + ek * 0.9));
      nd.style.zIndex  = String(80 + k);
    }

    if (el < fanDur) {
      rafId = requestAnimationFrame(tickFanOut);
    } else {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickOrbit);
    }
  };

  // ── Orbit: cards circle in upright position ─────────────────────────
  const tickOrbit = (now) => {
    const el = now - startMs;

    // After orbit completes, switch to fan-in
    if (el >= orbitMs) {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickFanIn);
      return;
    }

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const ba  = (el / orbitMs) * Math.PI * 2;
      const a   = ba + k * PHASE_OFFSET;

      const ox  = Math.sin(a) * ORBIT_RX;
      const oy  = -Math.cos(a) * ORBIT_RY;

      const dp   = Math.cos(a);
      const osc  = 0.92 + 0.18 * (dp + 1) / 2;

      // Slight tilt based on position (cards "lean" into the turn)
      const tX   = dp * 5;
      const tY   = Math.sin(a) * 8;
      const tZ   = Math.sin(a) * 6;

      nd.style.transform =
        `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px)) ` +
        `rotateX(${tX.toFixed(1)}deg) ` +
        `rotateY(${tY.toFixed(1)}deg) ` +
        `rotateZ(${tZ.toFixed(1)}deg) ` +
        `scale(${osc.toFixed(3)})`;

      nd.style.zIndex   = String(100 + Math.round(dp * 10));
      nd.style.opacity  = "1";

      // Reveal front face when card is at "front" of orbit (dp > threshold)
      if (dp > REVEAL_THRESH && !revealedSetRef.current.has(k)) {
        revealedSetRef.current.add(k);
        nd.classList.add("revealed");
        if (flipTimersRef.current[k]) clearTimeout(flipTimersRef.current[k]);
        flipTimersRef.current[k] = setTimeout(() => {
          const n = flyingCardRefs.current[k];
          if (n) n.classList.remove("revealed");
          flipTimersRef.current[k] = 0;
        }, REVEAL_HOLD_MS);
      }
    }
    rafId = requestAnimationFrame(tickOrbit);
  };

  return {
    start(ms) {
      startMs = ms;
      rafId = requestAnimationFrame(tickFanOut);
    },
    cancel() { cancelAnimationFrame(rafId); },
  };
}

// ── Main hook ────────────────────────────────────────────────────────────
export function useDeckAnimation({ cardImageUrls }) {
  const reduced = useReducedMotion();

  const [wiggleLevel, setWiggleLevel] = useState(0);
  const [isFlying,   setIsFlying]      = useState(false);
  const [phase,     setPhase]          = useState("idle");
  const [flyingCardUrls, setFlyingCardUrls] = useState([]);

  const timeoutsRef      = useRef([]);
  const flyingCardRefs   = useRef([]);
  const revealedSetRef   = useRef(new Set());
  const flipTimersRef    = useRef(Array(N).fill(0));
  const rafRunnerRef     = useRef(null);

  const clearAll = () => {
    for (const id of timeoutsRef.current) clearTimeout(id);
    timeoutsRef.current = [];
    rafRunnerRef.current?.cancel();
    rafRunnerRef.current = null;
    for (const t of flipTimersRef.current) if (t) clearTimeout(t);
    flipTimersRef.current = Array(N).fill(0);
  };

  useEffect(() => () => clearAll(), []);

  // ── Reduced motion fallback ─────────────────────────────────────────────
  useEffect(() => {
    if (!reduced) return undefined;
    setPhase("idle"); setWiggleLevel(0);
    const id = setInterval(() => {
      setPhase("flying");
      setTimeout(() => setPhase("idle"), 3000);
    }, 12000);
    timeoutsRef.current.push(id);
    return () => clearAll();
  }, [reduced]);

  // ── Idle → wiggle cascade → flying ─────────────────────────────────────
  useEffect(() => {
    if (reduced) return undefined;
    if (phase !== "idle") return undefined;

    if (wiggleLevel < 3) {
      const delay = WIGGLE_DELAYS[wiggleLevel];
      const id = setTimeout(() => setWiggleLevel(w => w + 1), delay);
      timeoutsRef.current.push(id);
      return () => clearAll();
    }

    if (wiggleLevel === 3) {
      // Pick 4 random cards
      const pool = Array.isArray(cardImageUrls) ? cardImageUrls : [];
      if (pool.length >= N) {
        const copy = [...pool];
        for (let k = copy.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [copy[k], copy[r]] = [copy[r], copy[k]];
        }
        setFlyingCardUrls(copy.slice(0, N));
      } else {
        setFlyingCardUrls(Array(N).fill(""));
      }

      revealedSetRef.current = new Set();
      flipTimersRef.current  = Array(N).fill(0);
      setIsFlying(true);
      setPhase("flying");
    }

    return () => clearAll();
  }, [phase, wiggleLevel, reduced, cardImageUrls]);

  // ── RAF animation runner ────────────────────────────────────────────────
  useEffect(() => {
    if (reduced) return undefined;
    if (phase !== "flying") {
      rafRunnerRef.current?.cancel();
      rafRunnerRef.current = null;
      return undefined;
    }

    const onEnd = () => {
      setIsFlying(false);
      setPhase("idle");
      setWiggleLevel(0);
    };

    rafRunnerRef.current = makeTick({
      flyingCardRefs,
      revealedSetRef,
      flipTimersRef,
      orbitMs: ORBIT_MS,
      flightOutMs: FLIGHT_OUT_MS,
      flightBackMs: FLIGHT_BACK_MS,
      onEnd,
    });
    rafRunnerRef.current.start(performance.now());

    return () => {
      rafRunnerRef.current?.cancel();
      rafRunnerRef.current = null;
    };
  }, [phase, reduced, flyingCardUrls]);

  return {
    wiggleLevel,
    isFlying,
    phase,
    flyingCardRefs,
    flyingCardUrls,
  };
}
