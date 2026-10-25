// HandArc — render the local player's hand of cards in a fanned arc.
//
// Animation driven by anime.js:
//   • Cards stagger in on mount (scale + translateY + slight rotate).
//   • Hover: lift + scale up với easing `outBack` cho "spring" feel.
//   • Fresh draw: pulse + glow + scale punch mỗi lần lastDrawnKey đổi.
//   • Selected: pulse glow chậm.
//
// CSS keyframes vẫn làm fallback cho reduced-motion / anime.js load fail.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { CARD_LABELS } from "./cardLabels.js";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

const BACK_URL = cardImageUrl("back");

// ── Arc geometry helpers ────────────────────────────────────────────
function arcStep(total) {
  if (total <= 5) return 95;
  if (total <= 8) return 72;
  if (total <= 12) return 55;
  if (total <= 16) return 42;
  return 32;
}

function slotTransform(index, total) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const totalRot = Math.max(10, 32 - (total - 5) * 1.4);
  const rot = (t - 0.5) * totalRot;
  const lift = Math.sin(t * Math.PI) * Math.min(28, 38 / Math.sqrt(total));
  const step = arcStep(total);
  const tx = (t - 0.5) * step * (total - 1);
  return {
    tx: `translateX(${tx.toFixed(1)}px)`,
    tr: `rotate(${-rot.toFixed(1)}deg)`,
    ty: `translateY(${-lift.toFixed(1)}px)`,
  };
}

