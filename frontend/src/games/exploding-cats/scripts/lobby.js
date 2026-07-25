// Lobby controller.
//   - Validates session, redirects if missing
//   - Polls room data every 2.5s
//   - Renders up to 8 seats split 4/4
//   - Carousel of available games in the center (with < > arrows + flip animation)
//   - Settings modal: Settings tab (audio) + Members tab (host can kick members)
//   - Drives copy / leave / start interactions
//   - Wires audio manager

import { loadSession, saveSession, clearSession, ROUTES } from "../../config/env.js";
import { getRoom, roomsApi } from "../../shared/api/roomsApi.js";
import { audioManager } from "../../shared/audio/AudioManager.js";
import { SettingsModal } from "../../shared/components/SettingsModal.js";

// ---- Game catalog ----
const GAMES = [
  {
    id: "exploding-cats",
    label: "EXPLODING CATS",
    subtitle: "Đặt bài, rút bài, đừng để con mèo nổ!",
    glyph: "🐱",
    explosion: "💥",
    accent: "#ff5d8f",
  },
  {
    id: "love-letter",
    label: "LOVE LETTER",
    subtitle: "Một lá thư tình, một mưu kế — ai còn sống đến cuối?",
    glyph: "💌",
    explosion: "",
    accent: "#ff7aa1",
  },
  {
    id: "coup",
    label: "COUP",
    subtitle: "Nói dối, phản bội, giành quyền lực tối thượng.",
    glyph: "👑",
    explosion: "",
    accent: "#ffd47a",
  },
  {
    id: "uno",
    label: "UNO",
    subtitle: "Hét UNO trước khi đối thủ kịp phản đòn!",
    glyph: "🃏",
    explosion: "",
    accent: "#6f7bff",
  },
];

const MAX_SLOTS = 8;
const POLL_INTERVAL_MS = 2500;

// ---- Session guard ----
const session = loadSession();
if (!session || !session.roomId || !session.playerId) {
  window.location.replace(ROUTES.landing);
}

// ---- DOM refs ----
const inviteCodeEl = document.querySelector("#invite-code");
const copyButton = document.querySelector("#copy-button");
const seatsLeftEl = document.querySelector("#seats-left");
const seatsRightEl = document.querySelector("#seats-right");
const statusEl = document.querySelector("#status-text");
const startButton = document.querySelector("#start-button");
const settingsButton = document.querySelector("#settings-button");
const settingsMount = document.querySelector("#settings-mount");

const deckCardEl = document.querySelector("#deck-card-front");
const deckGlyphEl = document.querySelector("#deck-glyph");
const deckExplosionEl = document.querySelector("#deck-explosion");
const deckLabelEl = document.querySelector("#deck-label");
const deckSubtitleEl = document.querySelector("#deck-subtitle");
const prevBtn = document.querySelector("#game-prev");
const nextBtn = document.querySelector("#game-next");

let cachedRoom = null;
let currentGameIndex = 0;
let isFlipping = false;

// ---- Settings modal: Settings tab + Members tab ----
const settings = new SettingsModal(settingsMount, [
  {
    id: "members",
    label: "Thành viên",
    render: (mount) => renderMembersTab(mount, null),
    onAction: handleMemberAction,
  },
]);
settingsButton.addEventListener("click", () => settings.open());

// ---- Game carousel ----
function renderGame(index) {
  const game = GAMES[index];
  if (!game) return;
  deckLabelEl.textContent = game.label;
  deckSubtitleEl.textContent = game.subtitle;
  deckGlyphEl.textContent = game.glyph;
  deckExplosionEl.textContent = game.explosion;
  deckExplosionEl.style.display = game.explosion ? "inline" : "none";
  document.documentElement.style.setProperty("--c-accent", game.accent);
}

function flipToGame(newIndex) {
  if (isFlipping || newIndex === currentGameIndex) return;
  isFlipping = true;
  deckCardEl.classList.add("is-flipping");
  audioManager.playSfx("buttonClick");

  setTimeout(() => {
    currentGameIndex = newIndex;
    renderGame(currentGameIndex);
    deckCardEl.classList.remove("is-flipping");
    isFlipping = false;
  }, 250);
}

