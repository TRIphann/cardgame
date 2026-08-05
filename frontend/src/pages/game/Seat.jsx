// Seat — single opponent seat card in the game table.
//
// Rendered as a pure functional component memoized on its props, so
// ticking timers in GamePage (e.g. the 250ms clock) don't force every
// seat to re-render. The compact display: avatar / name / hand count /
// turns taken / alive-or-dead styling / current-turn highlight.

import React, { memo } from "react";

function SeatImpl({ member, gs }) {
  const isCurrent = gs?.currentTurnMemberId === member.id;
  const isAlive = gs ? gs.alive?.[member.id] !== false : true;
  const handCount = gs?.handCounts?.[member.id] ?? 0;
  const turns = gs?.turnsTaken?.[member.id] ?? 0;

  const classes = [
    "game-seat",
    isCurrent ? "game-seat--current" : "",
    !isAlive ? "game-seat--dead" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-member-id={member.id}
      data-current={isCurrent ? "true" : "false"}
      data-alive={isAlive ? "true" : "false"}
    >
      <div className="game-seat__avatar" aria-hidden="true">
        {member.name?.[0]?.toUpperCase() || "?"}
      </div>
      <div className="game-seat__info">
        <div className="game-seat__name">{member.name}</div>
        <div className="game-seat__meta">{turns} lượt</div>
        <div className="game-seat__handcount">{handCount} lá trên tay</div>
      </div>
    </div>
  );
}

// re-render only when member identity or the derived gs counters change.
export const Seat = memo(SeatImpl);
