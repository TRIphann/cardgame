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

  const tickReturning = (now) => {
    const t = clamp((now - startMs) / flightBackMs, 0, 1);
    // Dramatic ease-out with overshoot feel
    const eased = t < 0.7 ? easeOutCubic(t / 0.7) : 1;
    for (let i = 0; i < N; i += 1) {
      const node = flyingCardRefs.current[i];
      if (!node) continue;

      // Spiral angle - each card spirals with a unique phase
      const spiralAngle = (1 - eased) * (Math.PI * 2.5) * (i % 2 === 0 ? 1 : -1);
      // Outward then inward radius
      const midT = Math.sin(eased * Math.PI); // peaks at 0.5
      const spiralR = 40 * midT; // expand then contract
      // Spiral offset
      const spiralX = Math.cos(spiralAngle) * spiralR;
      const spiralY = Math.sin(spiralAngle) * spiralR * 0.5;

      const finalScale = (1 - eased) * 1.0 + eased * 0.05;
      const rotZ = (1 - t) * 25 * (i % 2 === 0 ? 1 : -1) + eased * 180 * (i % 2 === 0 ? 1 : -1);

      node.style.transform =
        `translate(calc(-50% + ${spiralX.toFixed(1)}px), calc(-50% + ${spiralY.toFixed(1)}px)) ` +
        `rotateZ(${rotZ.toFixed(1)}deg) ` +
        `scale(${Math.max(0.01, finalScale).toFixed(3)})`;
      node.style.opacity = String(Math.max(0, 1 - t * 1.05));
      node.style.zIndex = String(120 + Math.round((1 - t) * 20));
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
        node.style.zIndex = "";
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
    const totalFlyingMs = flightOutMs + (N - 1) * FANOUT_STAGGER_MS + orbitMs;
    const elapsed = now - startMs;

    for (let i = 0; i < N; i += 1) {
      const node = flyingCardRefs.current[i];
      if (!node) continue;

      if (elapsed < flightOutMs + FANOUT_STAGGER_MS * (N - 1)) {
        // ─── FAN-OUT: cards launch from bottom of stage to orbit positions ─
        // Cards launch in reverse index order (3→2→1→0) with stagger.
        // When a card hasn't launched yet it stays hidden at deck centre.
        const cardSlot = FANOUT_ORDER.indexOf(i);
        const cardStartMs = cardSlot * FANOUT_STAGGER_MS;
        const cardElapsed = elapsed - cardStartMs;

        if (cardElapsed < 0) {
          // Hasn't launched yet — hide at centre
          node.style.opacity = "0";
          node.style.zIndex  = String(80 + i);
          continue;
        }

        const t    = clamp(cardElapsed / FLIGHT_OUT_MS, 0, 1);
        const ease = easeOutCubic(t);
        const targetAngle = i * PHASE_OFFSET;
        // Start from bottom (6 o'clock) so card-0 (rightmost) starts far right,
        // cos<0 → no premature reveal. After a full orbit it reaches front.
        const startAngle  = Math.PI / 2;
        const angle        = startAngle + (targetAngle - startAngle) * ease;
        const r  = 20 + ease * ORBIT_RX;
        const ry = 15 + ease * ORBIT_RY;
        const x  = Math.sin(angle) * r;
        const y  = -Math.cos(angle) * ry;
        const scale = 0.3 + ease * 0.7;
        // Launch from "below" — slight tilt that unwinds during flight
        const initRot = (1 - ease) * -90;
        node.style.transform =
          `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) ` +
          `rotateZ(${(initRot + ease * 5 * (i % 2 === 0 ? 1 : -1)).toFixed(1)}deg) ` +
          `scale(${scale.toFixed(3)})`;
        node.style.opacity = String(Math.min(1, 0.15 + ease * 0.85));
        node.style.zIndex  = String(80 + i);
      } else {
        // ─── ORBIT: elliptical loop with bob ──────────────────────────
        const fanOutDuration = flightOutMs + (N - 1) * FANOUT_STAGGER_MS;
        const orbitEl = elapsed - fanOutDuration;
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

        // ─── REVEAL: first time card crosses the front AFTER fan-out finishes
        if (elapsed > fanOutDuration && depth > REVEAL_THRESH && !revealedSetRef.current.has(i)) {
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
