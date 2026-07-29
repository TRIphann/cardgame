// BombReveal — cinematic "lá bom được rút" hiện giữa màn hình cho MỌI
// người chơi thấy trong 3s. Sau 3s, nếu player không có defuse thì BomExplode
// overlay sẽ chạy (nổ + screen-shake). Nếu có defuse, animation chỉ là
// reveal + DefuseModal mở bình thường.
//
// Flow:
//   0.0s   card back (lúc player click Rút)
//   0.4s   card flip → mặt bom xuất hiện giữa màn hình
//   0.4-3.4s   pulse + glow + "X rút trúng bom"
//   3.4s+   chuyển phase nổ (nếu không defuse) hoặc fade out (nếu có defuse)

import React, { useEffect, useState } from "react";
import { cardImageUrl } from "@games/exploding-cats/cardCloudinary.js";

const REVEAL_DURATION_MS = 3000;
const FLIP_DELAY_MS = 320;

export function BombReveal({ memberName, memberId, willDefuse, onComplete }) {
  const [phase, setPhase] = useState("back"); // back → flip → face → hold → explode|fadeout
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("flip"), FLIP_DELAY_MS);
    const t2 = setTimeout(() => setPhase("face"), FLIP_DELAY_MS + 380);
    const t3 = setTimeout(() => {
      if (willDefuse) {
        setPhase("fadeout");
        const t4 = setTimeout(() => {
          setMounted(false);
          onComplete?.();
        }, 360);
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
      {/* Background vignette + flash */}
      <div
        className={`bomb-reveal-scrim bomb-reveal-scrim--${phase}`}
        aria-hidden="true"
      />

      {/* The card itself — flies from deck-ish center, then settles big in
          the middle of the viewport. */}
      <div className={`bomb-reveal bomb-reveal--${phase}`}>
        <div className="bomb-reveal__halo" aria-hidden="true" />
        <div className="bomb-reveal__inner">
          <div className="bomb-reveal__face bomb-reveal__face--back">
            <img src={backUrl} alt="" draggable={false} />
          </div>
          <div className="bomb-reveal__face bomb-reveal__face--front">
            <img src={faceUrl} alt="" draggable={false} />
          </div>
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

      {/* Concentric shockwave rings under the bomb — pulse throughout reveal */}
      <div className="bomb-reveal-rings" aria-hidden="true">
        <span className="bomb-reveal-rings__ring" />
        <span className="bomb-reveal-rings__ring bomb-reveal-rings__ring--delay" />
        <span className="bomb-reveal-rings__ring bomb-reveal-rings__ring--late" />
      </div>

      {/* Final explosion flash if no defuse — handled in BombExplode component,
          mounted by parent after reveal completes. */}
    </>
  );
}

// BombExplode — explosive overlay chạy SAU BombReveal khi player không có
// defuse. Multi-layer shockwave + fireball + debris + screen shake.
export function BombExplode({ memberName, onComplete }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setMounted(false);
      onComplete?.();
    }, 2200);
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
        {/* Debris shards */}
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="bomb-explode__shard"
            style={{
              "--angle": `${(i / 14) * 360}deg`,
              "--dist": `${280 + (i % 3) * 70}px`,
              "--delay": `${100 + (i % 4) * 60}ms`,
            }}
          />
        ))}
        {/* Sparks */}
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={`s-${i}`}
            className="bomb-explode__spark"
            style={{
              "--angle": `${((i * 17.3) % 360)}deg`,
              "--dist": `${160 + ((i * 13) % 200)}px`,
              "--delay": `${50 + (i % 5) * 40}ms`,
              color: i % 3 === 0 ? "#ffeb6b" : i % 3 === 1 ? "#ff8a4a" : "#ff4242",
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