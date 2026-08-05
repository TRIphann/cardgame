// LandingPage — direct-action flow.
//   - "Tạo phòng"  → POST /api/rooms, then navigate to /lobby (1 click).
//   - "Vào phòng"  → first click reveals the room-code input,
//                    second click posts /api/rooms/join and navigates.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES, saveLastName, loadLastName, API_BASE_URL } from "@config/env.js";
import { useAudio } from "@shared/audio/AudioManager.jsx";
import { useToast } from "@shared/ui/toast.jsx";
import { useI18n } from "@shared/i18n/i18n.jsx";
import { useOptimisticRoom } from "../../hooks/useOptimisticRoom.js";
import "../styles/landing.css";

// Wake the Render free-tier container up-front so the first user action
// doesn't pay the full cold-start cost. We start the prewarm IMMEDIATELY
// when this module loads (no delay) so it overlaps with whatever else the
// browser is doing — typical Render free-tier cold-starts take 30-60s, but
// the actual app-handshake is only ~100ms once the container is warm.
//
// We also fire a second prewarm as soon as the user hovers over either the
// create or join button — that catches the case where someone lands on the
// page and immediately moves their mouse toward the action.
if (typeof window !== "undefined") {
  // 1) Immediate fire on module load. Health URL is resolved at call-time so
  // it picks up the same-origin Netlify proxy when one is configured.
  const healthUrl = `${API_BASE_URL}/health`;
  fetch(healthUrl, { method: "GET", cache: "no-store" }).catch(() => {});
  // 2) Re-fire every 60s while the tab is open so we never go cold during
  //    a long lobby session. Render sleeps after ~15min idle.
  setInterval(() => {
    fetch(healthUrl, { method: "GET", cache: "no-store" }).catch(() => {});
  }, 60_000);
}

