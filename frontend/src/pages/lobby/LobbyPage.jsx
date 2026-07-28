// LobbyPage — the "waiting room". Players see each other on both sides of
// a deck, copy an invite code, and (for hosts) kick members or start the
// game. Also lets the local player pick their avatar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ROUTES, saveSession, loadSession } from "@config/env.js";
import { useSession } from "../../app/session.jsx";
import { useAudio } from "@shared/audio/AudioManager.jsx";
import { useToast } from "@shared/ui/toast.jsx";
import { useI18n } from "@shared/i18n/i18n.jsx";
import { useSettings } from "../../app/settings.jsx";
import { useRoomPolling } from "../../hooks/useRoomPolling.js";
import { useDeckAnimation } from "../../hooks/useDeckAnimation.js";
import { FlyingCards } from "./FlyingCards.jsx";
import { Seats } from "./Seats.jsx";
import { AvatarPicker } from "./AvatarPicker.jsx";
import { CARD_CLOUDINARY } from "../../games/exploding-cats/cardCloudinary.js";

// Cloudinary card URLs (basic exploding kittens deck).
// Exclude the "back" card so flying cards only show real game faces.
const CARD_URLS = Object.entries(CARD_CLOUDINARY.cards || {})
  .filter(([key]) => key !== "back")
  .map(([, url]) => url);
const CARD_BACK_URL = CARD_CLOUDINARY.cards?.back || CARD_CLOUDINARY.baseUrl + "/v1785156350/back_knmzmp.svg";

