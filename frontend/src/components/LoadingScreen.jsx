// LoadingScreen — Suspense fallback. Shown while lazy chunks download.

import React from "react";

export function LoadingScreen() {
  return (
    <div role="status" aria-live="polite" className="arc-loading">
      <div className="arc-loading__spinner" aria-hidden="true" />
      <p>Đang tải…</p>
    </div>
  );
}