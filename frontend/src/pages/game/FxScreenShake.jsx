// FxScreenShake — rung nhẹ toàn màn hình. Mount trong component cha với
// `active={true}` để kích hoạt; tự tắt khi timeout.

import React from "react";

export function FxScreenShake({ active, intensity = "md", durationMs = 600 }) {
  if (!active) return null;
  const amp = intensity === "lg" ? 14 : intensity === "sm" ? 5 : 9;
  return (
    <div
      className={`fx-shake fx-shake--${intensity}`}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 230,
        "--shake-amp": `${amp}px`,
        "--shake-dur": `${durationMs}ms`,
      }}
      aria-hidden="true"
    />
  );
}