export default function LandingPage() {
  const navigate = useNavigate();
  const audio = useAudio();
  const toast = useToast();
  const { t } = useI18n();

  const [name, setName] = useState(() => loadLastName());
  const [code, setCode] = useState("");
  const [stage, setStage] = useState("enter-code"); // for join button
  const [message, setMessage] = useState(null);
  const [shake, setShake] = useState(0);
  const formRef = useRef(null);

  // Two separate navigate handlers so create/join get their own toast copy.
  const onCreateNavigate = useCallback(
    (room) => {
      audio.playSfx(room.code && !String(room.code).startsWith("PENDING") ? "roomCodeReveal" : "buttonClick");
      toast.success(`Đã tạo phòng ${room.code}`, { title: "Tạo phòng thành công", duration: 2000 });
      navigate(ROUTES.lobby, { replace: true });
    },
    [audio, toast, navigate],
  );
  const onJoinNavigate = useCallback(
    (room) => {
      audio.playSfx(room.code && !String(room.code).startsWith("PENDING") ? "roomCodeReveal" : "buttonClick");
      toast.success(`Đã vào phòng ${room.code}`, { title: "Vào phòng thành công", duration: 2000 });
      navigate(ROUTES.lobby, { replace: true });
    },
    [audio, toast, navigate],
  );

  const { run: runCreate, busy: busyCreate } = useOptimisticRoom({ onNavigate: onCreateNavigate });
  const { run: runJoin, busy: busyJoin } = useOptimisticRoom({ onNavigate: onJoinNavigate });
  const busy = busyCreate || busyJoin;

  useEffect(() => {
    // Persist last-used name so refresh on the landing page keeps it.
    if (name) saveLastName(name);
  }, [name]);

  const flash = useCallback((text, tone = "error") => {
    setMessage({ text, tone, key: Date.now() });
  }, []);

  const triggerShake = useCallback(() => setShake((n) => n + 1), []);

  const submit = useCallback(
    async (action) => {
      const trimmed = name.trim();
      if (!trimmed) {
        flash(t("common.nameRequired"));
        triggerShake();
        return;
      }
      if (action === "join" && !code.trim()) {
        flash(t("common.codeRequired"));
        triggerShake();
        return;
      }

      audio.unlock();
      audio.playSfx("buttonClick");

      const pending = toast.info(
        action === "create" ? t("landing.creating") : t("landing.joining"),
        { title: action === "create" ? "Tạo phòng" : "Vào phòng", duration: 0 },
      );

      const runner = action === "create" ? runCreate : runJoin;
      const result = await runner(action, { name: trimmed, code: code.trim().toUpperCase() });
      pending?.dismiss?.();

      if (result.kind === "err") {
        toast.error(result.error?.message || "Có lỗi xảy ra.", {
          title: action === "create" ? "Tạo phòng thất bại" : "Vào phòng thất bại",
        });
        audio.playSfx("error");
        triggerShake();
        flash(humanize(result.error, action));
      }
    },
    [name, code, audio, toast, runCreate, runJoin, flash, triggerShake, t],
  );

  const handleJoinClick = useCallback(() => {
    if (stage === "enter-code") {
      if (!name.trim()) {
        flash(t("common.nameRequired"));
        triggerShake();
        return;
      }
      audio.unlock();
      audio.playSfx("buttonClick");
      setStage("submit");
      return;
    }
    submit("join");
  }, [stage, name, audio, submit, flash, triggerShake, t]);

  // Prewarm on hover so by the time the user actually clicks the button,
  // the backend is already awake. This is in addition to the module-level
  // prewarm and 60s keepalive above.
  const prewarmOnHover = useCallback(() => {
    const healthUrl = `${API_BASE_URL}/health`;
    fetch(healthUrl, { method: "GET", cache: "no-store" }).catch(() => {});
  }, []);

  return (
    <main className={`landing-page ${shake > 0 ? "form-attention" : ""}`} key={`shake-${shake}`}>
      {/* Decorative backdrop — inside the page so it renders above arc-ambient */}
      <div className="landing-backdrop" aria-hidden="true">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="stars" />
        <div className="cards-scene">
          <div className="floating-card card-sun"><span className="card-glyph">☼</span><span className="card-title">SOL</span></div>
          <div className="floating-card card-moon"><span className="card-glyph">☾</span><span className="card-title">LUNA</span></div>
          <div className="floating-card card-eye"><span className="card-glyph">◉</span><span className="card-title">ORACLE</span></div>
          <div className="floating-card card-star"><span className="card-glyph">✦</span><span className="card-title">ASTRA</span></div>
          <div className="floating-card card-flame"><span className="card-glyph">♠</span><span className="card-title">IGNIS</span></div>
        </div>
      </div>
      <section className="welcome-panel" aria-labelledby="game-title">
        <div className="brand-mark"><span></span><b>✦</b><span></span></div>
        <p className="eyebrow">{t("landing.eyebrow")}</p>
        <h1 id="game-title">{t("landing.title")}</h1>
        {t("landing.tagline") && <p className="tagline">{t("landing.tagline")}</p>}
        <div className="divider"><i></i><span>✧</span><i></i></div>

        <form
          className="player-form"
          noValidate
          onSubmit={(e) => { e.preventDefault(); submit("create"); }}
          ref={formRef}
        >
          <label htmlFor="player-name">{t("landing.playerName")}</label>
          <div className="name-input-wrap">
            <span className="input-icon">♙</span>
            <input
              id="player-name"
              name="playerName"
              type="text"
              maxLength={24}
              autoComplete="nickname"
              placeholder={t("landing.playerNamePlaceholder")}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit("create"); } }}
            />
          </div>
          <p className="hint">Tên của bạn sẽ được hiển thị trong đấu trường.</p>

          <div className="action-row landing-actions">
            <button
              className="action-button primary"
              type="submit"
              id="create-button"
              data-action="create"
              disabled={busy}
              onPointerEnter={prewarmOnHover}
              onFocus={prewarmOnHover}
            >
              {t("landing.createRoom")} <span>✦</span>
            </button>
            <button
              className="action-button secondary"
              type="button"
              id="join-button"
              data-action="join"
              data-stage={stage}
              disabled={busy}
              onClick={handleJoinClick}
              onPointerEnter={prewarmOnHover}
              onFocus={prewarmOnHover}
            >
              {t("landing.joinRoom")} <span>{stage === "enter-code" ? "→" : "↳"}</span>
            </button>
          </div>

          {stage === "submit" && (
            <div className="room-actions" id="room-actions">
              <label htmlFor="room-code">Mã phòng</label>
              <div className="name-input-wrap">
                <span className="input-icon">✦</span>
                <input
                  id="room-code"
                  name="roomCode"
                  type="text"
                  maxLength={6}
                  autoComplete="off"
                  placeholder="Nhập mã 6 ký tự"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit("join"); } }}
                />
              </div>
              <p className="hint">Nhập mã phòng rồi bấm «Vào phòng» lần nữa.</p>
            </div>
          )}

          {message && (
            <p key={message.key} className={`form-message tone-${message.tone}`} role="alert">
              {message.text}
            </p>
          )}
        </form>
      </section>

      <div className="corner corner-tl"></div>
      <div className="corner corner-tr"></div>
      <div className="corner corner-bl"></div>
      <div className="corner corner-br"></div>
    </main>
  );
}

function humanize(err, action) {
  const msg = err?.message || "";
  const code = err?.code || "";
  if (code === "invalid_code" || /không hợp lệ|mã phòng không/i.test(msg))
    return "Sai mã phòng. Vui lòng kiểm tra lại mã phòng.";
  if (/timeout|không phản hồi/i.test(msg)) return "Máy chủ không phản hồi. Vui lòng thử lại.";
  if (/network|failed to fetch/i.test(msg)) return "Không kết nối được máy chủ. Kiểm tra CORS hoặc mạng.";
  if (/room_full|đủ người/i.test(msg)) return "Phòng đã đủ người chơi.";
  if (/game_already_started|đã bắt đầu/i.test(msg)) return "Phòng đã bắt đầu chơi rồi.";
  return msg || (action === "join" ? "Vào phòng thất bại." : "Tạo phòng thất bại.");
}