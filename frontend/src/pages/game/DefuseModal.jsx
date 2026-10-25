// DefuseModal — premium cinematic "Cứu bom!" Modal.
//   • Bomb glow pulse + screen tint
//   • 5 numbered position buttons (1..5) + 1 dedicated "Ngẫu nhiên" button
//   • Hover/select glow cường đại cao
//   • Sparkle bursts liên tục quanh modal
//
// Slot index semantics (sent to server UseDefuseAsync):
//   1..5  → insert bomb at that position (1 = top, 5 = deeper in deck)
//   -1    → server picks a random valid position
//
// Animation drive bằng anime.js:
import React, { useEffect, useRef, useState } from "react";
import { FxBurst } from "./FxBurst.jsx";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

const SLOTS = [
  { idx: 1, label: "Trên cùng", sub: "Rút tiếp", tint: "#ff8a7a" },
  { idx: 2, label: "Vị trí 2", sub: "+1", tint: "#ff8a4a" },
  { idx: 3, label: "Vị trí 3", sub: "+2", tint: "#ffaa5a" },
  { idx: 4, label: "Vị trí 4", sub: "+3", tint: "#ffce7a" },
  { idx: 5, label: "Dưới cùng", sub: "Sâu nhất", tint: "#ffeaa3" },
];
const RANDOM_SLOT = { idx: -1, label: "Ngẫu nhiên", sub: "Hệ thống chọn", tint: "#9a78ff" };

