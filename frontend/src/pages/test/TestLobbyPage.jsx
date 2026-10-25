// TestLobby — sandbox room for testing card mechanics, effects, and UI.
// Features:
// - Auto-creates room with 4 bots (code: TEST)
// - Bots auto-ready and auto-draw when it's their turn
// - Host can configure:
//   1. Custom hands per player (Card Selection tab)
//   2. Custom deck order (Deck Builder tab)
//   3. Bot behavior (Auto-draw, Play cards, or Skip)
// - No heartbeat needed for bots

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES, saveSession, API_BASE_URL } from "@config/env.js";
import { useAudio } from "@shared/audio/AudioManager.jsx";
import { useToast } from "@shared/ui/toast.jsx";
import { ExitTestButton } from "./ExitTestButton.jsx";
import "../styles/testLobby.css";

// Full card catalog
const CARD_CATALOG = {
  // Defuse variants
  "defuse": { name: "Cứu", color: "#4CAF50", icon: "🛡️", type: "defuse" },
  "ninja": { name: "Ninja", color: "#2196F3", icon: "🥷", type: "defuse" },
  "superman": { name: "Superman", color: "#F44336", icon: "🦸", type: "defuse" },
  "zombie": { name: "Zombie", color: "#9C27B0", icon: "🧟", type: "defuse" },
  "robot": { name: "Robot", color: "#607D8B", icon: "🤖", type: "defuse" },
  "hải-tặc": { name: "Hải Tặc", color: "#FF9800", icon: "🏴‍☠️", type: "defuse" },
  // Action cards
  "attack": { name: "Tấn Công", color: "#E91E63", icon: "⚔️", type: "action" },
  "skip": { name: "Bỏ Qua", color: "#9C27B0", icon: "🚫", type: "action" },
  "shuffle": { name: "Xáo Bài", color: "#00BCD4", icon: "🔀", type: "action" },
  "favor": { name: "Nợ Nần", color: "#FF5722", icon: "💀", type: "action" },
  "nope": { name: "Cản", color: "#FFC107", icon: "✋", type: "action" },
  "future": { name: "Tương Lai", color: "#3F51B5", icon: "🔮", type: "action" },
  "bomb": { name: "Bom", color: "#F44336", icon: "💣", type: "bomb" },
};

const ALL_CARD_KEYS = Object.keys(CARD_CATALOG);
const ACTION_CARDS = ALL_CARD_KEYS.filter(k => CARD_CATALOG[k].type === "action");
const DEFUSE_CARDS = ALL_CARD_KEYS.filter(k => CARD_CATALOG[k].type === "defuse");
const BOMB_CARD = "bomb";

// Default starting hand for host
const DEFAULT_HAND_CARDS = ["defuse", "attack", "skip", "nope", "favor"];

// Deck composition for 5 players
const DECK_SIZE = 41;