export function HandArc({ hand, selectedIndex, onSelectCard, lastDrawnKey }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const rootRef = useRef(null);
  const total = hand?.length || 0;
  const initialMountRef = useRef(true);

  // Pre-warm anime.js so first hover/fresh animation has no latency.
  useEffect(() => { preloadAnime(); }, []);

  // Mount entry: stagger fan-in ONLY on the first mount (not on hand mutations).
  // Replaying this every time `total` changes makes the hand visibly re-snap
  // upward from 80px with stagger — looking like a "page flicker" after a
  // draw or play. Once we have hand on screen, subsequent updates should be
  // smooth (the layout itself handles reflow).
  useEffect(() => {
    if (!initialMountRef.current) return undefined;
    if (!rootRef.current || total === 0) return undefined;
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { initialMountRef.current = false; return undefined; }

    initialMountRef.current = false;
    let cancelled = false;
    let instances = [];
    (async () => {
      try {
        await getAnime();
        if (cancelled || !rootRef.current) return;
        const cards = rootRef.current.querySelectorAll(".hand-card");
        if (!cards.length) return;
        const animate = await getAnime();
        // Fan-in: mỗi card translateY từ +80px lên 0, scale 0.6 → 1, opacity 0 → 1
        const inst = animate(cards, {
          translateY: [
            { to: 80, duration: 0 },
            { to: 0, duration: 600, ease: "outBack" },
          ],
          scale: [
            { to: 0.6, duration: 0 },
            { to: 1, duration: 600, ease: "outBack" },
          ],
          opacity: [
            { to: 0, duration: 0 },
            { to: 1, duration: 300, ease: "outQuad" },
          ],
          delay: (el, i) => i * 55,
        });
        instances.push(inst);
      } catch (_) { /* silent */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, []); // intentional: only on mount

  // Pulse cho lá bài v�a được rút (lastDrawnKey). Mỗi lần prop đổi → pulse.
  const prevLastDrawnRef = useRef(null);
  useEffect(() => {
    if (!rootRef.current || !lastDrawnKey || lastDrawnKey === prevLastDrawnRef.current) {
      prevLastDrawnRef.current = lastDrawnKey;
      return undefined;
    }
    prevLastDrawnRef.current = lastDrawnKey;

    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    let instances = [];
    (async () => {
      try {
        await getAnime();
        if (cancelled || !rootRef.current) return;
        const cards = Array.from(rootRef.current.querySelectorAll(".hand-card"));
        const matchIdx = (() => {
          for (let i = cards.length - 1; i >= 0; i -= 1) {
            if (cards[i].dataset.cardKey === lastDrawnKey) return i;
          }
          return -1;
        })();
        if (matchIdx < 0) return;
        const target = cards[matchIdx];
        const animate = await getAnime();
        // Glow pulse + scale punch
        const inst = animate(target, {
          scale: [
            { to: 1.25, duration: 220, ease: "outBack" },
            { to: 1, duration: 280, ease: "outElastic(1, .8)" },
          ],
          filter: [
            { to: "brightness(1.4) drop-shadow(0 0 18px rgba(255,215,130,0.95))", duration: 220 },
            { to: "brightness(1) drop-shadow(0 0 0 transparent)", duration: 600 },
          ],
          translateY: [
            { to: -16, duration: 220, ease: "outQuad" },
            { to: 0, duration: 280, ease: "outBounce" },
          ],
        });
        instances.push(inst);
      } catch (_) { /* */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, [lastDrawnKey]);

  if (total === 0) {
    return (
      <div className="hand-arc hand-arc--empty">
        <div style={{ opacity: 0.4, fontSize: 14 }}>Không có lá nào</div>
      </div>
    );
  }
  const step = arcStep(total);

  const onHover = (idx, isEnter) => {
    setHoveredIdx(isEnter ? idx : null);
    // Subtle inline animation: lift + scale khi hover.
    if (!rootRef.current) return;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const card = rootRef.current.querySelectorAll(".hand-card")[idx];
    if (!card) return;
    getAnime().then((animate) => {
      if (!card) return;
      if (isEnter) {
        animate(card, {
          translateY: -22,
          scale: 1.06,
          duration: 260,
          ease: "outBack",
        });
      } else {
        // Snap back to baseline (only translateY; rotation stays in style attr)
        animate(card, {
          translateY: 0,
          scale: 1,
          duration: 320,
          ease: "outElastic(1, .6)",
        });
      }
    }).catch(() => { /* silent */ });
  };

  return (
    <div
      ref={rootRef}
      className="hand-arc hand-arc--anime"
      style={{ "--hand-step": `${step}px` }}
    >
      {hand.map((key, idx) => {
        const { tx, tr, ty } = slotTransform(idx, total);
        const selected = selectedIndex === idx;
        const hovered = hoveredIdx === idx;
        const isFresh = !!lastDrawnKey && key === lastDrawnKey &&
          !hand.slice(idx + 1).includes(lastDrawnKey);
        const offset = (idx - (total - 1) / 2) * step;
        const styleVars = {
          left: `calc(50% + ${offset.toFixed(1)}px)`,
          "--arc-tx": tx,
          "--arc-tr": tr,
          "--arc-ty": ty,
          // Inline transform baseline: rotate + lift only. anime.js hooks
          // will override translateY / scale imperatively.
          transform: hovered
            ? `${tr} ${ty} translateY(-22px) scale(1.06)`
            : `${tr} ${ty}`,
          zIndex: 10 + idx + (hovered ? 1000 : 0),
        };
        const url = cardImageUrl(key);
        const meta = CARD_LABELS[key] || { label: key, description: "" };
        const tooltipId = `hand-card-tip-${idx}`;
        return (
          <button
            key={`${idx}-${key}`}
            type="button"
            className={[
              "hand-card",
              selected ? "hand-card--selected" : "",
              hovered ? "hand-card--hovered" : "",
              isFresh ? "hand-card--fresh" : "",
            ].filter(Boolean).join(" ")}
            style={styleVars}
            onClick={() => onSelectCard?.(idx, key)}
            onMouseEnter={() => onHover(idx, true)}
            onMouseLeave={() => onHover(idx, false)}
            onFocus={() => onHover(idx, true)}
            onBlur={() => onHover(idx, false)}
            aria-label={meta.label}
            aria-describedby={tooltipId}
            data-card-key={key}
          >
            <img
              src={url || BACK_URL}
              alt={meta.label}
              draggable={false}
              loading="lazy"
              onError={(e) => {
                if (e.currentTarget.src !== BACK_URL) e.currentTarget.src = BACK_URL;
              }}
            />
            <span
              id={tooltipId}
              role="tooltip"
              className={`hand-card__tooltip${hovered ? " hand-card__tooltip--visible" : ""}`}
            >
              <span className="hand-card__tooltip-title">{meta.label}</span>
              <span className="hand-card__tooltip-desc">{meta.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}