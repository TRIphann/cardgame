// SummaryScreen — end-of-round results table.
// Shows winner on top, then players sorted by turn-of-death.
// Columns: Thời gian (mm:ss), Số lượt, Lá đã dùng.

import React from "react";

function formatElapsed(startedAt, endedAt, diedAt) {
  const startMs = startedAt ? new Date(startedAt).getTime() : null;
  if (!startMs) return "—";
  const endMs = endedAt ? new Date(endedAt).getTime() : (diedAt ? new Date(diedAt).getTime() : Date.now());
  const sec = Math.max(0, Math.round((endMs - startMs) / 1000));
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function SummaryScreen({ room, gameState, myId, onContinue }) {
  const members = room.members || [];
  const playersSorted = [...members].sort((a, b) => {
    const aDead = !gameState.alive?.[a.id];
    const bDead = !gameState.alive?.[b.id];
    if (aDead !== bDead) return aDead ? 1 : -1; // alive first
    const aDied = gameState.diedAt?.[a.id] || 0;
    const bDied = gameState.diedAt?.[b.id] || 0;
    return new Date(aDied) - new Date(bDied);
  });

  return (
    <div className="summary-screen">
      <div className="summary-card">
        <h2 className="summary-card__title">Kết thúc ván</h2>
        <p className="summary-card__winner">
          {gameState.winnerId
            ? `Người thắng: ${members.find((m) => m.id === gameState.winnerId)?.name || "?"}`
            : "Không có người thắng"}
        </p>
        <table>
          <thead>
            <tr>
              <th>Hạng</th>
              <th>Người chơi</th>
              <th>Thời gian</th>
              <th>Số lượt</th>
              <th>Lá đã dùng</th>
            </tr>
          </thead>
          <tbody>
            {playersSorted.map((m, idx) => {
              const isWinner = gameState.winnerId === m.id;
              const isDead = !gameState.alive?.[m.id];
              const isYou = m.id === myId;
              const turns = gameState.turnsTaken?.[m.id] ?? 0;
              const played = gameState.cardsPlayed?.[m.id] ?? 0;
              const elapsed = formatElapsed(
                gameState.startedAt,
                isDead ? null : gameState.endedAt,
                gameState.diedAt?.[m.id],
              );
              const rankClass = isWinner
                ? "summary-card__rank--gold"
                : idx === 1
                ? "summary-card__rank--silver"
                : idx === 2
                ? "summary-card__rank--bronze"
                : "";
              return (
                <tr key={m.id} className={isWinner ? "winner-row" : isDead ? "dead-row" : ""}>
                  <td>
                    <span className={`summary-card__rank ${rankClass}`}>#{idx + 1}</span>
                  </td>
                  <td>{m.name}{isYou ? " (bạn)" : ""}</td>
                  <td><code>{elapsed}</code></td>
                  <td>{turns}</td>
                  <td>{played}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="game-modal__actions" style={{ justifyContent: "center", marginTop: 24 }}>
          <button type="button" className="game-action-btn game-action-btn--primary" onClick={onContinue}>
            Về sảnh chờ
          </button>
        </div>
      </div>
    </div>
  );
}
