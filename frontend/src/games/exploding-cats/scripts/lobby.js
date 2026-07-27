// Lobby controller.
//   - Validates session, redirects if missing
//   - Polls room data every 2.5s
//   - Renders up to 8 seats split 4/4
//   - Deck animation: idle wiggle → 4 cards fly out → flip reveal → return
//   - Settings modal: Members tab (host can kick members)
//   - Drives copy / leave / start interactions

import { loadSession, saveSession, clearSession, ROUTES } from "../../config/env.js";
import { getRoom, roomsApi, prewarmBackend } from "../../shared/api/roomsApi.js";
import { audioManager } from "../../shared/audio/AudioManager.js";
import { toast } from "../../shared/ui/toast.js";
import { SettingsModal } from "../../shared/components/SettingsModal.js";
import { CARD_CLOUDINARY } from "../../games/exploding-cats/cardCloudinary.js";

// ---- Game catalog ----
const GAMES = [
  {
    id: "exploding-cats",
    label: "EXPLODING CATS",
    subtitle: "Đặt bài, rút bài, đừng để con mèo nổ!",
    accent: "#ff5d8f",
  },
  {
    id: "love-letter",
    label: "LOVE LETTER",
    subtitle: "Một lá thư tình, một mưu kế — ai còn sống đến cuối?",
    accent: "#ff7aa1",
  },
  {
    id: "coup",
    label: "COUP",
    subtitle: "Nói dối, phản bội, giành quyền lực tối thượng.",
    accent: "#ffd47a",
  },
  {
    id: "uno",
    label: "UNO",
    subtitle: "Hét UNO trước khi đối thủ kịp phản đòn!",
    accent: "#6f7bff",
  },
];

const MAX_SLOTS = 8;
const POLL_INTERVAL_MS = 2500;

// Animation timing (ms)
const ANIM = {
  WIGGLE_1_DELAY: 5000,      // First gentle wiggle after 5s
  WIGGLE_2_DELAY: 4000,      // Second stronger wiggle after 4s more
  WIGGLE_3_DELAY: 2000,      // Third intense wiggle after 2s more
  FLY_OUT_DURATION: 600,
  ORBIT_DURATION: 4000,      // Total orbit time
  FLIP_DURATION: 600,
  FLY_BACK_DURATION: 500,
  BETWEEN_FLIPS: 800,        // Time between each card flip
};

// Get all card URLs for random selection
const CARD_URLS = Object.values(CARD_CLOUDINARY.cards);

// ---- Session guard ----
const session = loadSession();
if (!session || !session.roomId || !session.playerId) {
  window.location.replace(ROUTES.landing);
}

prewarmBackend();

// ---- DOM refs ----
const inviteCodeEl = document.querySelector("#invite-code");
const codeVisibilityBtn = document.querySelector("#code-visibility");
const codeHiddenDots = "••••••";
const copyButton = document.querySelector("#copy-button");
const seatsLeftEl = document.querySelector("#seats-left");
const seatsRightEl = document.querySelector("#seats-right");
const statusEl = document.querySelector("#status-text");
const startButton = document.querySelector("#start-button");
const settingsButton = document.querySelector("#settings-button");
const settingsMount = document.querySelector("#settings-mount");

const deckPile = document.querySelector("#deck-pile");
const flyingCardsContainer = document.querySelector("#flying-cards");
const flyingCards = document.querySelectorAll(".flying-card");
const deckLabelEl = document.querySelector("#deck-label");
const deckSubtitleEl = document.querySelector("#deck-subtitle");
const prevBtn = document.querySelector("#game-prev");
const nextBtn = document.querySelector("#game-next");

let cachedRoom = null;
let currentGameIndex = 0;
let codeVisible = true;

// Animation state
let animationPhase = 0; // 0: idle, 1: wiggle1, 2: wiggle2, 3: wiggle3, 4: flying
let animationTimer = null;
let isAnimating = false;

