// FxScreenShake — rung nhẹ toàn màn hình. Mount với `active={true}` để kích
// hoạt; tự tắt khi timeout. Drive bằng anime.js với random shake values để
// hiệu ứng tự nhiên hơn (CSS keyframe đều theo pattern cố định).

import React, { useEffect, useRef } from "react";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

export function FxScreenShake({ active, intensity = "md", durationMs = 600 }) {
  const rootRef = useRef(null);

  useEffect(() => { preloadAnime(); }, []);

  useEffect(() => {
    if (!active || !rootRef.current) return undefined;
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    const amp = intensity === "lg" ? 14 : intensity === "sm" ? 5 : 9;
    let cancelled = false;
    let animInstance = null;

    getAnime().then((animate) => {
      if (cancelled || !rootRef.current) return;
      // Build keyframes with decreasing amplitude (damped oscillation).
      const N = 10;
      const keyframes = [];
      for (let i = 0; i < N; i += 1) {
        const decay = 1 - i / N;
        const x = (Math.random() * 2 - 1) * amp * decay;
        const y = (Math.random() * 2 - 1) * amp * decay;
        keyframes.push({ translateX: x, translateY: y });
      }
      keyframes.push({ translateX: 0, translateY: 0 });
      animInstance = animate(rootRef.current, {
        keyframes,
        duration: durationMs,
        ease: "linear",
      });
    }).catch(() => { /* */ });

    return () => {
      cancelled = true;
      try { animInstance?.cancel?.(); } catch (_) { /* */ }
    };
  }, [active, intensity, durationMs]);

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      className={`fx-shake fx-shake--${intensity} fx-shake--anime`}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 230,
      }}
      aria-hidden="true"
    />
  );
}