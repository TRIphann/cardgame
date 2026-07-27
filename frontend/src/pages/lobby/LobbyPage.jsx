// LobbyPage — the "waiting room". Players see each other on both sides of
// a deck, copy an invite code, and (for hosts) kick members or start the
// game. Also lets the local player pick their avatar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES, saveSession, loadSession } from "@config/env.js";
import { useSession } from "../../app/session.jsx";
import { useAudio } from "@shared/audio/AudioManager.jsx";
import { useToast } from "@shared/ui/toast.jsx";
import { useI18n } from "@shared/i18n/i18n.jsx";
import { useSettings } from "../../app/settings.jsx";
import { useRoomPolling } from "../../hooks/useRoomPolling.js";
import { useDeckAnimation } from "../../hooks/useDeckAnimation.js";
import { CARD_CLOUDINARY } from "@games/exploding-cats/cardCloudinary.js";
import { FlyingCards } from "./FlyingCards.jsx";
import { Seats } from "./Seats.jsx";
import { AvatarPicker } from "./AvatarPicker.jsx";

const CARD_URLS = Object.values(CARD_CLOUDINARY);

// Catalogue of game modes selectable from the lobby. Right now only the first
// one is implemented; the rest show the animated "?" placeholder.
const GAME_MODES = [
  {
    id: "exploding-cats",
    title: "Đừng rút lá đó",
    tagline: "Đặt bài, rút bài, đừng để con mèo nổ!",
    deckLabel: "EXPLODING CATS",
    implemented: true,
  },
  {
    id: "coming-soon-1",
    title: "Trò chơi đang phát triển",
    tagline: "Sắp ra mắt — theo dõi nhé!",
    deckLabel: "COMING SOON",
    implemented: false,
  },
  {
    id: "coming-soon-2",
    title: "Trò chơi đang phát triển",
    tagline: "Sắp ra mắt — theo dõi nhé!",
    deckLabel: "COMING SOON",
    implemented: false,
  },
];

export default function LobbyPage() {
  const navigate = useNavigate();
  const session = useSession();
  const audio = useAudio();
  const toast = useToast();
  const { t } = useI18n();
  const settings = useSettings();

  const [codeVisible, setCodeVisible] = useState(true);
  const [copyState, setCopyState] = useState("idle"); // 'idle' | 'copied'

  // Game-mode carousel state. Persist across re-renders but not across
  // sessions — players usually want the default first.
  const [modeIndex, setModeIndex] = useState(0);
  const mode = GAME_MODES[modeIndex];

  // Whether the avatar picker popover is open.
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerAnchorRef = useRef(null);

  const deckAnimation = useDeckAnimation({ cardImageUrls: CARD_URLS });

  const roomId = session.session?.roomId;
  const isPending = roomId?.startsWith?.("pending-");
  const { room, error: roomError, refresh } = useRoomPolling(isPending ? null : roomId);

  // Merge local-only avatar choice (from sessionStorage) into the live
  // member list so the seat shows it without a backend round-trip.
  const localAvatar = session.session?.avatar;
  const members = useMemo(() => {
    const list = room?.members || [];
    if (!localAvatar) return list;
    return list.map((m) => (m.id === session.session?.playerId ? { ...m, avatar: localAvatar } : m));
  }, [room, localAvatar, session.session]);

  // Redirect when session is missing.
  useEffect(() => {
    if (!session.session?.roomId) navigate(ROUTES.landing, { replace: true });
  }, [session.session, navigate]);

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

  return (
    <main className="lobby-page">
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
              {codeVisible ? (room?.code || session.session?.roomCode || "------") : "••••••"}
            </span>
            <button
              type="button"
              className={`copy-button ${copyState === "copied" ? "is-copied" : ""}`}
              onClick={handleCopy}
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

          {mode.implemented ? (
            <>
              <div
                className={`deck-pile ${deckAnimation.wiggleLevel ? `wiggle-${deckAnimation.wiggleLevel}` : "idle"}`}
                style={{ display: deckAnimation.isFlying ? "none" : "" }}
              >
                <img src="/assets/cards/default/cards/back.svg" alt="" draggable="false" />
              </div>
              {deckAnimation.isFlying && (
                <FlyingCards
                  refs={deckAnimation.flyingCardRefs}
                  faceUrls={deckAnimation.flyingCardUrls}
                />
              )}
              <p className="deck-label">{mode.deckLabel}</p>
              <p className="deck-subtitle">{mode.tagline}</p>
            </>
          ) : (
            <>
              <div className="deck-coming-soon">
                <span className="deck-coming-soon__qmark" aria-hidden="true">?</span>
              </div>
              <p className="deck-label">{mode.deckLabel}</p>
              <p className="deck-subtitle">{mode.tagline}</p>
            </>
          )}

          <button
            type="button"
            className="deck-arrow deck-arrow-next"
            aria-label="Chế độ chơi tiếp theo"
            onClick={handleNextMode}
          >
            ›
          </button>

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
          {t("lobby.playerCount", { count: members?.length ?? 1 })}
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