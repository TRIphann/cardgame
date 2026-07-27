// Seats — renders up to 4 seats per side (left/right). Splits the room
// members so 4 go on each side. Empty slots render a placeholder.

import React from "react";

const SLOTS = [0, 1, 2, 3];

export function Seats({ side, room, session }) {
  const members = (room?.members || []).filter((m) => {
    // The "host" always lands on the left in the current layout (4/4 split,
    // host at left slot 0). Other members are split by index parity.
    if (!m.isHost && side === "left") return false;
    if (m.isHost && side === "right") return false;
    return true;
  });

  return (
    <ul className={`seats-list seats-${side}-list`} role="list">
      {SLOTS.map((i) => {
        const m = members[i];
        if (!m) {
          return (
            <li key={i} className="seat seat-empty" aria-label="Còn trống">
              <span className="seat-name">—</span>
            </li>
          );
        }
        const isMe = m.id === session?.playerId;
        return (
          <li
            key={m.id}
            className={`seat ${isMe ? "seat-me" : ""} ${m.isHost ? "seat-host" : ""}`}
          >
            {m.isHost && <span className="seat-crown" aria-hidden="true">👑</span>}
            <span className="seat-name">{m.name}{isMe ? " (bạn)" : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}