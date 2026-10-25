// PageEntryFx — small wrapper component that runs anime.js entry animations
// on mount. Used for page-level fade-in, slide-up, stagger cho buttons, v.v.
// Lighter than wiring anime.js in every page; keeps the imperative animation
// code in one place.
//
// Usage:
//   <PageEntryFx ref={panelRef} selector=".welcome-panel">
//     <h1>...</h1>
//   </PageEntryFx>
//
// Or call `playEntryFx(ref, selector, params)` from a useEffect directly.

import { useEffect } from "react";
import { getAnime } from "./useAnimeFx.js";

/**
 * Play one-shot anime.js animations on a ref's children.
 * Auto-cleanup on unmount. CSS keyframes are kept as fallback.
 */
export function playEntryFx(ref, selector, params, delayMs = 0) {
  if (!ref?.current) return () => {};
  let cancelled = false;
  let instances = [];

  (async () => {
    try {
      await getAnime();
      if (cancelled || !ref.current) return;
      const animate = await getAnime();
      const targets = selector
        ? ref.current.querySelectorAll(selector)
        : [ref.current];
      if (!targets.length) return;
      const inst = animate(targets, {
        ...params,
        delay: (el, i, total) => {
          const base = typeof params.delay === "function"
            ? params.delay(el, i, total)
            : (params.delay || 0);
          return base + delayMs;
        },
      });
      instances.push(inst);
    } catch (_) {
      /* anime.js failed → CSS fallback */
    }
  })();

  return () => {
    cancelled = true;
    instances.forEach((i) => {
      try { i?.cancel?.(); } catch (_) { /* ignore */ }
    });
  };
}

/**
 * Hook variant — fires on mount.
 */
export function useEntryFx(ref, selector, params, delayMs = 0) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    return playEntryFx(ref, selector, params, delayMs);
     
  }, []);
}