export default function TestLobbyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const audio = useAudio();

  const [session, setSession] = useState(null);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState("cards"); // "cards" | "deck" | "bots"
  const [cardPicker, setCardPicker] = useState(null); // { slotIndex, forDefuse }

  // ── Card selection state ──────────────────────────────────────────
  // per-member hand counts: { [memberId]: { [cardKey]: count } }
  const [memberHands, setMemberHands] = useState({});

  // ── Custom deck state ─────────────────────────────────────────────
  // deck[0..40] = card key or null (face-down)
  const [deckSlots, setDeckSlots] = useState(() =>
    Array(DECK_SIZE).fill(null)
  );
  const [, setDeckAutoShuffle] = useState(false);

  // ── Bot settings state ─────────────────────────────────────────────
  // { [memberId]: { mode, card? } }
  //   mode values:
  //     "draw-only"      – bot just draws; defuses bombs (then dies); never
  //                        plays action cards. Default for fresh rooms.
  //     "play-cards"     – bot draws + plays any action card from its hand
  //                        using the priority order (attack > skip > favor…).
  //     "skip"           – bot does nothing; the host drives the turn.
  //     "play-one-card"  – bot draws first, then if the designated `card`
  //                        is in its hand, plays exactly that one card.
  //                        If the card isn't in hand, the turn advances
  //                        normally (no retry on later turns). Designed for
  //                        reproducing specific card interactions during QA.
  // { [memberId]: { mode, card? } }
  const [botSettings, setBotSettings] = useState({});
  const [playCardsAll, setPlayCardsAll] = useState(false);
  const [drawOnlyAll, setDrawOnlyAll] = useState(true); // Default to draw-only

  // Modal: which bot are we picking a card for? { memberId, memberName }
  const [oneCardPicker, setOneCardPicker] = useState(null);

  // ── Game settings ──────────────────────────────────────────────────
  const [dealCards, setDealCards] = useState(true);
  const [firstPlayerId, setFirstPlayerId] = useState(null);
  const [disableBotService, setDisableBotService] = useState(false);
  const [botTurnSeconds, setBotTurnSeconds] = useState(1); // Fast test mode: 1 second (instant execution)

  // Handle browser back button - always go to landing
  useEffect(() => {
    const handlePopState = (e) => {
      e.preventDefault();
      navigate(ROUTES.landing, { replace: true });
    };
    window.addEventListener("popstate", handlePopState);
    window.history.replaceState(null, "", "/test");
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigate]);

  // Load/join test room on mount
  useEffect(() => {
    async function init() {
      try {
        const lastName = localStorage.getItem("arcana.lastName.v1") || "TestHost";

        // Clear any existing test room first — only one active test room at a time in local dev
        // Use await to ensure the delete completes before creating new room
        await fetch(`${API_BASE_URL}/api/test/room/current`, {
          method: "DELETE",
        });

        // Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 200));

        const res = await fetch(`${API_BASE_URL}/api/test/room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostName: lastName }),
        });

        if (!res.ok) throw new Error("Failed to create test room");
        const data = await res.json();

        const sess = {
          roomId: data.roomId,
          roomCode: data.code,
          playerId: data.memberId,
          playerName: data.hostName,
          isHost: true,
          stage: "lobby",
        };
        saveSession(sess);
        setSession(sess);

        // Initialize member hands with default
        const initHands = {};
        const initBotSettings = {};
        const initDeck = Array(DECK_SIZE).fill(null);

        if (data.members) {
          data.members.forEach((m) => {
            initHands[m.id] = {};
            DEFAULT_HAND_CARDS.forEach((c) => {
              initHands[m.id][c] = 1;
            });
        // Initialize in draw-only mode. `card` is null until the user
        // picks a specific card for the "play-one-card" mode.
        initBotSettings[m.id] = {
              mode: "draw-only",
              card: null,
              cards: [],
            };
          });
        }

        setMemberHands(initHands);
        setBotSettings(initBotSettings);
        setDeckSlots(initDeck);

        await refreshRoom(data.roomId);
        setLoading(false);
      } catch (err) {
        toast.error("Không thể tạo phòng test: " + err.message);
        setLoading(false);
      }
    }
    init();
  }, []);

  const refreshRoom = async (roomId) => {
    try {
      const snapshotRes = await fetch(`${API_BASE_URL}/api/test/room/${roomId}/snapshot`);
      if (snapshotRes.ok) {
        const snapshot = await snapshotRes.json();
        const roomData = snapshot.room || snapshot;
        setRoom(roomData);

        // Sync first player to host
        if (!firstPlayerId && roomData.hostId) {
          setFirstPlayerId(roomData.hostId);
        }

        // Sync bot settings with room members
        if (roomData.members) {
          setBotSettings((prev) => {
            const updated = { ...prev };
            roomData.members.forEach((m) => {
              if (m.isBot && !updated[m.id]) {
                updated[m.id] = { mode: drawOnlyAll ? "draw-only" : "skip", cards: [] };
              }
            });
            return updated;
          });
        }
      }
    } catch (_) {
      // Silent: refresh failures during cold-start are expected; the lobby
      // shows its own inline error state instead of spamming the console.
    }
  };

  // ── Card Selection handlers ─────────────────────────────────────────
  const handleCardCountChange = useCallback((memberId, cardKey, delta) => {
    setMemberHands((prev) => {
      const member = prev[memberId] || {};
      const current = member[cardKey] || 0;
      const next = Math.max(0, Math.min(10, current + delta));
      const updated = { ...prev, [memberId]: { ...member, [cardKey]: next } };
      return updated;
    });
  }, []);

  const handleFillBotsWithDefault = useCallback(() => {
    setMemberHands((prev) => {
      const updated = { ...prev };
      room?.members?.forEach((m) => {
        if (m.isBot) {
          const newHand = {};
          DEFAULT_HAND_CARDS.forEach((c) => { newHand[c] = 1; });
          updated[m.id] = newHand;
        }
      });
      return updated;
    });
  }, [room]);

  const handleClearBots = useCallback(() => {
    setMemberHands((prev) => {
      const updated = { ...prev };
      room?.members?.forEach((m) => {
        if (m.isBot) {
          updated[m.id] = {};
        }
      });
      return updated;
    });
  }, [room]);

  // ── Deck builder handlers ──────────────────────────────────────────
  const handleDeckSlotClick = useCallback((index) => {
    audio.playSfx("cardFlip");
    setCardPicker({ slotIndex: index, forDefuse: false });
  }, [audio]);

  const handleAutoShuffleDeck = useCallback(() => {
    audio.playSfx("buttonClick");
    // Build a default deck
    const deck = [];

    // 5 defuses at specific positions (will be dealt to players first)
    const defuses = ["defuse", "ninja", "superman", "zombie", "robot"];

    // 4 bombs
    for (let i = 0; i < 4; i++) deck.push(BOMB_CARD);
    // 5 futures
    for (let i = 0; i < 5; i++) deck.push("future");
    // 5 nopes
    for (let i = 0; i < 5; i++) deck.push("nope");
    // 6 defuses
    defuses.forEach((d) => deck.push(d));
    deck.push("defuse"); // extra defuse
    // 4 each of attack, favor, shuffle, skip
    for (let i = 0; i < 4; i++) { deck.push("attack"); deck.push("favor"); deck.push("shuffle"); deck.push("skip"); }
    // Combo cards: 4 total across 5 types
    const combos = ["ninja", "superman", "zombie", "robot", "hải-tặc"];
    for (let i = 0; i < 4; i++) deck.push(combos[i % combos.length]);

    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Fill to DECK_SIZE
    while (deck.length < DECK_SIZE) deck.push(ACTION_CARDS[Math.floor(Math.random() * ACTION_CARDS.length)]);

    setDeckSlots(deck.slice(0, DECK_SIZE));
    setDeckAutoShuffle(true);
  }, [audio]);

  const handleClearDeck = useCallback(() => {
    audio.playSfx("buttonClick");
    setDeckSlots(Array(DECK_SIZE).fill(null));
    setDeckAutoShuffle(false);
  }, [audio]);

  const handleCardPickerSelect = useCallback((cardKey) => {
    if (!cardPicker) return;
    setDeckSlots((prev) => {
      const next = [...prev];
      next[cardPicker.slotIndex] = cardKey;
      return next;
    });
    setCardPicker(null);
    setDeckAutoShuffle(false);
  }, [cardPicker]);

  const handleCardPickerClose = useCallback(() => {
    setCardPicker(null);
  }, []);

  // ── Bot settings handlers ──────────────────────────────────────────
  const handleBotModeChange = useCallback((memberId, mode) => {
    setBotSettings((prev) => {
      // Switching to "play-one-card" — keep the previously chosen card if
      // any (so the user doesn't lose their pick when accidentally toggling
      // modes). Switching away clears the pick so the next time the user
      // re-selects "play-one-card" they get a fresh picker.
      const wasOneCard = prev[memberId]?.mode === "play-one-card";
      const keepCard = mode === "play-one-card" && wasOneCard;
      return {
        ...prev,
        [memberId]: {
          ...prev[memberId],
          mode,
          // Preserve `card` only when staying inside "play-one-card". If
          // the user switches to draw-only/play-cards/skip we drop it.
          card: keepCard ? prev[memberId]?.card : (mode === "play-one-card" ? (prev[memberId]?.card || null) : null),
          cards: [],
        },
      };
    });
    // Clear global toggles when individual bot changes
    setDrawOnlyAll(false);
    setPlayCardsAll(false);
  }, []);

  // Open the card-picker modal for a specific bot. The modal's onSelect
  // callback updates that bot's designated card and closes itself.
  const handlePickOneCard = useCallback((memberId, memberName) => {
    setOneCardPicker({ memberId, memberName });
  }, []);

  const handleOneCardSelect = useCallback((cardKey) => {
    if (!oneCardPicker) return;
    setBotSettings((prev) => ({
      ...prev,
      [oneCardPicker.memberId]: {
        ...(prev[oneCardPicker.memberId] || { mode: "play-one-card" }),
        mode: "play-one-card",
        card: cardKey,
      },
    }));
    setOneCardPicker(null);
  }, [oneCardPicker]);

  const handleOneCardClear = useCallback((memberId) => {
    setBotSettings((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], card: null },
    }));
  }, []);

  const handleToggleDrawOnlyAll = useCallback(() => {
    const next = !drawOnlyAll;
    setDrawOnlyAll(next);
    if (next) setPlayCardsAll(false);
    setBotSettings((prev) => {
      const updated = {};
      Object.entries(prev).forEach(([id, settings]) => {
        updated[id] = { ...settings, mode: "draw-only", card: null };
      });
      return updated;
    });
  }, [drawOnlyAll]);

  const handleTogglePlayCardsAll = useCallback(() => {
    const next = !playCardsAll;
    setPlayCardsAll(next);
    if (next) setDrawOnlyAll(false);
    setBotSettings((prev) => {
      const updated = {};
      Object.entries(prev).forEach(([id, settings]) => {
        updated[id] = { ...settings, mode: "play-cards", card: null };
      });
      return updated;
    });
  }, [playCardsAll]);

  // ── Start game ─────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!session?.roomId) return;

    setStarting(true);
    audio.playSfx("buttonClick");

    try {
      // Build custom hands: only non-empty hands
      const customHands = {};
      room?.members?.forEach((m) => {
        const hand = memberHands[m.id];
        if (hand) {
          const cards = [];
          Object.entries(hand).forEach(([key, count]) => {
            for (let i = 0; i < count; i++) cards.push(key);
          });
          if (cards.length > 0) {
            customHands[m.id] = cards;
          }
        }
      });

      // Build custom deck
      const hasCustomDeck = deckSlots.some((s) => s !== null);
      const customDeck = hasCustomDeck ? deckSlots.filter(Boolean) : null;

      // Build bot IDs
      const drawOnlyBotIds = [];
      const playCardsBotIds = [];
      // Per-bot "play exactly this card on my turn" map. Bots whose mode is
      // `play-one-card` AND who have a designated card picked get added
      // here. If the user toggled `play-one-card` but hasn't chosen a card
      // yet, we fall back to `draw-only` so the bot still moves (rather
      // than being silently skipped because the backend sees neither
      // isDrawOnly nor isOneCardBot on its turn).
      const oneCardBotCardMap = {};
      room?.members?.forEach((m) => {
        if (m.isBot) {
          const settings = botSettings[m.id];
          if (settings?.mode === "draw-only") drawOnlyBotIds.push(m.id);
          if (settings?.mode === "play-cards") playCardsBotIds.push(m.id);
          if (settings?.mode === "play-one-card" && settings.card) {
            oneCardBotCardMap[m.id] = settings.card;
          }
        }
      });

      const res = await fetch(`${API_BASE_URL}/api/test/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: session.roomId,
          firstPlayerId: firstPlayerId,
          customHands: Object.keys(customHands).length > 0 ? customHands : null,
          dealCards,
          customDeck,
          drawOnlyBotIds: drawOnlyBotIds.length > 0 ? drawOnlyBotIds : null,
          playCardsBotIds: playCardsBotIds.length > 0 ? playCardsBotIds : null,
          oneCardBotCardMap: Object.keys(oneCardBotCardMap).length > 0 ? oneCardBotCardMap : null,
          disableBotService,
          botTurnSeconds: disableBotService ? 0 : botTurnSeconds,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed to start game");
      }

      const startResult = await res.json();

      // Cache the start payload ONLY if it carries a valid `myHand` (the
      // expected shape after the backend fix). If it doesn't, drop the
      // cache entirely so GamePage falls back to a fresh server fetch
      // instead of rendering an empty hand.
      const hasUsableHand = Array.isArray(startResult?.myHand)
        && startResult.myHand.length > 0;
      if (hasUsableHand) {
        sessionStorage.setItem(
          `test_game_init_${session.roomId}`,
          JSON.stringify(startResult),
        );
      } else {
        sessionStorage.removeItem(`test_game_init_${session.roomId}`);
      }

      navigate(`${ROUTES.game(session.roomId)}?test=1`, { replace: true });
    } catch (err) {
      toast.error("Không thể bắt đầu: " + err.message);
      setStarting(false);
    }
  };

  const handleLeave = () => {
    audio.playSfx("buttonClick");
    navigate(ROUTES.landing, { replace: true });
  };

  const handleFirstPlayerChange = (memberId) => {
    setFirstPlayerId(memberId);
    audio.playSfx("buttonClick");
  };

  // Derived state ─────────────────────────────────────────────────
  const memberHandCounts = useMemo(() => {
    const result = {};
    room?.members?.forEach((m) => {
      const hand = memberHands[m.id] || {};
      result[m.id] = Object.values(hand).reduce((a, b) => a + b, 0);
    });
    return result;
  }, [room, memberHands]);

  const isDeckValid = useMemo(() => {
    return deckSlots.some((s) => s !== null);
  }, [deckSlots]);

  // Hide backdrop once game starts so it doesn't peek through GamePage
  const gameStarted = room?.status === "Playing" || room?.status === "Finished";

  // ── Render helpers ────────────────────────────────────────────────
  const _getMemberName = (memberId) => {
    const m = room?.members?.find((m) => m.id === memberId);
    return m?.name || "Unknown";
  };

  if (loading) {
    return (
      <main className="game-page test-lobby">
        <div className="lobby-backdrop" aria-hidden="true" style={{ display: gameStarted ? "none" : undefined }}>
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
        <div className="arc-loading">
          <div className="arc-loading__spinner" />
          <span>Đang tạo phòng test...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="game-page test-lobby">
      {!gameStarted && (
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
      )}

      <div className="test-lobby__container">
        {/* Header */}
        <div className="test-lobby__header">
          <h1>🧪 Test Lobby</h1>
          <p>Phòng test với 4 bots — không cần Heartbeat</p>
        </div>

        {/* Room info */}
        <div className="test-lobby__room-info">
          <div className="room-code-display">
            <span className="label">Mã phòng:</span>
            <span className="code">TEST</span>
          </div>
        </div>

        {/* Members with first player selector */}
        <div className="test-lobby__members">
          <h2>Người chơi</h2>
          <ul className="member-list">
            {room?.members?.map((m) => (
              <li key={m.id} className={`member-item ${m.isBot ? "bot" : ""} ${m.isHost ? "host" : ""} ${firstPlayerId === m.id ? "first" : ""}`}>
                <div className="member-info">
                  <span className="member-name">{m.name}</span>
                  {m.isBot && <span className="bot-badge">🤖</span>}
                  {m.isHost && <span className="host-badge">👑</span>}
                </div>
                <button
                  className={`btn-first ${firstPlayerId === m.id ? "active" : ""}`}
                  onClick={() => handleFirstPlayerChange(m.id)}
                  title="Đi trước"
                >
                  {firstPlayerId === m.id ? "1st" : "→1st"}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Game settings */}
        <div className="test-lobby__game-settings">
          <label className="toggle-row">
            <span>Deal bài (mỗi người 1 cứu + 4 lá)</span>
            <button
              className={`toggle-btn ${dealCards ? "on" : "off"}`}
              onClick={() => setDealCards(!dealCards)}
            >
              {dealCards ? "ON" : "OFF"}
            </button>
          </label>
          <p className="setting-hint">
            {dealCards
              ? "Bình thường: rút defuse, bốc 4 lá, bom được đặt ngẫu nhiên."
              : "Test mode: tay trống, bạn tự chọn bài cho mỗi người."}
          </p>
          <label className="toggle-row">
            <span>Tắt BotService (điều khiển thủ công)</span>
            <button
              className={`toggle-btn ${disableBotService ? "on" : "off"}`}
              onClick={() => setDisableBotService(!disableBotService)}
            >
              {disableBotService ? "ON" : "OFF"}
            </button>
          </label>
          <p className="setting-hint">
            {disableBotService
              ? "BotService sẽ bỏ qua phòng này. Bạn kiểm soát hoàn toàn ván chơi."
              : "BotService xử lý tự động theo cài đặt bot."}
          </p>
          {!disableBotService && (
            <>
              <label className="toggle-row">
                <span>Bot nhanh ({botTurnSeconds}s / lượt)</span>
                <div className="speed-control">
                  <button
                    className="btn-count-sm"
                    onClick={() => setBotTurnSeconds(Math.max(0, botTurnSeconds - 1))}
                  >−</button>
                  <span className="speed-value">{botTurnSeconds}s</span>
                  <button
                    className="btn-count-sm"
                    onClick={() => setBotTurnSeconds(Math.min(30, botTurnSeconds + 1))}
                  >+</button>
                </div>
              </label>
              <p className="setting-hint">
                Bot sẽ hành động ngay lập tức sau khi đến lượt (tối đa 10s — đồng bộ với quy tắc timer 10s thống nhất). Đặt 0s để instant, 1s để test nhanh.
              </p>
            </>
          )}
        </div>

        {/* Tab navigation */}
        <div className="test-lobby__tabs">
          <button
            className={`tab-btn ${activeTab === "cards" ? "active" : ""}`}
            onClick={() => setActiveTab("cards")}
          >
            🃏 Bài
          </button>
          <button
            className={`tab-btn ${activeTab === "deck" ? "active" : ""}`}
            onClick={() => setActiveTab("deck")}
          >
            📦 Deck
          </button>
          <button
            className={`tab-btn ${activeTab === "bots" ? "active" : ""}`}
            onClick={() => setActiveTab("bots")}
          >
            🤖 Bot
          </button>
        </div>

        {/* Tab: Card Selection */}
        {activeTab === "cards" && (
          <div className="tab-content tab-cards">
            {/* Quick actions */}
            <div className="cards-quick-actions">
              <button className="btn-secondary" onClick={handleFillBotsWithDefault}>
                🤖 Fill bots với default
              </button>
              <button className="btn-secondary" onClick={handleClearBots}>
                🗑️ Xóa bài bot
              </button>
            </div>

            {/* Host/User card selection - always visible and prominent */}
            <div className="member-card-section host-section user-section">
              <div className="section-header">
                <span className="section-name">
                  👑 {session?.playerName || "Bạn"}
                </span>
                <span className="section-count">{memberHandCounts[session?.playerId] || 0} lá</span>
              </div>
              <div className="section-cards">
                {Object.entries(CARD_CATALOG).map(([key, card]) => (
                  <div key={key} className="mini-card-selector" style={{ borderColor: card.color }}>
                    <span className="mini-icon">{card.icon}</span>
                    <span className="mini-name">{card.name}</span>
                    <div className="mini-controls">
                      <button
                        className="btn-count-sm"
                        onClick={() => handleCardCountChange(session?.playerId, key, -1)}
                        disabled={(memberHands[session?.playerId]?.[key] || 0) <= 0}
                      >−</button>
                      <span className="mini-count">{memberHands[session?.playerId]?.[key] || 0}</span>
                      <button
                        className="btn-count-sm"
                        onClick={() => handleCardCountChange(session?.playerId, key, 1)}
                        disabled={(memberHands[session?.playerId]?.[key] || 0) >= 10}
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bots card selection - collapsible sections */}
            <div className="bots-cards-section">
              <h3 className="bots-cards-title">🤖 Bài của Bots</h3>
              {room?.members?.filter((m) => m.isBot).map((m) => (
                <div key={m.id} className="member-card-section bot-section">
                  <div className="section-header">
                    <span className="section-name">{m.name}</span>
                    <span className="section-count">{memberHandCounts[m.id] || 0} lá</span>
                  </div>
                  <div className="section-cards">
                    {Object.entries(CARD_CATALOG).map(([key, card]) => (
                      <div key={key} className="mini-card-selector" style={{ borderColor: card.color }}>
                        <span className="mini-icon">{card.icon}</span>
                        <span className="mini-name">{card.name}</span>
                        <div className="mini-controls">
                          <button
                            className="btn-count-sm"
                            onClick={() => handleCardCountChange(m.id, key, -1)}
                            disabled={(memberHands[m.id]?.[key] || 0) <= 0}
                          >−</button>
                          <span className="mini-count">{memberHands[m.id]?.[key] || 0}</span>
                          <button
                            className="btn-count-sm"
                            onClick={() => handleCardCountChange(m.id, key, 1)}
                            disabled={(memberHands[m.id]?.[key] || 0) >= 10}
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Deck Builder */}
        {activeTab === "deck" && (
          <div className="tab-content tab-deck">
            <div className="deck-actions">
              <button className="btn-secondary" onClick={handleAutoShuffleDeck}>
                🔀 Auto shuffle deck
              </button>
              <button className="btn-secondary" onClick={handleClearDeck}>
                🗑️ Clear deck
              </button>
            </div>
            <p className="deck-hint">
              Ấn vào lá để chọn bài. {deckSlots.filter(Boolean).length}/{DECK_SIZE} lá đã chọn.
              {isDeckValid && " Deck tùy chỉnh sẽ được dùng thay vì deck mặc định."}
            </p>

            <div className="deck-grid">
              {deckSlots.map((cardKey, index) => (
                <button
                  key={index}
                  className={`deck-slot ${cardKey ? "filled" : "empty"}`}
                  onClick={() => handleDeckSlotClick(index)}
                  title={`Vị trí ${index + 1}${cardKey ? `: ${CARD_CATALOG[cardKey]?.name || cardKey}` : ""}`}
                >
                  {cardKey ? (
                    <div className="deck-card-front" style={{ borderColor: CARD_CATALOG[cardKey]?.color || "#888" }}>
                      <span className="deck-card-icon">{CARD_CATALOG[cardKey]?.icon}</span>
                      <span className="deck-card-name">{CARD_CATALOG[cardKey]?.name}</span>
                    </div>
                  ) : (
                    <div className="deck-card-back">
                      <span className="slot-number">{index + 1}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Bot Settings */}
        {activeTab === "bots" && (
          <div className="tab-content tab-bots">
            <div className="bot-global-actions">
              <button
                className={`btn-secondary ${drawOnlyAll ? "active" : ""}`}
                onClick={handleToggleDrawOnlyAll}
              >
                ⚡ Tất cả Draw
              </button>
              <button
                className={`btn-secondary ${playCardsAll ? "active" : ""}`}
                onClick={handleTogglePlayCardsAll}
              >
                🎴 Tất cả đánh bài
              </button>
            </div>
            <p className="bots-hint">
              <strong>⚡ Draw:</strong> Bot bốc bài, rút bom → cứu (nếu có) rồi chết. Không đánh lá chức năng.
              <br />
              <strong>🎴 Đánh:</strong> Bot bốc + đánh Attack, Skip, Favor...
              <br />
              <strong>🎯 Chỉ đánh:</strong> Bot bốc trước, rồi CHỈ đánh đúng 1 lá bạn chỉ định (nếu có trong tay).
              <br />
              <strong>⏸️ Skip:</strong> Bot không làm gì (chờ người điều khiển).
            </p>

            {room?.members?.filter((m) => m.isBot).map((m) => {
              const settings = botSettings[m.id] || { mode: "skip", card: null, cards: [] };
              const designated = settings.card;
              return (
                <div key={m.id} className="bot-setting-row">
                  <span className="bot-setting-name">{m.name}</span>
                  <div className="bot-mode-btns">
                    <button
                      className={`mode-btn ${settings.mode === "draw-only" ? "active" : ""}`}
                      onClick={() => handleBotModeChange(m.id, "draw-only")}
                      title="Chỉ bốc bài, rút bom thì cứu rồi chết"
                    >
                      ⚡ Draw
                    </button>
                    <button
                      className={`mode-btn ${settings.mode === "play-cards" ? "active" : ""}`}
                      onClick={() => handleBotModeChange(m.id, "play-cards")}
                      title="Bốc bài và đánh lá chức năng"
                    >
                      🎴 Đánh
                    </button>
                    <button
                      className={`mode-btn ${settings.mode === "play-one-card" ? "active" : ""}`}
                      onClick={() => {
                        handleBotModeChange(m.id, "play-one-card");
                        // Auto-open picker the first time the user picks
                        // this mode, so the UX matches "you can't start
                        // the game with no card selected" — but only if
                        // there's no card chosen yet.
                        if (!botSettings[m.id]?.card) {
                          handlePickOneCard(m.id, m.name);
                        }
                      }}
                      title="Bốc trước, sau đó đánh đúng 1 lá bạn chỉ định"
                    >
                      🎯 Chỉ đánh
                    </button>
                    <button
                      className={`mode-btn ${settings.mode === "skip" ? "active" : ""}`}
                      onClick={() => handleBotModeChange(m.id, "skip")}
                      title="Không làm gì, chờ người điều khiển"
                    >
                      ⏸️ Skip
                    </button>
                  </div>
                  {/* Card picker for play-one-card mode. Rendered as an
                      inline chip so the user can see at a glance which
                      card each bot will play. Clicking the chip re-opens
                      the picker; the "✕" clears the pick (and falls back
                      to draw-only behavior at start time). */}
                  {settings.mode === "play-one-card" && (
                    <div className="one-card-picker-row">
                      {designated ? (
                        <button
                          type="button"
                          className="one-card-chip"
                          style={{ borderColor: CARD_CATALOG[designated]?.color || "#888" }}
                          onClick={() => handlePickOneCard(m.id, m.name)}
                          title={`Đang chỉ định: ${CARD_CATALOG[designated]?.name || designated} (ấn để đổi)`}
                        >
                          <span className="one-card-chip-icon">{CARD_CATALOG[designated]?.icon || "?"}</span>
                          <span className="one-card-chip-name">{CARD_CATALOG[designated]?.name || designated}</span>
                          <span
                            role="button"
                            aria-label="Xóa chọn"
                            className="one-card-chip-clear"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOneCardClear(m.id);
                            }}
                          >✕</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="one-card-chip empty"
                          onClick={() => handlePickOneCard(m.id, m.name)}
                          title="Chọn lá bot sẽ đánh"
                        >
                          + Chọn lá bài
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="test-lobby__actions">
          <button className="btn-leave" onClick={handleLeave}>
            ← Thoát
          </button>
          <button
            className="btn-start"
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? "Đang bắt đầu..." : "🚀 Bắt đầu Test"}
          </button>
        </div>
      </div>

      {/* Card Picker Modal */}
      {cardPicker !== null && (
        <div className="card-picker-overlay" onClick={handleCardPickerClose}>
          <div className="card-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-picker-header">
              <h3>Chọn lá bài cho vị trí #{cardPicker.slotIndex + 1}</h3>
              <button className="btn-close" onClick={handleCardPickerClose}>✕</button>
            </div>
            <div className="card-picker-grid">
              {ALL_CARD_KEYS.map((key) => {
                const card = CARD_CATALOG[key];
                return (
                  <button
                    key={key}
                    className="picker-card"
                    style={{ borderColor: card.color }}
                    onClick={() => handleCardPickerSelect(key)}
                  >
                    <span className="picker-icon">{card.icon}</span>
                    <span className="picker-name">{card.name}</span>
                    <span className="picker-type">{card.type}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* One-Card Bot Picker Modal */}
      {oneCardPicker !== null && (
        <div className="card-picker-overlay" onClick={() => setOneCardPicker(null)}>
          <div className="card-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-picker-header">
              <h3>🤖 {oneCardPicker.memberName} sẽ đánh lá nào?</h3>
              <button className="btn-close" onClick={() => setOneCardPicker(null)}>✕</button>
            </div>
            <p className="picker-hint">
              Bot sẽ <strong>bốc 1 lá</strong> trước, rồi nếu lá này có trong tay thì đánh đúng nó. Nếu không có thì lượt kết thúc bình thường.
            </p>
            <div className="card-picker-grid">
              {ACTION_CARDS.map((key) => {
                const card = CARD_CATALOG[key];
                return (
                  <button
                    key={key}
                    className="picker-card"
                    style={{ borderColor: card.color }}
                    onClick={() => handleOneCardSelect(key)}
                  >
                    <span className="picker-icon">{card.icon}</span>
                    <span className="picker-name">{card.name}</span>
                    <span className="picker-type">{card.type}</span>
                  </button>
                );
              })}
            </div>
            <p className="picker-footnote">
              * Chỉ liệt kê lá chức năng (Action). Lá Defuse/Bom không thể "tự đánh" — Defuse dùng để cứu khi rút bom, Bom tự nổ khi rút trúng.
            </p>
          </div>
        </div>
      )}

      {/* Emergency exit button - always visible */}
      <ExitTestButton roomId={session?.roomId} style={{ position: "absolute", bottom: 20, right: 20 }} />
    </main>
  );
}
