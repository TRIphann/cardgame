// useDeckAnimation — lobby deck animation engine.
//
// ┌──────────────────────────────────────────────────────────────┐
// │  PHASE TIMELINE (one full cycle ≈ 22–24 seconds)             │
// │                                                              │
// │  IDLE ────(5s)────► WIGGLE-1 ──(4s)──► WIGGLE-2            │
// │                    ──(2s)──► WIGGLE-3 ──(fly)──►           │
// │  FLYING:   fan-out → orbit (9s/rev) → reveal → fan-in       │
// │                                          ──(1.4s)──►         │
// │  IDLE (restart)                                             │
// └──────────────────────────────────────────────────────────────┘
//
// Cards are driven 100% by RAF + inline style for pixel-perfect control.
// The CSS only handles:
//   - Wiggle keyframes (perspective-aware)
//   - 3D flip (class="revealed" toggled by JS, CSS does the rotation)
//   - Box-shadow glow polish

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

const N = 4;

// Cards fan out in REVERSE index order with a stagger so the last-to-launch
// (card-0) reaches the orbit LAST. Each card i fans out from startAngle at
// the bottom of the orbit to its targetAngle position.
const FANOUT_ORDER = [3, 2, 1, 0];
const FANOUT_STAGGER_MS = 220;

// ── Orbit geometry ──────────────────────────────────────────────────────
// The ellipse is wide enough to clear left/right seat columns (~120px).
// Vertical is tight so cards stay in the visible stage area.
const ORBIT_RX = 220;
const ORBIT_RY = 85;
const ORBIT_MS = 9000;

// ── Per-card phase offsets ────────────────────────────────────────────────
const PHASE_OFFSET = (Math.PI * 2) / N;

// ── Timing constants ─────────────────────────────────────────────────────
const WIGGLE_DELAYS   = [5000, 4000, 2000]; // idle→w1, w1→w2, w2→w3
const FLIGHT_OUT_MS   = 1200;  // fan-out from deck to orbit start
const FLIGHT_BACK_MS  = 1600;  // fan-in from orbit back to deck (longer for drama)
const REVEAL_HOLD_MS  = 1800;  // milliseconds front face stays visible
const REVEAL_THRESH   = 0.65;   // cos(angle) value at which reveal fires