prevBtn.addEventListener("click", () => {
  const next = (currentGameIndex - 1 + GAMES.length) % GAMES.length;
  flipToGame(next);
});
nextBtn.addEventListener("click", () => {
  const next = (currentGameIndex + 1) % GAMES.length;
  flipToGame(next);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") prevBtn.click();
  if (e.key === "ArrowRight") nextBtn.click();
  if (e.key === "Escape") settings.close();
});

// initial render
renderGame(currentGameIndex);

// ---- Audio unlock ----
const armMusic = () => {
  audioManager.unlock();
  audioManager.startMusic();
  document.removeEventListener("pointerdown", armMusic);
  document.removeEventListener("keydown", armMusic);
};
document.addEventListener("pointerdown", armMusic, { once: true });
document.addEventListener("keydown", armMusic, { once: true });

// ---- Buttons ----
copyButton.addEventListener("click", async () => {
  if (!cachedRoom) return;
  audioManager.unlock();
  try {
    await navigator.clipboard.writeText(cachedRoom.code);
    copyButton.textContent = "Đã sao chép ✓";
    audioManager.playSfx("roomCodeReveal");
    setTimeout(() => (copyButton.textContent = "Sao chép"), 1600);
  } catch {
    copyButton.textContent = "Không thể sao chép";
  }
});

startButton.addEventListener("click", () => {
  if (startButton.disabled) return;
  audioManager.unlock();
  audioManager.playSfx("buttonClick");
  saveSession({ ...session, stage: "playing" });
  statusEl.textContent = `Game đã chọn: ${GAMES[currentGameIndex].label} — sắp sẵn sàng!`;
});

// ---- Seats ----
function renderSeats(members, currentPlayerId) {
  seatsLeftEl.innerHTML = "";
  seatsRightEl.innerHTML = "";

  const slots = [];
  for (let i = 0; i < MAX_SLOTS; i += 1) slots.push(members[i] ?? null);

  const leftSlots = slots.slice(0, 4);
  const rightSlots = slots.slice(4, 8);

  leftSlots.forEach((member, idx) => seatsLeftEl.appendChild(buildSeat(member, idx, currentPlayerId)));
  rightSlots.forEach((member, idx) => seatsRightEl.appendChild(buildSeat(member, idx + 4, currentPlayerId)));
}

