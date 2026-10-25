// ExitTestButton — emergency escape button that deletes the test room
// and navigates back to the test lobby. Always visible regardless of
// game state, so users can escape frozen screens.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@config/env.js";

export function ExitTestButton({ roomId, style = {} }) {
  const [exiting, setExiting] = useState(false);
  const navigate = useNavigate();

  const handleExit = async () => {
    if (exiting) return;
    setExiting(true);

    try {
      // Delete the test room on backend
      if (roomId) {
        await fetch(`${API_BASE_URL}/api/test/room/${roomId}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    } finally {
      // Always navigate back to test lobby, even if API fails
      navigate("/test", { replace: true });
    }
  };

  return (
    <button
      onClick={handleExit}
      disabled={exiting}
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 2147483647, // Max safe z-index - always on top
        padding: "10px 20px",
        background: "rgba(220, 53, 69, 0.95)",
        color: "#fff",
        border: "2px solid #fff",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: exiting ? "not-allowed" : "pointer",
        opacity: exiting ? 0.7 : 1,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
      title="Thoát Test - Xóa phòng và quay lại"
    >
      {exiting ? "Đang thoát..." : "✕ Thoát Test"}
    </button>
  );
}
