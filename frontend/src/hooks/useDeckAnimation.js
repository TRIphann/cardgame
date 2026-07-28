// useDeckAnimation — lobby deck animation engine.
//
// ┌──────────────────────────────────────────────────────────────┐
// │  PHASE TIMELINE                                              │
// │                                                              │
// │  IDLE ────(5s)────► WIGGLE-1 ──(4s)──► WIGGLE-2            │
// │                    ──(2s)──► WIGGLE-3 ──(fly)──►           │
// │  FLYING:   fan-out → orbit (12s) → fan-in                   │
// │                                                              │
// │  Cards START FLAT (like deck pile perspective)              │
// │  When flying out: rotate to upright (0deg X rotation)       │
// │  When returning: rotate back to flat before disappearing    │
// └──────────────────────────────────────────────────────────────┘

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

const N = 4;

const FANOUT_ORDER = [3, 2, 1, 0];
const FANOUT_STAGGER_MS = 180;
const FANIN_STAGGER_MS  = 180;

// ── Orbit geometry ──────────────────────────────────────────────────────
// Orbit center is shifted DOWN (positive y) because deck pile is near bottom
// Cards should orbit BELOW the deck pile center
const ORBIT_RX = 200;
const ORBIT_RY = 160;  // taller vertical to prevent clipping
const ORBIT_Y_OFFSET = 80; // shift orbit center DOWN from deck center
const ORBIT_MS = 12000;

const PHASE_OFFSET = (Math.PI * 2) / N;

// ── Timing constants ─────────────────────────────────────────────────────
const WIGGLE_DELAYS   = [5000, 4000, 2000];
const FLIGHT_OUT_MS   = 1000;
const FLIGHT_BACK_MS  = 1000;
const REVEAL_HOLD_MS  = 2000;
const REVEAL_THRESH   = 0.55;

// ── Easing helpers ───────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t)  { return t * t * t; }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Deck pile perspective (from CSS) ────────────────────────────────────
// transform: perspective(900px) rotateX(58deg) rotateZ(-9deg);
// Cards should match this when "lying flat"
const FLAT_RX = 58;
const FLAT_RZ = -9;

// ── RAF loop factory ─────────────────────────────────────────────────────
function makeTick({ flyingCardRefs, revealedSetRef, flipTimersRef,
                    orbitMs, flightOutMs, flightBackMs, onEnd }) {
  let rafId  = 0;
  let startMs = 0;

  // ── Fan-in: cards return to deck, rotating upright → flat ─────────────
  // Cards land in FORWARD order (0,1,2,3)
  const FANIN_ORDER = [0, 1, 2, 3];

  const tickFanIn = (now) => {
    const el = now - startMs;
    const totalDuration = flightBackMs + (N - 1) * FANIN_STAGGER_MS + 300;

    if (el >= totalDuration) {
      cancelAnimationFrame(rafId);
      for (let k = 0; k < N; k += 1) {
        const nd = flyingCardRefs.current[k];
        if (!nd) continue;
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

      // Card hasn't started returning yet - keep at orbit
      if (cardEl < 0) {
        nd.style.opacity = "1";
        nd.style.zIndex  = String(100 + k);
        continue;
      }

      const prog = clamp(cardEl / flightBackMs, 0, 1);
      const ek   = easeInOutCubic(prog);

      const ta = k * PHASE_OFFSET;

      // Position: orbit → deck center
      const rx = ORBIT_RX * (1 - ek);
      const ry = ORBIT_RY * (1 - ek);
      const fx = Math.sin(ta) * rx;
      const fy = -Math.cos(ta) * ry + ORBIT_Y_OFFSET * (1 - ek);

      // Scale: keep full size
      const fsc = 1.0;

      // Rotation: from upright (0deg) to flat (58deg around X)
      // Cards should rotate AS THEY APPROACH the deck, so they land flat
      const rxAngle = FLAT_RX * ek;
      const rzAngle = FLAT_RZ + ta * 8 * ek;

      nd.style.transform =
        `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) ` +
        `rotateX(${rxAngle.toFixed(1)}deg) ` +
        `rotateZ(${rzAngle.toFixed(1)}deg) ` +
        `scale(${fsc.toFixed(3)})`;

      // Opacity: stay fully visible until card is ALMOST flat (at deck)
      // Only fade out in the last 15% when card is nearly flat
      let opacity = 1;
      if (prog > 0.85) {
        opacity = 1 - (prog - 0.85) / 0.15;
      }
      nd.style.opacity = String(Math.max(0, opacity));
      nd.style.zIndex  = String(Math.round(100 - (1 - prog) * 10));
    }
    rafId = requestAnimationFrame(tickFanIn);
  };

  // ── Fan-out: cards leave deck, rotating flat → upright ───────────────
  const tickFanOut = (now) => {
    const fanDur = flightOutMs + (N - 1) * FANOUT_STAGGER_MS;
    const el = now - startMs;

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const slot  = FANOUT_ORDER.indexOf(k);
      const delay = slot * FANOUT_STAGGER_MS;
      const cardEl = el - delay;

      // Card hasn't started flying yet - start FLAT like deck pile
      if (cardEl < 0) {
        nd.style.transform =
          `translate(calc(-50% + 0px), calc(-50% + ${ORBIT_Y_OFFSET.toFixed(1)}px)) ` +
          `rotateX(${FLAT_RX}deg) ` +
          `rotateZ(${FLAT_RZ}deg) ` +
          `scale(0.3)`;
        nd.style.opacity = "0";
        nd.style.zIndex  = String(80 + k);
        continue;
      }

      const prog = clamp(cardEl / flightOutMs, 0, 1);
      const ek   = easeOutCubic(prog);

      const ta = k * PHASE_OFFSET;
      const sa = Math.PI / 2;

      // Position: deck center → orbit
      const rx = 20 + ek * (ORBIT_RX - 20);
      const ry = 15 + ek * (ORBIT_RY - 15);
      const fx = Math.sin(sa + (ta - sa) * ek) * rx;
      const fy = -Math.cos(sa + (ta - sa) * ek) * ry + ORBIT_Y_OFFSET * ek;

      // Scale: grow from small to full
      const fsc = 0.3 + ek * 0.7;

      // Rotation: from flat (58deg) to upright (0deg) around X
      const rxAngle = FLAT_RX * (1 - ek);
      const rzAngle = FLAT_RZ * (1 - ek) + ta * 8 * (1 - ek);

      nd.style.transform =
        `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) ` +
        `rotateX(${rxAngle.toFixed(1)}deg) ` +
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

    if (el >= orbitMs) {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickFanIn);
      return;
    }

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const ba = (el / orbitMs) * Math.PI * 2;
      const a  = ba + k * PHASE_OFFSET;

      const ox = Math.sin(a) * ORBIT_RX;
      const oy = -Math.cos(a) * ORBIT_RY + ORBIT_Y_OFFSET;

      const dp  = Math.cos(a);
      const osc = 0.92 + 0.18 * (dp + 1) / 2;

      // Slight tilt based on position
      const tX = dp * 4;
      const tZ = Math.sin(a) * 5;

      nd.style.transform =
        `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px)) ` +
        `rotateX(${tX.toFixed(1)}deg) ` +
        `rotateZ(${tZ.toFixed(1)}deg) ` +
        `scale(${osc.toFixed(3)})`;

      nd.style.zIndex   = String(100 + Math.round(dp * 10));
      nd.style.opacity  = "1";

      // Reveal front face when card is at "front" of orbit
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