// ── Easing helpers ───────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t)  { return t * t * t; }
function easeInOut(t)    { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function easeOutBack(t)  {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── RAF loop factory ─────────────────────────────────────────────────────
function makeTick({ phase, flyingCardRefs, revealedSetRef, flipTimersRef,
                    orbitMs, flightOutMs, flightBackMs, onEnd }) {
  let rafId  = 0;
  let startMs = 0;

  // ── Fan-in phase: cards reverse from orbit back to deck ─────────────
  // This is the exact REVERSE of the fan-out phase.
  const tickFanIn = (now) => {
    const totalMs = flightBackMs;
    const el = now - startMs;

    if (el >= totalMs) {
      cancelAnimationFrame(rafId);
      for (let k = 0; k < N; k += 1) {
        const nd = flyingCardRefs.current[k];
        if (!nd) continue;
        nd.style.transform = "";
        nd.style.opacity = "";
        nd.style.zIndex = "";
        nd.classList.remove("revealed");
      }
      onEnd();
      return;
    }

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const prog = clamp(el / totalMs, 0, 1);
      // Reverse of fan-out: start at orbit, go to bottom
      const p1   = 1 - easeOutCubic(1 - easeOutCubic(prog)); // decelerate as it approaches deck
      const ek1  = easeInCubic(prog); // ease in as it goes toward deck

      // Target angle at orbit = k * PHASE_OFFSET
      // Start angle at bottom = π/2
      const ta   = k * PHASE_OFFSET;
      const sa   = Math.PI / 2;
      // Move from orbit angle back to start angle (reverse of fan-out)
      const fa   = ta + (sa - ta) * ek1;
      const fr   = ORBIT_RX - ek1 * (ORBIT_RX - 20);
      const fry  = ORBIT_RY - ek1 * (ORBIT_RY - 15);
      const fx   = Math.sin(fa) * fr;
      const fy   = -Math.cos(fa) * fry;

      // Scale: start at orbit scale (~1.1), shrink to deck scale (0.3)
      const osc  = 0.92 + 0.18 * (Math.cos(ta) + 1) / 2; // orbit scale for this card
      const fsc  = osc - ek1 * (osc - 0.3);

      // Rotation: reverse of fan-out rotation
      const ir   = -90 + ek1 * 90; // rotate back from -90deg toward 0deg

      nd.style.transform =
        `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) ` +
        `rotateZ(${ir.toFixed(1)}deg) ` +
        `scale(${fsc.toFixed(3)})`;

      // Fade out as it approaches deck, disappear before reaching deck
      const fadeStart = 0.4;
      const fadeEnd   = 0.85;
      let opacity = 1;
      if (prog > fadeStart) {
        opacity = 1 - clamp((prog - fadeStart) / (fadeEnd - fadeStart), 0, 1);
      }
      nd.style.opacity = String(Math.max(0, opacity));
      // Keep above deck pile until fully faded
      nd.style.zIndex  = String(Math.round(120 - prog * 110));
    }
    rafId = requestAnimationFrame(tickFanIn);
  };

  // ── Fan-out phase: cards launch from deck to orbit positions ───────
  const tickFanOut = (now) => {
    const totalMs = flightOutMs + (N - 1) * FANOUT_STAGGER_MS + orbitMs;
    const el = now - startMs;

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const slot  = FANOUT_ORDER.indexOf(k);
      const stMs  = slot * FANOUT_STAGGER_MS;
      const cEl   = el - stMs;

      if (cEl < 0) {
        nd.style.opacity = "0";
        nd.style.zIndex  = String(80 + k);
        nd.style.transform = "";
        continue;
      }

      const p1   = clamp(cEl / FLIGHT_OUT_MS, 0, 1);
      const ek1  = easeOutCubic(p1);
      const ta   = k * PHASE_OFFSET;
      const sa   = Math.PI / 2;
      const fa   = sa + (ta - sa) * ek1;
      const fr   = 20 + ek1 * ORBIT_RX;
      const fry  = 15 + ek1 * ORBIT_RY;
      const fx   = Math.sin(fa) * fr;
      const fy   = -Math.cos(fa) * fry;
      const fsc  = 0.3 + ek1 * 0.7;
      const ir   = (1 - ek1) * -90;
      nd.style.transform =
        `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) ` +
        `rotateZ(${(ir + ek1 * 5 * (k % 2 === 0 ? 1 : -1)).toFixed(1)}deg) ` +
        `scale(${fsc.toFixed(3)})`;
      nd.style.opacity = String(Math.min(1, 0.15 + ek1 * 0.85));
      nd.style.zIndex  = String(80 + k);
    }
    if (el < totalMs) {
      rafId = requestAnimationFrame(tickFanOut);
    } else {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickOrbit);
    }
  };

  // ── Orbit phase: cards circle the deck in an ellipse ───────────────
  const tickOrbit = (now) => {
    const el = now - startMs;
    const fanDur = flightOutMs + (N - 1) * FANOUT_STAGGER_MS;
    const orbitEl = el - fanDur;

    // Switch to fan-in phase when orbit completes
    if (orbitEl >= orbitMs) {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickFanIn);
      return;
    }

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const ba  = (orbitEl / orbitMs) * Math.PI * 2;
      const a   = ba + k * PHASE_OFFSET;

      const ox  = Math.sin(a) * ORBIT_RX;
      const oy  = -Math.cos(a) * ORBIT_RY;

      const ca   = Math.cos(a);
      const dp   = ca;
      const osc  = 0.92 + 0.18 * (dp + 1) / 2;
      const tY   = dp * 22;
      const tZ   = Math.sin(a) * 7;

      nd.style.transform =
        `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px)) ` +
        `rotateZ(${tZ.toFixed(1)}deg) ` +
        `rotateY(${tY.toFixed(1)}deg) ` +
        `scale(${osc.toFixed(3)})`;
      nd.style.zIndex  = String(100 + Math.round(dp * 10));
      nd.style.opacity = "1";

      // Reveal: card shows front face when approaching the "front" of the ellipse
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

  // ── Cleanup ────────────────────────────────────────────────────────────
  const clearAll = () => {
    for (const id of timeoutsRef.current) clearTimeout(id);
    timeoutsRef.current = [];
    rafRunnerRef.current?.cancel();
    rafRunnerRef.current = null;
    for (const t of flipTimersRef.current) if (t) clearTimeout(t);
    flipTimersRef.current = Array(N).fill(0);
  };

  useEffect(() => () => clearAll(), []);

  // ── Reduced motion: just toggle isFlying on a slow timer ─────────────────
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

  // ── Idle cascade: 0 → 1 → 2 → 3 → flying ───────────────────────────────
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
      // Pick 4 distinct random faces
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

  // ── Flying orbit (RAF) ──────────────────────────────────────────────────
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
      phase,
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