function buildSeat(member, index, currentPlayerId) {
  const seat = document.createElement("article");
  seat.className = "seat seat-empty";
  seat.style.animationDelay = `${index * 80}ms`;

  if (member) {
    const isMe = member.id === currentPlayerId;
    seat.classList.remove("seat-empty");
    seat.classList.add("is-filled");
    if (member.isHost) seat.classList.add("is-host");
    if (isMe) seat.classList.add("is-me");

    seat.innerHTML = `
      <div class="seat-avatar">${member.avatar ?? "🐱"}</div>
      <div class="seat-info">
        <p class="seat-name">${escapeHtml(member.name)}${isMe ? ` <span style="opacity:.6">(bạn)</span>` : ""}</p>
        <p class="seat-tag">${member.isHost ? "Chủ phòng" : "Đã vào"}</p>
      </div>
      ${member.isHost ? '<span class="seat-host-crown">♛</span>' : ""}
    `;
  } else {
    seat.innerHTML = `
      <div class="seat-avatar">+</div>
      <div class="seat-info">
        <p class="seat-name" style="color: var(--c-text-faint); font-weight: 400;">Đang chờ...</p>
        <p class="seat-tag">—</p>
      </div>
    `;
  }

  return seat;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Members tab ----
function renderMembersTab(mount) {
  return renderMembersInto(mount);
}

function renderMembersInto(mount) {
  if (!cachedRoom) {
    mount.innerHTML = `<p class="settings-hint">Đang tải danh sách thành viên…</p>`;
    return;
  }
  const me = cachedRoom.members?.find((m) => m.id === session.playerId);
  const isHost = me?.isHost === true;
  const members = [...(cachedRoom.members || [])].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

  const rows = members.map((m) => {
    const classes = ["member-row"];
    if (m.isHost) classes.push("is-host");
    if (m.id === session.playerId) classes.push("is-me");
    const tag = m.isHost ? "Chủ phòng" : "Thành viên";
    const kickBtn = isHost && !m.isHost
      ? `<button class="kick-button" type="button" data-action="kick" data-member-id="${escapeHtml(m.id)}" title="Đá ${escapeHtml(m.name)} ra khỏi phòng">⤴</button>`
      : `<span style="width: 32px"></span>`;
    return `
      <div class="${classes.join(" ")}">
        <div class="member-avatar">${m.avatar ?? "🐱"}</div>
        <div class="member-info">
          <p class="member-name">${escapeHtml(m.name)}${m.id === session.playerId ? ` <span style="opacity:.6">(bạn)</span>` : ""}</p>
          <p class="member-tag">${tag}</p>
        </div>
        ${kickBtn}
      </div>
    `;
  }).join("");

  mount.innerHTML = `
    <div class="settings-group">
      <label class="settings-label">${members.length}/${cachedRoom.maxPlayers} người — mã phòng ${escapeHtml(cachedRoom.code)}</label>
      <div class="members-list">${rows || `<p class="settings-hint">Chưa có ai trong phòng.</p>`}</div>
      ${isHost ? `<p class="settings-hint">Bạn là chủ phòng — bấm ⤴ để đá thành viên ra khỏi lobby.</p>` : ""}
    </div>
  `;
}

async function handleMemberAction(action, payload) {
  if (action !== "kick") return;
  const targetId = payload?.memberId;
  if (!targetId) return;
  const me = cachedRoom?.members?.find((m) => m.id === session.playerId);
  if (!me?.isHost) {
    showToast("Chỉ chủ phòng mới có thể đá thành viên.", "error");
    return;
  }
  if (targetId === me.id) return;

  audioManager.unlock();
  audioManager.playSfx("buttonClick");

  try {
    const resp = await roomsApi.kick(session.roomId, me.id, targetId);
    cachedRoom = resp.room;
    settings.refresh();
    await refreshRoom();
  } catch (err) {
    audioManager.playSfx("error");
    showToast(err.message || "Không thể đá thành viên.", "error");
  }
}

// ---- Toast (transient notification inside the lobby) ----
let toastTimer = null;
function showToast(text, tone = "info") {
  let el = document.querySelector("#lobby-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "lobby-toast";
    el.className = "lobby-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.dataset.tone = tone;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => (el.hidden = true), 280);
  }, 2400);
}

// ---- Poll room ----
async function refreshRoom() {
  if (!session?.roomId) return;
  try {
    const room = await getRoom(session.roomId);
    cachedRoom = room;

    if (inviteCodeEl.textContent !== room.code) {
      inviteCodeEl.textContent = room.code;
      audioManager.unlock();
    }

    renderSeats(room.members || [], session.playerId);

    // If I'm no longer in the room (was kicked), bounce back to landing.
    if (!room.members?.some((m) => m.id === session.playerId)) {
      clearSession();
      window.location.replace(ROUTES.landing);
      return;
    }

    const count = room.members?.length ?? 0;
    const remaining = room.maxPlayers - count;
    statusEl.textContent = remaining > 0
      ? `Đã có ${count}/${room.maxPlayers} người — còn ${remaining} ô trống`
      : `Phòng đã đủ ${room.maxPlayers} người — sẵn sàng bắt đầu!`;

    const me = room.members?.find((m) => m.id === session.playerId);
    const canStart = me?.isHost && count >= 2;
    startButton.disabled = !canStart;
  } catch (err) {
    statusEl.textContent = `Mất kết nối: ${err.message}`;
  }
}

document.querySelector(".back-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  audioManager.playSfx("playerLeave");
  setTimeout(() => {
    clearSession();
    window.location.href = ROUTES.landing;
  }, 180);
});

refreshRoom();
setInterval(refreshRoom, POLL_INTERVAL_MS);
