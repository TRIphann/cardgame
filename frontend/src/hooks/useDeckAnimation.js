// useDeckAnimation — lobby deck animation engine.
//
// ┌──────────────────────────────────────────────────────────────┐
// │  PHASE TIMELINE (one full cycle ≈ 24–26 seconds)             │
// │                                                              │
// │  IDLE ────(5s)────► WIGGLE-1 ──(4s)──► WIGGLE-2         │
// │                    ──(2s)──► WIGGLE-3 ──(fly)──►           │
// │  FLYING:   fan-out → orbit (9s/rev) → reveal → return     │
// │                                          ──(0.8s)──►        │
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

// Cards fan out from below (angle π/2 = bottom of orbit = 6 o'clock).
// They arrive at their target orbit positions in REVERSE index order so
// card-0 (which starts last) reaches the reveal zone LAST, not FIRST.
// Each card i fans out from startAngle=(π/2 + i*PHASE_OFFSET) to
// targetAngle=(i*PHASE_OFFSET). This means card-0 starts at angle 1.57
// (cos≈0, no flip) and must do ~1 full orbit before cos>0.65 triggers.
// Card-1 starts at angle 2.51 (cos≈-0.81), also delayed.
// Cards fan out in reverse order (i=3 → 2 → 1 → 0) with a 200ms stagger
// so the last-to-launch (card-0) still reaches the orbit LAST.
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
const FLIGHT_BACK_MS  = 1400;   // return spiral to deck centre (longer for drama)
const REVEAL_HOLD_MS  = 1800; // milliseconds front face stays visible
const REVEAL_THRESH   = 0.65;  // cos(angle) value at which reveal fires

// ── Easing helpers ───────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOut(t)    { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── RAF loop ──────────────────────────────────────────────────────────
function makeTick({ phase, flyingCardRefs, revealedSetRef, flipTimersRef,
                    orbitMs, flightOutMs, flightBackMs, onEnd }) {
  let rafId  = 0;
  let startMs = 0;

  // ── Return phase: cards spiral back into the deck pile ─────────────
  const tickReturning = (now) => {
    const prog = clamp((now - startMs) / flightBackMs, 0, 1);
    const ek = easeInOut(prog);

    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;

      const sdir  = k % 2 === 0 ? 1 : -1;
      const sang  = ek * Math.PI * 2 * sdir;
      const srx   = ek * ORBIT_RX;
      const sry   = ek * ORBIT_RY;
      const ox    = Math.sin(sang) * srx * 0.15;
      const oy    = -Math.cos(sang) * sry * 0.15;

      const sc    = 1 - ek * 0.92;
      const rz    = ek * 10 * sdir;
      const oang  = k * PHASE_OFFSET;
      const odep  = Math.cos(oang);
      const ryv   = -odep * 22 * (1 - ek);
      const rxv   = ek * 5 * sdir;

      nd.style.transform =
        `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px)) ` +
        `rotateZ(${rz.toFixed(1)}deg) ` +
        `rotateY(${ryv.toFixed(1)}deg) ` +
        `rotateX(${rxv.toFixed(1)}deg) ` +
        `scale(${Math.max(0.01, sc).toFixed(3)})`;
      nd.style.opacity = String(Math.max(0, 1 - ek * 0.95));
      nd.style.zIndex = String(120 - Math.round(ek * 30));
    }
    if (prog < 1) {
      rafId = requestAnimationFrame(tickReturning);
    } else {
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
    }
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

    // Switch to return phase when orbit completes
    if (orbitEl >= orbitMs) {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickReturning);
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
      if (phase === "returning") {
        rafId = requestAnimationFrame(tickReturning);
      } else {
        rafId = requestAnimationFrame(tickFanOut);
      }
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

  // ── Returning spiral ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "returning") return undefined;

    const onEnd = () => {
      setIsFlying(false);
      setPhase("idle");
      setWiggleLevel(0);
    };

    rafRunnerRef.current = makeTick({
      phase: "returning",
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
  }, [phase]);

  return {
    wiggleLevel,
    isFlying,
    phase,
    flyingCardRefs,
    flyingCardUrls,
  };
}
