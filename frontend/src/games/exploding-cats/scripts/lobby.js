// Lobby controller for Exploding Cats.
// Responsibilities:
//   - Validate session, redirect if missing
//   - Mount SettingsModal + handle settings toggle
//   - Render up to 8 seats split 4/4 (or balanced if fewer players)
//   - Poll room data every 2.5s (kept from previous version)
//   - Drive the particle background canvas
//   - Handle copy / leave / start interactions
//   - Wire AudioManager + play SFX on every meaningful action

import { loadSession, saveSession, clearSession, ROUTES } from "../../../config/env.js";
import { getRoom } from "../../../shared/api/roomsApi.js";
import { audioManager } from "../../../shared/audio/AudioManager.js";
import { SettingsModal } from "../../../shared/components/SettingsModal.js";
import { t } from "../../../shared/i18n/i18n.js";

const MAX_SLOTS = 8;
const POLL_INTERVAL_MS = 2500;

// ----- session guard -----
const session = loadSession();
if (!session || !session.roomId || !session.playerId) {
  window.location.replace(ROUTES.landing);
}

// ----- DOM refs -----
const inviteCodeEl = document.querySelector("#invite-code");
const copyButton = document.querySelector("#copy-button");
const seatsLeftEl = document.querySelector("#seats-left");
const seatsRightEl = document.querySelector("#seats-right");
const statusEl = document.querySelector("#status-text");
const startButton = document.querySelector("#start-button");
const leaveButton = document.querySelector("#leave-button");
const settingsButton = document.querySelector("#settings-button");
const settingsMount = document.querySelector("#settings-mount");
const toastEl = document.querySelector("#toast");

let cachedRoom = null;

// ----- mount settings -----
const settings = new SettingsModal(settingsMount);

// ----- wire corner buttons -----
settingsButton.addEventListener("click", () => {
  settings.open();
});

leaveButton.addEventListener("click", () => {
  audioManager.unlock();
  audioManager.playSfx("playerLeave");
  setTimeout(() => {
    clearSession();
    window.location.href = ROUTES.landing;
  }, 180);
});

// ----- apply i18n to static text -----
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

// ----- toast helper -----
let toastTimer = null;
function showToast(text, tone = "info") {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.dataset.tone = tone;
  toastEl.hidden = false;
  // force reflow then add class
  void toastEl.offsetWidth;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("is-visible");
    setTimeout(() => (toastEl.hidden = true), 280);
  }, 2200);
}

// ----- copy invite code -----
copyButton.addEventListener("click", async () => {
  if (!cachedRoom) return;
  audioManager.unlock();
  try {
    await navigator.clipboard.writeText(cachedRoom.code);
    copyButton.textContent = t("lobby.copied");
    audioManager.playSfx("roomCodeReveal");
    setTimeout(() => (copyButton.textContent = t("lobby.copy")), 1500);
  } catch {
    showToast(t("error.copy"), "error");
  }
});

// ----- start button -----
startButton.addEventListener("click", () => {
  if (startButton.disabled) return;
  audioManager.unlock();
  audioManager.playSfx("buttonClick");
  saveSession({ ...session, stage: "playing" });
  // Future: route to in-game page once it's built.
  showToast(t("lobby.waiting"));
});

// ----- render seats -----
// Strategy: split members into left/right halves; if members < 4 on one side,
// center remaining slots vertically (justify-content: space-around handles it).
function renderSeats(members, currentPlayerId) {
  seatsLeftEl.innerHTML = "";
  seatsRightEl.innerHTML = "";

  // Fill empty slots up to MAX_SLOTS, with member or null
  const slots = [];
  for (let i = 0; i < MAX_SLOTS; i += 1) {
    slots.push(members[i] ?? null);
  }

  // 4 left, 4 right
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
        <p class="seat-name">${escapeHtml(member.name)}${isMe ? ` <span style="opacity:.6">(${t("lobby.you")})</span>` : ""}</p>
        <p class="seat-tag">${member.isHost ? t("lobby.host") : t("lobby.ready")}</p>
      </div>
      ${member.isHost ? '<span class="seat-host-crown">♛</span>' : ""}
    `;
  } else {
    seat.innerHTML = `
      <div class="seat-avatar">+</div>
      <div class="seat-info">
        <p class="seat-name" style="color: var(--c-text-faint); font-weight: 400;">${t("lobby.emptySlot")}</p>
        <p class="seat-tag">—</p>
      </div>
    `;
  }

  return seat;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ----- poll room -----
async function refreshRoom() {
  if (!session?.roomId) return;
  try {
    const room = await getRoom(session.roomId);
    cachedRoom = room;

    if (inviteCodeEl.textContent !== room.code) {
      inviteCodeEl.textContent = room.code;
      // small flourish — first reveal
      audioManager.unlock();
    }

    renderSeats(room.members || [], session.playerId);

    const count = room.members?.length ?? 0;
    statusEl.textContent = t("lobby.playerCount", { count });

    const me = room.members?.find((m) => m.id === session.playerId);
    const canStart = me?.isHost && count >= 2;
    startButton.disabled = !canStart;
  } catch (err) {
    statusEl.textContent = `Lỗi: ${err.message}`;
  }
}

// ----- particle background -----
function startParticles() {
  const canvas = document.querySelector(".bg-particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, particles;
  const PARTICLE_COUNT = 60;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth = window.innerWidth;
    h = canvas.clientHeight = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
  };

  const seed = () => {
    particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      hue: Math.random() < 0.5 ? 340 : 45, // pink or gold
      a: Math.random() * 0.5 + 0.2,
    }));
  };

  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.a})`;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.fill();
    });
    requestAnimationFrame(tick);
  };

  resize();
  seed();
  tick();
  window.addEventListener("resize", () => { resize(); seed(); });
}

// ----- bootstrap -----
applyI18n();
refreshRoom();
setInterval(refreshRoom, POLL_INTERVAL_MS);
startParticles();

// Try to start music once user has interacted at least once.
const armMusic = () => {
  audioManager.unlock();
  audioManager.startMusic();
  document.removeEventListener("pointerdown", armMusic);
  document.removeEventListener("keydown", armMusic);
};
document.addEventListener("pointerdown", armMusic, { once: true });
document.addEventListener("keydown", armMusic, { once: true });

// ----- keyboard shortcuts -----
document.addEventListener("keydown", (e) => {
  if (e.key === "c" && !e.metaKey && !e.ctrlKey) copyButton.click();
  if (e.key === "Escape") settings.close();
});
