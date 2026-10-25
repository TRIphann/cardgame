// AmbientBackdrop — shared gradient backdrop fixed to the full viewport.
// Rendered via React Portal directly into <body> so it sits at the root
// stacking context, OUTSIDE of any flex containers that could clip it.
// This is the SOURCE OF TRUTH for the page's background gradient.
// Floating cards, stars, and ambient blobs are rendered separately by each
// page's own backdrop component (landing-backdrop / lobby-backdrop) to avoid
// duplicate stacking contexts that interfere with page layout.

import React from "react";
import { createPortal } from "react-dom";

export function AmbientBackdrop() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="arc-ambient" aria-hidden="true" />,
    document.body,
  );
}