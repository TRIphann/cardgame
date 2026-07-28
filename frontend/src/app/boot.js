// Boot diagnostics — DEV ONLY surface module errors. In production we let
// the ErrorBoundary handle everything so we don't pollute the UI.
export function bootDiagnostics() {
  if (typeof window === "undefined") return;
  // Only run in development so production users don't see raw error overlays.
  if (process.env.NODE_ENV !== "development") return;

  const surface = (kind, payload) => {
    try {
      const existing = document.getElementById("__arcana-boot-error");
      if (existing) return;
      const box = document.createElement("div");
      box.id = "__arcana-boot-error";
      box.style.cssText = [
        "position:fixed", "inset:0", "z-index:2147483647",
        "background:rgba(8,8,24,0.92)", "color:#ffb4b4",
        "padding:24px", "font-family:ui-monospace,monospace",
        "font-size:14px", "white-space:pre-wrap", "overflow:auto",
      ].join(";");
      box.textContent = `[${kind}] ${payload}`;
      document.body.appendChild(box);
    } catch (_) { /* no-op */ }
  };

  window.addEventListener("error", (e) => {
    const msg = (e.error && e.error.stack) || e.message || "unknown";
    surface("error", msg);
    console.error("[arcana] boot error:", e.error || e.message);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason && (e.reason.stack || e.reason.message) || String(e.reason);
    surface("unhandledrejection", reason);
    console.error("[arcana] unhandled rejection:", e.reason);
  });
}