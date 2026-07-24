import { loadSession, saveSession, ROUTES } from "../../config/env.js";
import { getRoom } from "../../scripts/network/rooms.js";

const session = loadSession();
if (!session || !session.roomId || !session.playerId) {
  window.location.replace(ROUTES.landing);
}

const MAX_SLOTS = 8;
const POLL_INTERVAL_MS = 2500;

const inviteCodeEl = document.querySelector("#invite-code");
const copyButton = document.querySelector("#copy-button");
const slotsGridEl = document.querySelector("#slots-grid");
const statusEl = document.querySelector("#status-text");
const startButton = document.querySelector("#start-button");

let cachedRoom = null;

function renderSlots(members) {
  slotsGridEl.innerHTML = "";
  const sorted = [...members].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  for (let i = 0; i < MAX_SLOTS; i += 1) {
    const member = sorted[i];
    const slot = document.createElement("article");
    slot.className = "slot" + (member ? " is-filled" : " is-empty");
    slot.innerHTML = member
      ? `<span class="slot-glyph">${member.isHost ? "♛" : "♙"}</span><span class="slot-name">${escapeHtml(member.name)}</span><span class="slot-tag">${member.isHost ? "Chủ phòng" : "Đã vào"}</span>`
      : `<span class="slot-glyph">+</span><span class="slot-name">Đang chờ...</span><span class="slot-tag">Ô trống</span>`;
    slotsGridEl.appendChild(slot);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refreshRoom() {
  try {
    const room = await getRoom(session.roomId);
    cachedRoom = room;
    inviteCodeEl.textContent = room.code;
    renderSlots(room.members || []);
    const remaining = room.maxPlayers - (room.members?.length ?? 0);
    statusEl.textContent = remaining > 0
      ? `Đã có ${room.members?.length ?? 0}/${room.maxPlayers} người — còn ${remaining} ô trống`
      : `Phòng đã đủ ${room.maxPlayers} người — sẵn sàng bắt đầu!`;

    const me = room.members?.find((m) => m.id === session.playerId);
    const canStart = me?.isHost && (room.members?.length ?? 0) >= 2;
    startButton.disabled = !canStart;
  } catch (err) {
    statusEl.textContent = `Mất kết nối: ${err.message}`;
  }
}

copyButton.addEventListener("click", async () => {
  if (!cachedRoom) return;
  try {
    await navigator.clipboard.writeText(cachedRoom.code);
    copyButton.textContent = "Đã sao chép ✓";
    setTimeout(() => (copyButton.textContent = "Sao chép"), 1600);
  } catch {
    copyButton.textContent = "Không thể sao chép";
  }
});

startButton.addEventListener("click", () => {
  if (startButton.disabled) return;
  saveSession({ ...session, stage: "playing" });
  window.location.href = ROUTES.room;
});

refreshRoom();
setInterval(refreshRoom, POLL_INTERVAL_MS);
