// BombReveal — cinematic premium "lá bom được rút" hiện giữa màn hình cho
// MỌI người chơi thấy. Hiệu ứng được nâng cấp triệt để với:
//   • Card flip 3D với shadow lớn
//   • 6 expanding shockwave rings với stagger delay
//   • 18 particle sparks bay radial ra
//   • "Sparks rain" backdrop
//   • Countdown ring quanh lá
//   • Text label rõ ràng
//
// Flow:
//   0.0s   card back, label "Đang rút..."
//   0.32s  card flip animation begins
//   0.7s   card face (bomb) visible
//   0.7-3.0s  pulse + sparks + countdown
//   3.0s+  chuyển phase nổ (nếu không defuse) hoặc fade out

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const REVEAL_DURATION_MS = 3000;
const FLIP_DELAY_MS = 280;

export function BombReveal({ memberName, memberId, willDefuse, onComplete }) {
  const [phase, setPhase] = useState("back");
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("flip"), FLIP_DELAY_MS);
    const t2 = setTimeout(() => setPhase("face"), FLIP_DELAY_MS + 400);
    const t3 = setTimeout(() => {
      if (willDefuse) {
        setPhase("fadeout");
        const t4 = setTimeout(() => {
          setMounted(false);
          onComplete?.();
        }, 400);
        return () => clearTimeout(t4);
      }
      setPhase("explode");
    }, REVEAL_DURATION_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [willDefuse, onComplete]);

  if (!mounted) return null;

  const backUrl = cardImageUrl("back");
  const faceUrl = cardImageUrl("bomb");

  return (
    <>
      {/* Scrim — red darkening with vignette */}
      <div className={`bomb-reveal-scrim bomb-reveal-scrim--${phase}`} aria-hidden="true" />

      {/* Particle spark burst — pre-fire 18 sparks */}
      <div className="bomb-reveal-sparks" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={`s-${i}`}
            className="bomb-reveal-sparks__spark"
            style={{
              "--angle": `${(i / 18) * 360}deg`,
              "--dist": `${280 + (i % 4) * 80}px`,
              "--delay": `${(phase === "face" || phase === "hold" ? 0 : 200) + (i % 3) * 80}ms`,
            }}
          />
        ))}
      </div>

      {/* Expanding shockwave rings */}
      <div className="bomb-reveal-rings" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="bomb-reveal-rings__ring"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </div>

      {/* The card */}
      <div className={`bomb-reveal bomb-reveal--${phase}`}>
        <div className="bomb-reveal__halo" aria-hidden="true" />
        <div className="bomb-reveal__aura" aria-hidden="true" />
        <div className="bomb-reveal__inner">
          <div className="bomb-reveal__face bomb-reveal__face--back">
            <img src={backUrl} alt="" draggable={false} />
          </div>
          <div className="bomb-reveal__face bomb-reveal__face--front">
            <img src={faceUrl} alt="" draggable={false} />
            <span className="bomb-reveal__pulse-ring" aria-hidden="true" />
          </div>
        </div>

        {/* Countdown ring around the bomb */}
        <div className="bomb-reveal__countdown" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="46"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="6"
            />
            <circle
              cx="50" cy="50" r="46"
              fill="none"
              stroke="url(#bomb-countdown-grad)"
              strokeWidth="6"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              strokeDasharray={`${2 * Math.PI * 46} ${2 * Math.PI * 46}`}
              className="bomb-reveal__countdown-bar"
            />
            <defs>
              <linearGradient id="bomb-countdown-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff8a4a" />
                <stop offset="100%" stopColor="#ff3030" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="bomb-reveal__label">
          <span className="bomb-reveal__name">{memberName || "Bạn"}</span>
          <span className="bomb-reveal__text">
            {phase === "back" && "Đang rút..."}
            {(phase === "flip" || phase === "face" || phase === "hold") && "rút trúng bom!"}
            {phase === "explode" && (willDefuse ? "💣" : "💥 NỔ!")}
            {phase === "fadeout" && "An toàn — có lá Cứu"}
          </span>
        </div>
      </div>
    </>
  );
}

// BombExplode — explosive overlay chạy SAU BombReveal khi player không có defuse.
// Multi-layer shockwave + fireball + debris + screen shake + flame ring + sparks.
export function BombExplode({ memberName, onComplete }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setMounted(false);
      onComplete?.();
    }, 2400);
    return () => clearTimeout(id);
  }, [onComplete]);

  if (!mounted) return null;

  return (
    <>
      {/* Full-screen white flash then darken */}
      <div className="bomb-explode-flash" aria-hidden="true" />

      {/* Big radial fireball + shockwave */}
      <div className="bomb-explode bomb-explode--fireball" aria-hidden="true">
        <div className="bomb-explode__core" />
        <div className="bomb-explode__ring bomb-explode__ring--1" />
        <div className="bomb-explode__ring bomb-explode__ring--2" />
        <div className="bomb-explode__ring bomb-explode__ring--3" />
        <div className="bomb-explode__flame-ring" />
        {/* Debris shards */}
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className="bomb-explode__shard"
            style={{
              "--angle": `${(i / 16) * 360}deg`,
              "--dist": `${320 + (i % 3) * 80}px`,
              "--delay": `${80 + (i % 4) * 50}ms`,
            }}
          />
        ))}
        {/* Sparks */}
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={`s-${i}`}
            className="bomb-explode__spark"
            style={{
              "--angle": `${((i * 17.3) % 360)}deg`,
              "--dist": `${200 + ((i * 13) % 220)}px`,
              "--delay": `${30 + (i % 5) * 30}ms`,
              color: i % 3 === 0 ? "#ffeb6b" : i % 3 === 1 ? "#ff8a4a" : "#ff4242",
            }}
          />
        ))}
        {/* Smoke puffs */}
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={`p-${i}`}
            className="bomb-explode__puff"
            style={{
              "--angle": `${(i / 8) * 360}deg`,
              "--delay": `${120 + (i % 4) * 80}ms`,
            }}
          />
        ))}
      </div>

      {/* Center label */}
      <div className="bomb-explode-label">
        <span className="bomb-explode-label__glyph">💥</span>
        <span className="bomb-explode-label__text">
          {memberName ? `${memberName} đã nổ` : "Bạn đã nổ"}
        </span>
        <span className="bomb-explode-label__sub">Bị loại khỏi ván</span>
      </div>

      {/* Vignette tint */}
      <div className="bomb-explode-vignette" aria-hidden="true" />
    </>
  );
}