// Read the roomId directly from sessionStorage. Used as a fallback when the
// React session context hasn't re-rendered yet (e.g. right after
// useOptimisticRoom.run -> navigate, before the in-tab session event has
// been processed by the SessionProvider).
function readSessionRoomId() {
  try {
    const raw = sessionStorage.getItem("arcana.session.v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.roomId || null;
  } catch (_) {
    return null;
  }
}

// Catalogue of game modes selectable from the lobby. Right now only the first
// one is implemented; the rest show the animated "?" placeholder.
const GAME_MODES = [
  {
    id: "exploding-cats",
    title: "Đừng rút lá đó",
    tagline: "",
    deckLabel: "ĐỪNG RÚT LÁ NÀY!",
    implemented: true,
  },
  {
    id: "coming-soon-1",
    title: "Trò chơi đang phát triển",
    tagline: "",
    deckLabel: "COMING SOON",
    implemented: false,
  },
  {
    id: "coming-soon-2",
    title: "Trò chơi đang phát triển",
    tagline: "",
    deckLabel: "COMING SOON",
    implemented: false,
  },
];

export default function LobbyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const audio = useAudio();
  const toast = useToast();
  const { t } = useI18n();
  const settings = useSettings();

  // Always-available room code: prefer server room.code, fall back to session.
  // Show real code only when the eye is open AND code is actually available.
  const [codeVisible, setCodeVisible] = useState(false);
  const [copyState, setCopyState]     = useState("idle"); // 'idle' | 'copied'

  // Game-mode carousel state. Persist across re-renders but not across
  // sessions — players usually want the default first.
  const [modeIndex, setModeIndex] = useState(0);
  const mode = GAME_MODES[modeIndex];

  // Whether the avatar picker popover is open.
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerAnchorRef = useRef(null);

  const deckAnimation = useDeckAnimation({ cardImageUrls: CARD_URLS });

  const roomId = session.session?.roomId;
  // Only poll for real room IDs, not pending placeholders
  const isPending = !roomId || (typeof roomId === "string" && roomId.startsWith("pending-"));
  const pollRoomId = isPending ? null : roomId;
  const { room, error: roomError, refresh } = useRoomPolling(pollRoomId);

  // NOTE: displayCode and showCode are defined AFTER room is declared.
  // Prefer server code, fall back to session code
  const displayCode = room?.code || session.session?.roomCode || "";
  // Real code = 6-character A-Z/0-9 string, NOT a placeholder
  const isPlaceholderCode = displayCode && (displayCode.startsWith("pending") || displayCode.length !== 6);
  const hasRealCode = displayCode && displayCode.length === 6 && !displayCode.startsWith("pending");
  // Show code ONLY when the user has clicked the eye-toggle. The code is
  // persistent for the lifetime of this room session — once revealed it stays
  // revealed, but it never auto-reveals.
  const showCode = codeVisible && hasRealCode;

  // Merge local-only avatar choice and isHost status from session.
  const localAvatar = session.session?.avatar;
  const myIsHost = session.session?.isHost;
  const myPlayerId = session.session?.playerId;
  const members = useMemo(() => {
    // When pending (or before server response), make sure the local player
    // shows up in the member list so the count is at least 1.
    const list = room?.members || [];
    const merged = list.map((m) => {
      if (m.id === myPlayerId) {
        return { ...m, avatar: localAvatar, isHost: myIsHost };
      }
      return m;
    });
    // Inject the local player if they're missing from the server snapshot
    if (myPlayerId && !merged.some((m) => m.id === myPlayerId) && (isPending || merged.length === 0)) {
      merged.push({
        id: myPlayerId,
        name: session.session?.playerName || "Bạn",
        isHost: !!session.session?.isHost,
        joinedAt: new Date().toISOString(),
      });
    }
    return merged;
  }, [room, localAvatar, myIsHost, myPlayerId, isPending, session.session?.playerName]);

  // Redirect when session is missing. We read the raw session from storage as
  // a fallback because `useSession()` may not have flushed its state yet on
  // the very first paint after a create/join (the in-tab sessionStorage event
  // fires synchronously, but React state updates are async and `navigate`
  // races ahead of the re-render).
  useEffect(() => {
    const fromStorage = session.session?.roomId || readSessionRoomId();
    if (!fromStorage && location.pathname.startsWith(ROUTES.lobby)) {
      navigate(ROUTES.landing, { replace: true });
    }
  }, [session.session, location.pathname, navigate]);

  // Register settings tabs (members list if host, otherwise just defaults).
  useEffect(() => {
    const myMember = members?.find((m) => m.id === session.session?.playerId);
    const isHost = session.session?.isHost && myMember?.isHost;
    if (!room || !isHost) {
      settings.registerTabs([]);
      return;
    }
    settings.registerTabs([
      {
        id: "members",
        label: "Thành viên",
        render: () => (
          <ul className="settings-member-list">
            {members.map((m) => (
              <li key={m.id} className="settings-member">
                <span>{m.name}{m.isHost ? " 👑" : ""}</span>
                {!m.isHost && m.id !== session.session.playerId && (
                  <button
                    type="button"
                    className="settings-button-danger"
                    data-action="kick"
                    data-payload={JSON.stringify({ memberId: m.id })}
                  >
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
        ),
        onAction: async (action, payload) => {
          if (action === "kick") {
            try {
              await fetch(`/api/rooms/${roomId}/kick`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  hostId: session.session.playerId,
                  targetMemberId: payload.memberId,
                }),
              });
              refresh();
            } catch (e) { toast.error("Kick thất bại."); }
          }
        },
      },
    ]);
  }, [members, session.session, settings, roomId, refresh, toast]);

  // Once room status flips to "playing", navigate to the game route.
  useEffect(() => {
    if (room?.status === "playing") {
      navigate(ROUTES.game(roomId), { replace: true });
    }
  }, [room, navigate, roomId]);

  const handleCopy = useCallback(async () => {
    const code = room?.code || session.session?.roomCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
      audio.playSfx("playerJoin");
      toast.success(t("lobby.copied"), { duration: 1500 });
      setTimeout(() => setCopyState("idle"), 1500);
    } catch (e) {
      toast.error("Không thể sao chép. Hãy copy thủ công.");
    }
  }, [room, session.session, audio, toast, t]);

  const handleLeave = useCallback(() => {
    audio.playSfx("buttonClick");
    session.clear();
    navigate(ROUTES.landing);
  }, [audio, session, navigate]);

  const handleStart = useCallback(async () => {
    audio.playSfx("buttonClick");
    try {
      const res = await fetch(`/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: session.session.playerId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      toast.error(e.message || "Không bắt đầu được ván.");
    }
  }, [audio, roomId, session.session, refresh, toast]);

  const handlePrevMode = useCallback(() => {
    audio.playSfx("buttonClick");
    setModeIndex((i) => (i - 1 + GAME_MODES.length) % GAME_MODES.length);
  }, [audio]);
  const handleNextMode = useCallback(() => {
    audio.playSfx("buttonClick");
    setModeIndex((i) => (i + 1) % GAME_MODES.length);
  }, [audio]);

  // Save avatar selection into sessionStorage so it survives a refresh on
  // the lobby page in the same tab.
  const handleAvatarSelect = useCallback(
    (avatar) => {
      const cur = loadSession();
      if (!cur) return;
      saveSession({ ...cur, avatar });
      session.patch({ avatar });
      setPickerOpen(false);
      audio.playSfx("buttonClick");
      toast.success("Đã cập nhật avatar của bạn.", { duration: 1500 });
    },
    [audio, session, toast],
  );

  const myMember = useMemo(
    () => members?.find((m) => m.id === session.session?.playerId),
    [members, session.session],
  );
  const isHost = myMember?.isHost || (isPending && session.session?.isHost);
  const canStart = isHost && room && members?.length >= 2 && room.status === "waiting";

  const playerCount = Math.max(members?.length ?? 0, 1);

  return (
    <main className="lobby-page">
      {/* Decorative backdrop — inside the page so it renders above arc-ambient */}
      <div className="lobby-backdrop" aria-hidden="true">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="stars" />
        <div className="cards-scene">
          <div className="floating-card card-sun"><span className="card-glyph">☼</span><span className="card-title">SOL</span></div>
          <div className="floating-card card-moon"><span className="card-glyph">☾</span><span className="card-title">LUNA</span></div>
          <div className="floating-card card-eye"><span className="card-glyph">◉</span><span className="card-title">ORACLE</span></div>
          <div className="floating-card card-star"><span className="card-glyph">✦</span><span className="card-title">ASTRA</span></div>
        </div>
      </div>
      <Link to={ROUTES.landing} className="back-link">
        <span>←</span> Quay lại
      </Link>
      <button
        type="button"
        className="settings-button"
        aria-label="Cài đặt"
        onClick={() => { audio.unlock(); settings.open(); }}
      >
        ⚙
      </button>

      <header className="lobby-header">
        <p className="eyebrow">{t("lobby.title")}</p>
        <h1 id="lobby-title">
          {isPending ? "Đang khởi tạo phòng..." : (room ? "Đang triệu hồi đồng đội..." : t("lobby.subtitle"))}
        </h1>

        <div className="invite-card">
          <p className="invite-label">{t("lobby.inviteCode")}</p>
          <div className="invite-code-row">
            <button
              type="button"
              className="code-visibility"
              aria-pressed={codeVisible}
              aria-label="Ẩn/hiện mã phòng"
              onClick={() => setCodeVisible((v) => !v)}
            >
              <span className="eye-icon" data-state={codeVisible ? "visible" : "hidden"} aria-hidden="true">
                <svg viewBox="0 0 24 24" className="eye-open" width="20" height="20">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor"/>
                </svg>
                <svg viewBox="0 0 24 24" className="eye-closed" width="20" height="20">
                  <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M2 12s3.5-7 10-7c2.4 0 4.4.9 6 1.9M22 12s-3.5 7-10 7c-2.4 0-4.4-.9-6-1.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                </svg>
              </span>
            </button>
            <span className="invite-code" id="invite-code">
              {showCode ? displayCode : "••••••"}
            </span>
            <button
              type="button"
              className={`copy-button ${copyState === "copied" ? "is-copied" : ""} ${!displayCode ? "is-error" : ""}`}
              onClick={handleCopy}
              disabled={!displayCode}
              title={displayCode ? "Sao chép mã phòng" : "Đang chờ mã phòng..."}
            >
              <span className="copy-button__label">{copyState === "copied" ? t("lobby.copied") : t("lobby.copy")}</span>
              <span className="copy-button__check" aria-hidden="true">✓</span>
            </button>
          </div>
          <p className="invite-hint">{t("lobby.shareHint")}</p>
        </div>
      </header>

      <section className="stage" aria-label="Sân khấu chính">
        <div className="seats seats-left">
          <Seats
            side="left"
            members={members}
            myId={session.session?.playerId}
            onPickAvatar={() => setPickerOpen(true)}
          />
        </div>

        <div className="deck-area" ref={pickerAnchorRef}>
          <button
            type="button"
            className="deck-arrow deck-arrow-prev"
            aria-label="Chế độ chơi trước"
            onClick={handlePrevMode}
          >
            ‹
          </button>

          <div className="deck-stage">
            {mode.implemented ? (
              <>
                {/* The deck pile stays rendered all the time so flying cards
                    look like they left the stack instead of replacing it. */}
                <div
                  className={`deck-pile ${deckAnimation.wiggleLevel ? `wiggle-${deckAnimation.wiggleLevel}` : "idle"}`}
                  data-flying={deckAnimation.isFlying ? "1" : "0"}
                >
                  <div className="deck-stack">
                    {/* 6 stacked layer surfaces for a thicker, more impressive deck.
                        Pure depth stacking (translateZ only) — no translateY offset. */}
                    <span className="deck-stack__layer" style={{ "--i": 5 }} />
                    <span className="deck-stack__layer" style={{ "--i": 4 }} />
                    <span className="deck-stack__layer" style={{ "--i": 3 }} />
                    <span className="deck-stack__layer" style={{ "--i": 2 }} />
                    <span className="deck-stack__layer" style={{ "--i": 1 }} />
                    <span className="deck-stack__layer deck-stack__layer--top">
                      <img
                        src={CARD_BACK_URL}
                        alt=""
                        draggable="false"
                      />
                    </span>
                  </div>
                  <div className="deck-pile__glow" aria-hidden="true" />
                </div>
                <FlyingCards
                  refs={deckAnimation.flyingCardRefs}
                  faceUrls={deckAnimation.flyingCardUrls}
                  backUrl={CARD_BACK_URL}
                />
              </>
            ) : (
              <div className="deck-coming-soon">
                <span className="deck-coming-soon__qmark" aria-hidden="true">?</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="deck-arrow deck-arrow-next"
            aria-label="Chế độ chơi tiếp theo"
            onClick={handleNextMode}
          >
            ›
          </button>

          <div className="deck-caption">
            <p className="deck-label">{mode.deckLabel}</p>
            {mode.tagline && <p className="deck-subtitle">{mode.tagline}</p>}
          </div>

          {pickerOpen && (
            <AvatarPicker
              initial={session.session?.avatar}
              onSelect={handleAvatarSelect}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>

        <div className="seats seats-right">
          <Seats
            side="right"
            members={members}
            myId={session.session?.playerId}
            onPickAvatar={() => setPickerOpen(true)}
          />
        </div>
      </section>

      <footer className="lobby-footer">
        <p className="player-count">
          {t("lobby.playerCount", { count: playerCount })}
        </p>
        {isHost && (
          <button
            type="button"
            className="start-button"
            disabled={!canStart}
            onClick={handleStart}
          >
            {t("lobby.startGame")}
          </button>
        )}
        <button type="button" className="leave-button" onClick={handleLeave}>
          {t("lobby.leave")}
        </button>
      </footer>

      {roomError && (
        <div className="lobby-error" role="alert">
          {String(roomError.message || roomError)}
        </div>
      )}
    </main>
  );
}