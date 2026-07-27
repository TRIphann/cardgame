// Seats — renders up to 4 seats per side (left/right). Splits the room
// members so the host always sits at left slot 0 and the rest are spread
// evenly between the two columns. With ≤8 members this gives a balanced
// "left column vs right column" feel; empty slots render a placeholder so
// the layout stays stable as people join/leave.
//
// Props:
//   side:      "left" | "right"
//   members:   array of all room members
//   myId:      current player id (so we can highlight "bạn")
//   onPickAvatar(memberId): callback when the local player clicks their own avatar

import React from "react";

const SLOTS_PER_SIDE = 4;

export function Seats({ side, members, myId, onPickAvatar }) {
  const all = Array.isArray(members) ? members : [];
  // Host always lands on the left at slot 0. Other members are split by
  // arrival order so we don't shuffle the UI every time someone joins.
  const leftMembers = [];
  const rightMembers = [];

  for (let i = 0; i < all.length; i += 1) {
    const m = all[i];
    if (m.isHost) {
      leftMembers.push(m);
    } else {
      // Alternate after the host: 1st non-host → left, 2nd → right, 3rd → left, …
      const idx = i - (leftMembers.length > 0 ? 1 : 0);
      if (idx % 2 === 0) leftMembers.push(m);
      else rightMembers.push(m);
    }
  }

  // Cap each side at 4. If the room ever exceeds 8 we keep the first 4 per side.
  const list = side === "left" ? leftMembers.slice(0, SLOTS_PER_SIDE) : rightMembers.slice(0, SLOTS_PER_SIDE);

  return (
    <ul className={`seats-list seats-${side}-list`} role="list">
      {list.map((m, i) => {
        const isMe = m.id === myId;
        const avatarBg = m.avatar?.color || "linear-gradient(135deg,#2a2f6a,#16193d)";
        const avatarIcon = m.avatar?.icon || "♟";
        return (
          <li
            key={m.id}
            className={`seat ${isMe ? "seat-me" : ""} ${m.isHost ? "seat-host" : ""}`}
            aria-label={`${m.name}${m.isHost ? " (chủ phòng)" : ""}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <button
              type="button"
              className="seat-avatar"
              style={isMe ? { background: avatarBg } : undefined}
              onClick={() => isMe && onPickAvatar?.(m.id)}
              disabled={!isMe}
              aria-label={isMe ? "Đổi avatar của bạn" : `Avatar của ${m.name}`}
              title={isMe ? "Đổi avatar" : undefined}
            >
              <span className="seat-avatar__icon" aria-hidden="true">{avatarIcon}</span>
            </button>
            <div className="seat-info">
              <span className="seat-name">
                {m.name}{isMe ? " (bạn)" : ""}
              </span>
              <span className="seat-tag">
                {m.isHost ? "Chủ phòng" : (m.status === "ready" ? "Sẵn sàng" : "Đang chờ")}
              </span>
            </div>
            {m.isHost && <span className="seat-crown" aria-hidden="true">👑</span>}
          </li>
        );
      })}
    </ul>
  );
}