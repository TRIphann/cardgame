// CardActionModal — cinematic xác nhận đánh bài. Hiển thị card art lớn, tên
// + mô tả, hiệu ứng nền theo loại (glow ring tinted theo card key), floating
// glyphs đặc trưng (attack → ⚔, future → ◉, v.v.).
//
// Animation:
//   • Scrim fade-in + scale-up tuần tự
//   • Modal slide-up + scale spring (outBack)
//   • Card art flip Y nhẹ khi vào
//   • Glyph spin + pulse loop
//   • Background art-glow pulse loop

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";
import { fxFor } from "./cardFx.js";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

export function CardActionModal({
  card, onClose, onConfirm, requiresTarget, opponents, onPickTarget,
}) {
  const fx = useMemo(() => fxFor(card?.key || "general"), [card?.key]);
  const [pickedId, setPickedId] = useState(null);
  const handlePick = useCallback((id) => {
    if (pickedId !== null) return;
    setPickedId(id);
    onPickTarget(id);
  }, [pickedId, onPickTarget]);

  const modalRef = useRef(null);
  const scrimRef = useRef(null);
  const artRef   = useRef(null);
  const glowRef  = useRef(null);
  const glyphRef = useRef(null);
  const titleId  = "cam-title";

  useEffect(() => { preloadAnime(); }, []);

  // ESC + focus trap
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "Esc") onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      }
    };
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, []);

  // Anime.js entry + loops
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!card) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let cancelled = false;
    let instances = [];

    (async () => {
      try {
        const animate = await getAnime();
        if (cancelled) return;

        // Scrim fade-in
        if (scrimRef.current) {
          instances.push(animate(scrimRef.current, {
            opacity: [0, 1],
            duration: 240,
            ease: "outQuad",
          }));
        }

        // Modal pop-in
        if (modalRef.current) {
          instances.push(animate(modalRef.current, {
            opacity:   [0, 1],
            scale:     [0.85, 1.04, 1],
            translateY: [40, 0],
            duration:  460,
            ease:      "outBack",
          }));
        }

        // Card art: subtle rotateY + lift
        if (artRef.current) {
          instances.push(animate(artRef.current, {
            rotateY:  [-180, 0],
            opacity:  [0, 1],
            duration: 620,
            delay:    80,
            ease:     "outExpo",
          }));
        }

        // Glow: pulse loop
        if (glowRef.current) {
          instances.push(animate(glowRef.current, {
            scale:   [0.6, 1.2],
            opacity: [0, 0.8],
            duration: 500,
            delay:    200,
            ease:     "outExpo",
          }));
          instances.push(animate(glowRef.current, {
            scale:    [1, 1.18, 1],
            opacity:  [0.8, 0.4, 0.8],
            duration: 1600,
            delay:    700,
            loop:     true,
            alternate: true,
            ease:     "inOutSine",
          }));
        }

        // Glyph: spin + pulse loop
        if (glyphRef.current) {
          instances.push(animate(glyphRef.current, {
            scale:    [0.4, 1.2, 1],
            rotate:   [-90, 0],
            opacity:  [0, 1],
            duration: 560,
            delay:    240,
            ease:     "outBack",
          }));
          instances.push(animate(glyphRef.current, {
            scale:    [1, 1.15, 1],
            rotate:   [0, 8, -8, 0],
            duration: 2400,
            delay:    800,
            loop:     true,
            ease:     "inOutSine",
          }));
        }
      } catch (_) { /* */ }
    })();

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, [card?.key]);

  if (!card) return null;
  const url = cardImageUrl(card.key);

  return (
    <div
      ref={scrimRef}
      className="game-modal__scrim card-action-scrim card-action-scrim--anime"
      onClick={onClose}
    >
      <div
        className="card-action-modal__backdrop"
        style={{
          "--fx-color": fx.color,
          "--fx-accent": fx.accent,
        }}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        className={`game-modal card-action-modal card-action-modal--${card.key} card-action-modal--anime`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{ "--fx-color": fx.color, "--fx-accent": fx.accent }}
      >
        <button className="game-modal__close" type="button" onClick={onClose} aria-label="�óng">×</button>
        <div className="card-action-modal__layout">
          <div className="card-action-modal__art">
            <div ref={artRef} style={{ transformStyle: "preserve-3d" }}>
              <img src={url} alt={card.label || card.key} draggable={false} />
            </div>
            <span ref={glowRef} className="card-action-modal__art-glow" aria-hidden="true" />
            <span ref={glyphRef} className="card-action-modal__art-glyph" aria-hidden="true">{fx.glyph}</span>
          </div>
          <div className="card-action-modal__body">
            <h3 className="game-modal__title" id={titleId}>Dùng lá: {card.label || card.key}</h3>
            <p className="game-modal__sub">{card.description || "Xác nhận để sử dụng."}</p>

            {requiresTarget && (
              <>
                <p style={{ fontSize: 12, opacity: 0.7 }}>Chọn đối thủ:</p>
                <div className="combo-grid">
                  {(opponents || [])
                    .filter((o) => o.alive)
                    .map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="combo-card"
                        disabled={pickedId !== null}
                        aria-disabled={pickedId !== null}
                        aria-label={`Chọn ${o.name}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cinzel, serif" }}
                        onClick={() => handlePick(o.id)}
                      >
                        {o.name}
                      </button>
                    ))}
                </div>
              </>
            )}

            {!requiresTarget && (
              <div className="game-modal__actions">
                <button type="button" className="game-action-btn" onClick={onClose}>Huỷ</button>
                <button type="button" className="game-action-btn game-action-btn--primary" onClick={onConfirm}>
                  Xác nhận
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}