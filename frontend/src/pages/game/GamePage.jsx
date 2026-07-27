// GamePage — placeholder until the real game logic is ported. For now we
// just show the room id so the routing works end-to-end and the
// lobby → game navigation can be tested.

import React from "react";
import { useParams, Link } from "react-router-dom";
import { ROUTES } from "@config/env.js";

export default function GamePage() {
  const { roomId } = useParams();
  return (
    <main className="game-page">
      <Link to={ROUTES.landing} className="back-link">
        <span>←</span> Quay lại
      </Link>
      <h1>Sân chơi</h1>
      <p>Phòng: <code>{roomId}</code></p>
      <p>Trò chơi đang được phát triển. Quay lại lobby để chờ thêm người.</p>
      <Link to={ROUTES.lobby}>
        <button type="button">Về phòng chờ</button>
      </Link>
    </main>
  );
}