// Seat — single opponent seat card in the game table.
//
// Rendered as a pure functional component memoized on its props, so
// ticking timers in GamePage (e.g. the 250ms clock) don't force every
// seat to re-render. The compact display: avatar / name / hand count /
// turns taken / alive-or-dead styling / current-turn highlight.
//
// When `isCurrent` flips to true, drive an anime.js entry pulse:
//   • Border glow flash
//   • Avatar scale punch
//   • Border-color halo sweep

import React, { memo, useEffect, useRef, forwardRef } from "react";
import { getAnime, preloadAnime } from "@shared/animation/useAnimeFx.js";

function SeatImpl({ member, gs }, ref) {
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

  const rootRef = useRef(null);
  const avatarRef = useRef(null);
  const prevIsCurrent = useRef(false);

  useEffect(() => { preloadAnime(); }, []);

  // Trigger pulse when this seat becomes the current turn.
  useEffect(() => {
    if (!isCurrent || prevIsCurrent.current) {
      prevIsCurrent.current = isCurrent;
      return undefined;
    }
    prevIsCurrent.current = true;

    if (typeof window === "undefined") return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    if (!rootRef.current) return undefined;

    let cancelled = false;
    let instances = [];

    getAnime().then((animate) => {
      if (cancelled || !rootRef.current) return;
      // Root: brief flash + scale punch.
      instances.push(animate(rootRef.current, {
        scale:    [1, 1.06, 1],
        boxShadow: [
          { to: "0 0 0 0 rgba(255,215,130,0), 0 0 24px 8px rgba(255,215,130,0.55)", duration: 0 },
          { to: "0 0 0 0 rgba(255,215,130,0), 0 0 36px 14px rgba(255,215,130,0.85)", duration: 280, ease: "outQuad" },
          { to: "0 0 0 0 rgba(255,215,130,0), 0 0 24px 8px rgba(255,215,130,0.55)", duration: 360, ease: "outQuad" },
        ],
        duration: 640,
        ease: "outExpo",
      }));

      if (avatarRef.current) {
        instances.push(animate(avatarRef.current, {
          scale:   [1, 1.18, 1],
          rotate:  [0, -8, 8, 0],
          duration: 700,
          ease:    "outElastic(1, .7)",
        }));
      }
    }).catch(() => { /* */ });

    return () => {
      cancelled = true;
      instances.forEach((i) => { try { i?.cancel?.(); } catch (_) { /* */ } });
    };
  }, [isCurrent]);

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={classes}
      data-member-id={member.id}
      data-current={isCurrent ? "true" : "false"}
      data-alive={isAlive ? "true" : "false"}
    >
      <div ref={avatarRef} className="game-seat__avatar" aria-hidden="true">
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

export const Seat = memo(forwardRef(SeatImpl));