export function DefuseModal({ onConfirm, onSkip }) {
  const [tickKey, setTickKey] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const modalRef = useRef(null);
  const scrimRef = useRef(null);
  const dangerRef = useRef(null);
  const bombRef = useRef(null);
  const bombHaloRef = useRef(null);
  const pulseRefs = useRef([]);
  const slotRefs = useRef([]);
  const titleId = "dm-title";

  const [vp, setVp] = useState(() =>
    typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : { w: 1280, h: 720 }
  );

  useEffect(() => {
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => { preloadAnime(); }, []);

  useEffect(() => {
    const id = setInterval(() => setTickKey((k) => k + 1), 1400);
    return () => clearInterval(id);
  }, []);

  // ESC
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onSkip?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSkip]);

  // focus trap
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button:not([disabled])');
    focusable[0]?.focus();
  }, []);

  // Anime.js entry + loops
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    let instances = [];

    (async () => {
      try {
        const animate = await getAnime();
        if (cancelled) return;

        // Scrim shake-in
        if (scrimRef.current) {
          instances.push(animate(scrimRef.current, {
            opacity:  [0, 1],
            duration: 240,
            ease:     "outQuad",
          }));
        }

        // Danger pulse loop
        if (dangerRef.current) {
          instances.push(animate(dangerRef.current, {
            opacity: [0.7, 1, 0.7],
            duration: 1400,
            loop: true,
            alternate: true,
            ease: "inOutSine",
          }));
        }

        // Modal pop-in with shake
        if (modalRef.current) {
          instances.push(animate(modalRef.current, {
            opacity:    [0, 1],
            scale:      [0.7, 1.05, 1],
            translateY: [30, 0],
            duration:   480,
            ease:       "outBack",
          }));
          // Persistent gentle shake
          instances.push(animate(modalRef.current, {
            translateX: [0, -1.5, 1.5, -1, 1, 0],
            translateY: [0, -1, 1, 0],
            duration:   1200,
            delay:      480,
            loop:       true,
            ease:       "inOutSine",
          }));
        }

        // Bomb icon: pulse
        if (bombRef.current) {
          instances.push(animate(bombRef.current, {
            scale:   [0.4, 1.15, 1],
            opacity: [0, 1],
            duration: 600,
            delay:    200,
            ease:     "outBack",
          }));
          instances.push(animate(bombRef.current, {
            scale: [1, 1.1, 1],
            rotate: [0, -3, 3, 0],
            duration: 1600,
            delay: 800,
            loop: true,
            alternate: true,
            ease: "inOutSine",
          }));
        }

        // Halo rotate + scale
        if (bombHaloRef.current) {
          instances.push(animate(bombHaloRef.current, {
            scale:   [0.4, 1.2],
            opacity: [0, 0.7],
            duration: 700,
            delay:    280,
            ease:     "outExpo",
          }));
          instances.push(animate(bombHaloRef.current, {
            scale:   [1, 1.2, 1],
            opacity: [0.7, 0.4, 0.7],
            rotate:  [0, 360],
            duration: 3500,
            delay:    900,
            loop:     true,
            alternate: true,
            ease:     "linear",
          }));
        }

        // Pulse rings: stagger outward
        const pulses = pulseRefs.current.filter(Boolean);
        pulses.forEach((p, i) => {
          instances.push(animate(p, {
            scale:   [0.6, 2.4],
            opacity: [0.9, 0],
            duration: 1600,
            delay:    500 + i * 280,
            loop:     true,
            ease:     "outCubic",
          }));
        });

        // Slot stagger entry
        const slots = slotRefs.current.filter(Boolean);
        slots.forEach((s, i) => {
          instances.push(animate(s, {
            opacity:   [0, 1],
            translateY: [16, 0],
            scale:     [0.6, 1.05, 1],
            duration:  520,
            delay:     350 + i * 80,
            ease:      "outBack",
          }));
        });
      } catch (_) { /* */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, []);

  // Slot hover effect
  const onSlotHover = (idx, isEnter) => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const slot = slotRefs.current[idx];
    if (!slot) return;
    getAnime().then((animate) => {
      if (!slot) return;
      if (isEnter) {
        animate(slot, {
          translateY: -6,
          scale:    1.06,
          duration: 240,
          ease:     "outBack",
        });
      } else {
        animate(slot, {
          translateY: 0,
          scale: 1,
          duration: 320,
          ease: "outElastic(1, .6)",
        });
      }
    }).catch(() => { /* */ });
  };

  return (
    <div
      ref={scrimRef}
      className="game-modal__scrim defuse-scrim defuse-scrim--anime"
      role="presentation"
    >
      <div ref={dangerRef} className="defuse-scrim__danger" aria-hidden="true" />

      {/* Sparkle bursts at modal corners */}
      {[0, 1].map((corner) => (
        <FxBurst
          key={`${corner}-${tickKey}`}
          anchor={
            corner === 0
              ? { x: vp.w / 2 - 240, y: vp.h / 2 - 140 }
              : { x: vp.w / 2 + 240, y: vp.h / 2 + 140 }
          }
          fxKey="bomb"
          size="md"
          id={`defuse-tick-${corner}`}
        />
      ))}

      <div
        ref={modalRef}
        className="game-modal defuse-modal defuse-modal--anime"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="defuse-modal__bomb" aria-hidden="true">
          <div ref={bombHaloRef} className="defuse-modal__bomb-halo" />
          <img ref={bombRef} src={cardImageUrl("bomb")} alt="" draggable={false} />
          <span
            ref={(el) => { pulseRefs.current[0] = el; }}
            className="defuse-modal__bomb-pulse"
          />
          <span
            ref={(el) => { pulseRefs.current[1] = el; }}
            className="defuse-modal__bomb-pulse defuse-modal__bomb-pulse--late"
          />
          <span
            ref={(el) => { pulseRefs.current[2] = el; }}
            className="defuse-modal__bomb-pulse defuse-modal__bomb-pulse--late2"
          />
        </div>

        <h3 className="game-modal__title defuse-modal__title" id={titleId}>
          <span className="defuse-modal__title-glyph" aria-hidden="true">💣</span>
          Cứu bom!
        </h3>
        <p className="game-modal__sub">
          Bạn sẽ mất 1 lá cứu và hết lượt. Chọn vị trí đặt bom trở lại vào chồng bài
          (1 = trên cùng, 5 = dưới cùng) hoặc để hệ thống chọn ngẫu nhiên.
        </p>

        <div className="defuse-slots" role="group" aria-label="Vị trí đặt bom">
          {SLOTS.map((s) => {
            const isSelected = selectedSlot === s.idx;
            return (
              <button
                key={s.idx}
                ref={(el) => { slotRefs.current[s.idx] = el; }}
                type="button"
                className={`defuse-slot${isSelected ? " defuse-slot--selected" : ""}`}
                onMouseEnter={() => { setSelectedSlot(s.idx); onSlotHover(s.idx, true); }}
                onMouseLeave={() => { setSelectedSlot(null); onSlotHover(s.idx, false); }}
                onClick={() => onConfirm(s.idx)}
                aria-label={`Vị trí ${s.idx}: ${s.label || s.sub}`}
              >
                <span className="defuse-slot__num">{s.idx}</span>
                <span className="defuse-slot__hint">{s.label || s.sub}</span>
                <span className="defuse-slot__beam" aria-hidden="true" />
                <span className="defuse-slot__ring" aria-hidden="true" />
              </button>
            );
          })}
          <button
            key={RANDOM_SLOT.idx}
            ref={(el) => { slotRefs.current[RANDOM_SLOT.idx] = el; }}
            type="button"
            className={`defuse-slot defuse-slot--random${selectedSlot === RANDOM_SLOT.idx ? " defuse-slot--selected" : ""}`}
            onMouseEnter={() => { setSelectedSlot(RANDOM_SLOT.idx); onSlotHover(RANDOM_SLOT.idx, true); }}
            onMouseLeave={() => { setSelectedSlot(null); onSlotHover(RANDOM_SLOT.idx, false); }}
            onClick={() => onConfirm(RANDOM_SLOT.idx)}
            aria-label="Đặt bom ở vị trí ngẫu nhiên"
          >
            <span className="defuse-slot__num" aria-hidden="true">🎲</span>
            <span className="defuse-slot__hint">{RANDOM_SLOT.label}</span>
            <span className="defuse-slot__sub">{RANDOM_SLOT.sub}</span>
            <span className="defuse-slot__beam" aria-hidden="true" />
            <span className="defuse-slot__ring" aria-hidden="true" />
          </button>
        </div>

        <div className="game-modal__actions">
          <button
            type="button"
            className="game-action-btn"
            onClick={() => onConfirm(-1)}
            aria-label="Đặt bom ở vị trí ngẫu nhiên (ESC)"
            title="ESC = Ngẫu nhiên"
          >
            🎲 Ngẫu nhiên (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}