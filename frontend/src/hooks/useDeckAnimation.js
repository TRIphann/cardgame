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

// ── Orbit geometry ──────────────────────────────────────────────────────
// The ellipse must be wide enough that cards never overlap the deck
// (deck ≈ 110×156px after the 58° tilt ≈ 165×80px bounding box).
// We give 160px horizontal and 120px vertical clearance.
const ORBIT_RX = 165;   // horizontal radius
const ORBIT_RY = 120;   // vertical radius
const ORBIT_MS = 9000;  // milliseconds per full revolution

// ── Per-card phase offsets ────────────────────────────────────────────────
const PHASE_OFFSET = (Math.PI * 2) / N;

// ── Timing constants ─────────────────────────────────────────────────────
const WIGGLE_DELAYS   = [5000, 4000, 2000]; // idle→w1, w1→w2, w2→w3
const FLIGHT_OUT_MS   = 1000;  // fan-out from deck to orbit start
const FLIGHT_BACK_MS  = 800;   // return spiral to deck centre
const REVEAL_HOLD_MS  = 1500; // milliseconds front face stays visible
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

  const tickReturning = (now) => {
    const t = clamp((now - startMs) / flightBackMs, 0, 1);
    const e = easeInOut(t);
    for (let i = 0; i < N; i += 1) {
      const node = flyingCardRefs.current[i];
      if (!node) continue;
      const squeeze = t > 0.88 ? (t - 0.88) / 0.12 : 0;
      const scale  = (1 - e) * 1.0 + e * 0.05 - squeeze * 0.06;
      const rotZ   = (1 - t) * 12 * (i % 2 === 0 ? 1 : -1);
      node.style.transform =
        `translate(-50%, -50%) scale(${Math.max(0.01, scale).toFixed(3)}) rotateZ(${rotZ.toFixed(1)}deg)`;
      node.style.opacity = String(Math.max(0, 1 - t * 1.1));
      node.style.zIndex   = String(120 + i);
    }
    if (t < 1) {
      rafId = requestAnimationFrame(tickReturning);
    } else {
      cancelAnimationFrame(rafId);
      for (let i = 0; i < N; i += 1) {
        const node = flyingCardRefs.current[i];
        if (!node) continue;
        node.style.transform = "";
        node.style.opacity = "";
        node.style.zIndex  = "";
        node.classList.remove("revealed");
      }
      onEnd();
    }
  };

  const tick = (now) => {
    if (phase === "returning") {
      tickReturning(now);
      return;
    }

    // flying phase
    const totalFlyingMs = flightOutMs + orbitMs;
    const elapsed = now - startMs;

    for (let i = 0; i < N; i += 1) {
      const node = flyingCardRefs.current[i];
      if (!node) continue;

      if (elapsed < flightOutMs) {
        // ─── FAN-OUT: cards spread from centre to orbit ─────────────────
        const t    = clamp(elapsed / flightOutMs, 0, 1);
        const ease = easeOutCubic(t);
        const targetAngle = i * PHASE_OFFSET;
        const startAngle = -Math.PI / 2;
        const angle      = startAngle + (targetAngle - startAngle) * ease;
        const r  = 20 + ease * ORBIT_RX;
        const ry = 15 + ease * ORBIT_RY;
        const x  = Math.sin(angle) * r;
        const y  = -Math.cos(angle) * ry;
        const scale = 0.35 + ease * 0.65;
        const initRot = (1 - ease) * -20;
        node.style.transform =
          `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) ` +
          `rotateZ(${(initRot + targetAngle * 57.3 * 0.06).toFixed(1)}deg) ` +
          `scale(${scale.toFixed(3)})`;
        node.style.opacity = String(0.1 + ease * 0.9);
        node.style.zIndex  = String(80 + i);
      } else {
        // ─── ORBIT: elliptical loop with bob ──────────────────────────
        const orbitEl = elapsed - flightOutMs;
        const baseAngle = (orbitEl / orbitMs) * Math.PI * 2;
        const angle     = baseAngle + i * PHASE_OFFSET;

        const ox = Math.sin(angle) * ORBIT_RX;
        const oy = -Math.cos(angle) * ORBIT_RY;

        // Perpendicular bob: ±12px toward/away from camera, 2× per orbit
        const bob      = Math.sin((orbitEl / orbitMs) * Math.PI * 2 * 2 + i * (Math.PI / 3)) * 12;
        const cosA     = Math.cos(angle);
        const depth    = cosA; // 1 = closest (right), -1 = farthest (left)
        const scale    = 0.92 + 0.18 * (depth + 1) / 2;
        const tiltY    = depth * 22; // lean toward viewer at front
        const tiltZ    = Math.sin(angle) * 7; // gentle rock

        node.style.transform =
          `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px)) ` +
          `rotateZ(${tiltZ.toFixed(1)}deg) ` +
          `rotateY(${tiltY.toFixed(1)}deg) ` +
          `scale(${scale.toFixed(3)})`;
        node.style.zIndex  = String(100 + Math.round(depth * 10));
        node.style.opacity = "1";

        // ─── REVEAL: first time card crosses the front ────────────────
        if (depth > REVEAL_THRESH && !revealedSetRef.current.has(i)) {
          revealedSetRef.current.add(i);
          node.classList.add("revealed");
          if (flipTimersRef.current[i]) clearTimeout(flipTimersRef.current[i]);
          flipTimersRef.current[i] = setTimeout(() => {
            const n = flyingCardRefs.current[i];
            if (n) n.classList.remove("revealed");
            flipTimersRef.current[i] = 0;
          }, REVEAL_HOLD_MS);
        }
      }
    }

    if (elapsed < totalFlyingMs) {
      rafId = requestAnimationFrame(tick);
    } else {
      // Switch to return phase
      startMs = performance.now();
      rafId = requestAnimationFrame(tickReturning);
    }
  };

  return {
    start(ms) { startMs = ms; rafId = requestAnimationFrame(tick); },
    cancel()  { cancelAnimationFrame(rafId); },
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
