// BombReveal — cinematic "lá bom được rút" hiện giữa màn hình cho
// MỌI người chơi thấy.
//
// Phase timeline:
//   0.00s  card back appears + sparks begin
//   0.18s  flip animation starts
//   0.55s  bomb face revealed, shockwave + countdown ring start
//   3.00s  → fadeout (has defuse) OR → explode (no defuse)
//
// Multi-layer upgrades: flip speed, shockwave rings, particle sparks,
// countdown arc, screen flash on explode, ghost-card trail.

import React, { useEffect, useRef, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const REVEAL_MS  = 3000;
const FLIP_MS    = 200;   // faster flip (was 280ms)
const FLIP_DELAY = 180;   // delay before flip starts

export function BombReveal({ memberName, willDefuse, onComplete }) {
  const [phase, setPhase] = useState("back");   // back | flip | face | hold | fadeout | explode
  const [mounted, setMounted] = useState(true);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  const t4Ref = useRef(null);

  useEffect(() => {
    // Always clear any pending t4 from a previous render before scheduling a new one.
    if (t4Ref.current) { clearTimeout(t4Ref.current); t4Ref.current = null; }

    const t1 = setTimeout(() => setPhase("flip"), FLIP_DELAY);
    const t2 = setTimeout(() => setPhase("face"), FLIP_DELAY + FLIP_MS);
    const t3 = setTimeout(() => {
      setPhase(willDefuse ? "fadeout" : "explode");
      t4Ref.current = setTimeout(() => {
        setMounted(false);
        onCompleteRef.current?.();
      }, willDefuse ? 450 : 200);
    }, REVEAL_MS);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      if (t4Ref.current) { clearTimeout(t4Ref.current); t4Ref.current = null; }
    };
  }, [willDefuse]);

  if (!mounted) return null;

  const backUrl = cardImageUrl("back");
  const faceUrl = cardImageUrl("bomb");
  const CARD_W  = 240;
  const CARD_H  = 344;

  // Build countdown progress (0 → 1 over REVEAL_MS).
  const countdownFrac = 1; // CSS animation drives this

  return (
    <>
      {/* Darkening scrim */}
      <div
        className={`bomb-reveal-scrim bomb-reveal-scrim--${phase}`}
        aria-hidden="true"
      />

      {/* Pre-fire sparks (burst before flip) */}
      <div className="bomb-sparks-field" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={`s-${i}`}
            className="bomb-sparks__spark"
            style={{
              "--ang":    `${(i / 24) * 360}deg`,
              "--dist":   `${280 + (i % 5) * 80}px`,
              "--delay":  `${i * 40}ms`,
            }}
          />
        ))}
      </div>

      {/* Main bomb card */}
      <div
        className={`bomb-reveal bomb-reveal--${phase}`}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {/* Outer glow aura */}
        <div className="bomb-reveal__outer-glow" aria-hidden="true" />

        {/* 3D inner card */}
        <div className="bomb-reveal__inner">
          <div className="bomb-reveal__face bomb-reveal__face--back">
            <img src={backUrl} alt="" draggable={false} />
          </div>
          <div className="bomb-reveal__face bomb-reveal__face--front">
            <img src={faceUrl} alt="💣" draggable={false} />
            {/* Pulsing danger ring */}
            <div className="bomb-reveal__pulse-ring" aria-hidden="true" />
          </div>
        </div>

        {/* Countdown arc — SVG ring that depletes */}
        <div className="bomb-reveal__countdown" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="bomb-countdown-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#ff8a4a" />
                <stop offset="100%" stopColor="#ff2020" />
              </linearGradient>
            </defs>
            {/* Background track */}
            <circle cx="60" cy="60" r="54" fill="none"
              stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            {/* Countdown bar */}
            <circle cx="60" cy="60" r="54" fill="none"
              stroke="url(#bomb-countdown-grad)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 54} ${2 * Math.PI * 54}`}
              className="bomb-countdown-bar"
            />
          </svg>
        </div>

        {/* Label */}
        <div className="bomb-reveal__label">
          <div className="bomb-reveal__name">{memberName || "Bạn"}</div>
          <div className="bomb-reveal__text">
            {phase === "back"  && "Đang rút..."}
            {(phase === "flip" || phase === "face" || phase === "hold") && "💣 rút trúng bom!"}
            {phase === "explode" && "💥 NỔ!"}
            {phase === "fadeout" && "💚 An toàn"}
          </div>
        </div>
      </div>

      {/* Expanding shockwave rings */}
      <div className="bomb-shockwaves" aria-hidden="true">
        {[0,1,2,3,4].map((i) => (
          <span
            key={i}
            className="bomb-shockwave"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </div>

      {/* Flash on explode */}
      {phase === "explode" && (
        <div className="bomb-camera-flash" aria-hidden="true" />
      )}
    </>
  );
}

// ── BombExplode — full-screen fireball overlay ──────────────────────────────
export function BombExplode({ memberName, onComplete }) {
  const [mounted, setMounted] = useState(true);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const id = setTimeout(() => {
      setMounted(false);
      onCompleteRef.current?.();
    }, 2400);
    return () => clearTimeout(id);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* Full-screen white flash */}
      <div className="bomb-explode-flash" aria-hidden="true" />

      {/* Vignette red */}
      <div className="bomb-explode-vignette" aria-hidden="true" />

      {/* Fireball core */}
      <div className="bomb-explode bomb-explode--core" aria-hidden="true">
        <div className="bomb-explode__core-inner" />
      </div>

      {/* Fireball shockwave rings */}
      {[0,1,2].map((i) => (
        <div
          key={i}
          className={`bomb-explode bomb-explode__ring bomb-explode__ring--${i}`}
          style={{ animationDelay: `${0.05 + i * 0.15}s` }}
          aria-hidden="true"
        />
      ))}

      {/* Debris shards */}
      {Array.from({ length: 20 }).map((_, i) => (
        <span
          key={`shard-${i}`}
          className="bomb-explode__shard"
          style={{
            "--ang":   `${(i / 20) * 360}deg`,
            "--dist":  `${320 + (i % 4) * 90}px`,
            "--delay": `${60 + (i % 5) * 50}ms`,
          }}
        />
      ))}

      {/* Sparks */}
      {Array.from({ length: 32 }).map((_, i) => (
        <span
          key={`sp-${i}`}
          className="bomb-explode__spark"
          style={{
            "--ang":   `${((i * 17.3) % 360)}deg`,
            "--dist":  `${200 + ((i * 13) % 220)}px`,
            "--delay": `${30 + (i % 6) * 30}ms`,
            color:    i % 3 === 0 ? "#ffeb6b" : i % 3 === 1 ? "#ff8a4a" : "#ff4242",
          }}
        />
      ))}

      {/* Smoke puffs */}
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={`puff-${i}`}
          className="bomb-explode__puff"
          style={{
            "--ang":   `${(i / 8) * 360}deg`,
            "--delay": `${120 + (i % 4) * 80}ms`,
          }}
        />
      ))}

      {/* Label */}
      <div className="bomb-explode-label">
        <div className="bomb-explode-label__glyph">💥</div>
        <div className="bomb-explode-label__text">
          {memberName ? `${memberName} đã nổ` : "Bạn đã nổ"}
        </div>
        <div className="bomb-explode-label__sub">Đã bị loại khỏi ván</div>
      </div>
    </>
  );
}
