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
//   onToggleReady(memberId): callback when a non-host player presses "Sẵn sàng"

import React from "react";

const SLOTS_PER_SIDE = 4;

export function Seats({ side, members, myId, onPickAvatar, onToggleReady }) {
  const all = Array.isArray(members) ? members : [];
  // 1. Pull the host out first so they always own left slot 0.
  // 2. Split remaining players round-robin into left/right so the count is
  //    as balanced as possible (diff ≤ 1 between the two columns). With
  //    ≤4 non-hosts we get 2/2, with 5 we get 3/2, with 6 we get 3/3, etc.
  const host = all.find((m) => m.isHost) || null;
  const others = all.filter((m) => !m.isHost);

  // Distribute non-host players:
  //   1 non-host → right side (so 2-player rooms show host left, guest right)
  //   2+ non-hosts → round-robin fill: [i%2===1 → left, i%2===0 → right]
  //   This gives: 1 non-host → right, 2 non-hosts → left+right, 3 → left+right+left, etc.
  const leftMembers = [];
  const rightMembers = [];
  for (let i = 0; i < others.length; i += 1) {
    if (i % 2 === 0) rightMembers.push(others[i]);
    else leftMembers.push(others[i]);
  }

  const list =
    side === "left"
      ? [host, ...leftMembers].filter(Boolean).slice(0, SLOTS_PER_SIDE)
      : rightMembers.slice(0, SLOTS_PER_SIDE);

  return (
    <ul className={`seats-list seats-${side}-list`} role="list">
      {list.map((m, i) => {
        const isMe = m.id === myId;
        const avatarBg = m.avatar?.color || "linear-gradient(135deg,#2a2f6a,#16193d)";
        const avatarIcon = m.avatar?.icon || "♟";
        const isReady = !!m.isReady;
        return (
          <li
            key={m.id}
            className={`seat ${isMe ? "seat-me" : ""} ${m.isHost ? "seat-host" : ""} ${isReady ? "seat-ready" : ""}`}
            aria-label={`${m.name}${m.isHost ? " (chủ phòng)" : ""}${isReady ? " - sẵn sàng" : ""}`}
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
              {isReady && <span className="seat-ready-badge" aria-hidden="true">✓</span>}
            </button>
            <div className="seat-info">
              <span className="seat-name">
                {m.name}{isMe ? " (bạn)" : ""}
              </span>
              <span className="seat-tag">
                {m.isHost ? "Chủ phòng" : (isReady ? "Sẵn sàng" : "Đang chờ")}
              </span>
            </div>
            {/* Only non-host players see the ready button */}
            {!m.isHost && isMe && onToggleReady && (
              <button
                type="button"
                className={`seat-ready-btn ${isReady ? "is-ready" : ""}`}
                onClick={() => onToggleReady(m.id)}
                aria-pressed={isReady}
              >
                {isReady ? "Hủy sẵn sàng" : "Sẵn sàng"}
              </button>
            )}
            {m.isHost && <span className="seat-crown" aria-hidden="true">👑</span>}
          </li>
        );
      })}
    </ul>
  );
}