// ---- Settings modal ----
const settings = new SettingsModal(settingsMount, [
  {
    id: "members",
    label: "Thành viên",
    render: () => renderMembersTab(),
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
  document.documentElement.style.setProperty("--c-accent", game.accent);
  document.documentElement.style.setProperty("--c-accent-glow", hexToGlow(game.accent));
}

function hexToGlow(hex) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "rgba(159, 113, 241, 0.55)";
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, 0.55)`;
}

prevBtn.addEventListener("click", () => {
  const next = (currentGameIndex - 1 + GAMES.length) % GAMES.length;
  currentGameIndex = next;
  renderGame(currentGameIndex);
  audioManager.playSfx("buttonClick");
});

nextBtn.addEventListener("click", () => {
  const next = (currentGameIndex + 1) % GAMES.length;
  currentGameIndex = next;
  renderGame(currentGameIndex);
  audioManager.playSfx("buttonClick");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") prevBtn.click();
  if (e.key === "ArrowRight") nextBtn.click();
  if (e.key === "Escape") settings.close();
});

renderGame(currentGameIndex);

// ---- Card Back Pattern Generation ----
function generatePattern(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = "";
  const sizes = [10, 12, 14, 16, 18, 20];
  
  for (let i = 0; i < 15; i++) {
    const span = document.createElement("span");
    span.className = "qmark";
    span.textContent = "?";
    span.style.fontSize = sizes[Math.floor(Math.random() * sizes.length)] + "px";
    span.style.opacity = 0.1 + Math.random() * 0.2;
    container.appendChild(span);
  }
}

// Generate patterns for all card backs
for (let i = 0; i < 4; i++) {
  generatePattern(`pattern-${i}`);
}

// ---- Deck Animation System ----
function startIdleAnimation() {
  stopAnimation();
  animationPhase = 0;
  
  // Phase 1: Gentle wiggle after 5s
  animationTimer = setTimeout(() => {
    if (animationPhase === 0) {
      triggerWiggle(1);
    }
  }, ANIM.WIGGLE_1_DELAY);
}

function triggerWiggle(level) {
  animationPhase = level;
  
  // Remove all wiggle classes
  deckPile.classList.remove("idle", "wiggle-1", "wiggle-2", "wiggle-3");
  
  // Force reflow
  void deckPile.offsetWidth;
  
  // Add appropriate wiggle class
  deckPile.classList.add(`wiggle-${level}`);
  
  const wiggleDuration = level === 3 ? 1000 : 800;
  
  animationTimer = setTimeout(() => {
    deckPile.classList.remove(`wiggle-${level}`);
    
    if (level === 1) {
      // Phase 2: Stronger wiggle after 4s
      animationTimer = setTimeout(() => {
        if (animationPhase === 1) triggerWiggle(2);
      }, ANIM.WIGGLE_2_DELAY);
    } else if (level === 2) {
      // Phase 3: Intense wiggle then start flying animation
      animationTimer = setTimeout(() => {
        if (animationPhase === 2) {
          triggerWiggle(3);
        }
      }, ANIM.WIGGLE_3_DELAY);
    } else if (level === 3) {
      // Start the flying cards animation
      startFlyingAnimation();
    }
  }, wiggleDuration);
}

function startFlyingAnimation() {
  if (isAnimating) return;
  isAnimating = true;
  animationPhase = 4;
  
  // Hide deck pile, show flying cards
  deckPile.style.display = "none";
  flyingCardsContainer.style.display = "block";
  
  // Pick random cards for each flying card
  const cardImgs = flyingCardsContainer.querySelectorAll(".card-img");
  cardImgs.forEach((img) => {
    const randomUrl = CARD_URLS[Math.floor(Math.random() * CARD_URLS.length)];
    img.src = randomUrl;
  });
  
  // Step 1: Fly out
  flyingCards.forEach((card) => {
    card.classList.remove("fly-out", "orbit", "flip", "fly-back", "revealed");
    void card.offsetWidth;
    card.classList.add("fly-out");
  });
  
  // Step 2: After fly out, start orbiting
  setTimeout(() => {
    flyingCards.forEach((card) => {
      card.classList.remove("fly-out");
      card.classList.add("orbit");
    });
    
    // Step 3: Flip cards one by one while orbiting
    let flipIndex = 0;
    const flipInterval = setInterval(() => {
      if (flipIndex < 4) {
        const card = flyingCards[flipIndex];
        card.classList.remove("orbit");
        card.classList.add("flip");
        
        // After flip, check if it's the card facing front (we'll pick one)
        if (flipIndex === 0) { // First card to flip becomes the "revealed" one
          setTimeout(() => {
            card.classList.add("revealed");
          }, ANIM.FLIP_DURATION);
        }
        
        flipIndex++;
      } else {
        clearInterval(flipInterval);
        
        // Step 4: Show all cards revealed for a moment
        setTimeout(() => {
          // Step 5: Fly back to deck
          flyingCards.forEach((card) => {
            card.classList.remove("flip", "revealed");
            void card.offsetWidth;
            card.classList.add("fly-back");
          });
          
          // Step 6: Reset
          setTimeout(() => {
            flyingCardsContainer.style.display = "none";
            flyingCards.forEach((card) => {
              card.classList.remove("fly-back");
            });
            deckPile.style.display = "";
            deckPile.classList.add("idle");
            isAnimating = false;
            
            // Restart the cycle
            startIdleAnimation();
          }, ANIM.FLY_BACK_DURATION);
        }, 2000); // Show revealed cards for 2s
      }
    }, ANIM.BETWEEN_FLIPS);
  }, ANIM.FLY_OUT_DURATION + 300);
}

function stopAnimation() {
  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = null;
  }
}

// Start the animation on load
startIdleAnimation();

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
codeVisibilityBtn?.addEventListener("click", () => {
  codeVisible = !codeVisible;
  codeVisibilityBtn.setAttribute("aria-pressed", String(codeVisible));
  const eyeIcon = codeVisibilityBtn.querySelector(".eye-icon");
  eyeIcon?.setAttribute("data-state", codeVisible ? "visible" : "hidden");
  
  if (!codeVisibilityBtn.dataset.realCode) {
    codeVisibilityBtn.dataset.realCode = inviteCodeEl.textContent;
  }
  const realCode = codeVisibilityBtn.dataset.realCode || "------";
  
  if (codeVisible) {
    inviteCodeEl.textContent = realCode;
    inviteCodeEl.classList.remove("is-hidden");
  } else {
    inviteCodeEl.textContent = codeHiddenDots;
    inviteCodeEl.classList.add("is-hidden");
  }
  audioManager.unlock();
  audioManager.playSfx("buttonClick");
});

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through */ }
  
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

copyButton.addEventListener("click", async () => {
  if (!cachedRoom) return;
  const realCode = codeVisibilityBtn?.dataset.realCode || inviteCodeEl.textContent;
  const ok = await copyToClipboard(realCode);
  audioManager.unlock();
  if (ok) {
    copyButton.classList.add("is-copied");
    const labelEl = copyButton.querySelector(".copy-button__label");
    if (labelEl) labelEl.textContent = "Đã sao chép";
    audioManager.playSfx("roomCodeReveal");
    toast.success(`Đã sao chép mã phòng ${realCode}`, { title: "Sao chép", duration: 1800 });
    setTimeout(() => {
      copyButton.classList.remove("is-copied");
      if (labelEl) labelEl.textContent = "Sao chép";
    }, 1600);
  } else {
    copyButton.classList.add("is-error");
    audioManager.playSfx("error");
    toast.error("Không thể sao chép tự động.", { title: "Sao chép thất bại" });
    setTimeout(() => copyButton.classList.remove("is-error"), 1600);
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
function renderMembersTab() {
  if (!cachedRoom) {
    return `<p class="settings-hint">Đang tải danh sách thành viên…</p>`;
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

  return `
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

// ---- Toast ----
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

    if (inviteCodeEl.textContent !== room.code && (codeVisible || inviteCodeEl.textContent === "------")) {
      inviteCodeEl.textContent = room.code;
      inviteCodeEl.classList.remove("is-hidden");
      if (codeVisibilityBtn) codeVisibilityBtn.dataset.realCode = room.code;
      audioManager.unlock();
    } else if (codeVisibilityBtn) {
      codeVisibilityBtn.dataset.realCode = room.code;
    }

    renderSeats(room.members || [], session.playerId);

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
  stopAnimation();
  audioManager.playSfx("playerLeave");
  setTimeout(() => {
    clearSession();
    window.location.href = ROUTES.landing;
  }, 180);
});

refreshRoom();
setInterval(refreshRoom, POLL_INTERVAL_MS);
