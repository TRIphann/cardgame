// useAnimeFx — wrapper nhẹ quanh anime.js v4 cho React. Cung cấp các tiện ích
// để drive animation trên DOM nodes (refs) thay vì re-render React, giúp hiệu
// ứng mượt và không gây render loop.
//
// Vì anime.js v4 export named { animate, ... } ta lazy-load qua dynamic import
// để tránh tăng bundle size ban đầu.

import { useEffect, useRef } from "react";

let _animePromise = null;

async function getAnime() {
  if (!_animePromise) {
    _animePromise = import("animejs").then((mod) => mod.animate ?? mod.default);
  }
  return _animePromise;
}

/**
 * Run an anime.js animation on a ref's children matching `selector`.
 * Animates once on mount; cleaned up automatically.
 */
export function useAnimateOn(ref, selector = "[data-anim]", params, opts = {}) {
  const { delay = 0, once = true, depsKey } = opts;
  const ranRef = useRef(false);

  useEffect(() => {
    if (!ref?.current) return undefined;
    if (once && ranRef.current) return undefined;
    ranRef.current = true;

    let cancelled = false;
    let animInstance = null;

    getAnime()
      .then((animate) => {
        if (cancelled || !ref.current) return;
        const targets = selector
          ? ref.current.querySelectorAll(selector)
          : [ref.current];
        if (!targets.length) return;
        animInstance = animate(targets, {
          ...params,
          delay: (el, i, total) => {
            const base = typeof params.delay === "function" ? params.delay(el, i, total) : (params.delay || 0);
            return base + delay;
          },
        });
      })
      .catch(() => {
        /* anime failed to load — silently no-op, keep CSS fallback */
      });

    return () => {
      cancelled = true;
      try {
        animInstance?.cancel?.();
      } catch (_) {
        /* cancel can throw if anim never started */
      }
    };
     
  }, [ref, selector, depsKey ?? JSON.stringify(params), delay, once]);
}

/**
 * Run an animation imperatively from an event handler. Returns the JSAnimation
 * instance (or null if no targets / anime.js failed to load).
 */
export async function animateOnce(targets, params) {
  const animate = await getAnime();
  if (!targets) return null;
  const els = targets instanceof Element || targets instanceof Node
    ? [targets]
    : Array.from(targets);
  if (!els.length) return null;
  return animate(els, params);
}

/**
 * Run a list of (delay, params) steps on the SAME element sequentially. Returns
 * a cleanup fn. Useful for multi-stage cinematics like: pop → arc → flip →
 * impact.
 *
 *   runSequence(el, [
 *     { params: { scale: [0, 1], duration: 200 }, at: 0 },
 *     { params: { translateX: 200, duration: 500 }, at: 200 },
 *   ])
 */
export async function runSequence(el, steps) {
  const animate = await getAnime();
  if (!el || !steps?.length) return null;
  let totalDuration = 0;
  let lastInst = null;
  for (const step of steps) {
    const start = step.at ?? 0;
    const dur = step.duration ?? 600;
    lastInst = animate(el, {
      ...step.params,
      delay: start,
      duration: dur,
    });
    totalDuration = Math.max(totalDuration, start + dur);
  }
  // Wait for the longest step to complete (with a small buffer).
  await new Promise((resolve) => setTimeout(resolve, totalDuration + 30));
  return lastInst;
}

/**
 * Animate a node imperatively, then resolve once the animation is done. Returns
 * a Promise that resolves with the JSAnimation instance.
 */
export function animatePromise(targets, params) {
  return getAnime().then((animate) => {
    if (!targets) return null;
    const els = targets instanceof Element || targets instanceof Node
      ? [targets]
      : Array.from(targets);
    if (!els.length) return null;
    return new Promise((resolve) => {
      const inst = animate(els, {
        ...params,
        onComplete: () => {
          if (typeof params.onComplete === "function") params.onComplete();
          resolve(inst);
        },
      });
    });
  });
}

/**
 * Stagger helper: returns a delay function suitable for anime.js `delay` param.
 *   staggerDelay(120, 60)(el, i) → i * 60 + 120
 */
export function staggerDelay(baseOffset = 0, stepMs = 80) {
  return (el, i) => baseOffset + i * stepMs;
}

/**
 * Pre-warm the anime.js module so the FIRST animation kicks off instantly
 * instead of waiting for the dynamic import. Call this on page mount.
 */
export function preloadAnime() {
  getAnime().catch(() => { /* ignore */ });
}

export { getAnime };