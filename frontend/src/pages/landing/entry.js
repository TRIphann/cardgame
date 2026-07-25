// Landing page — single-step flow:
//   - Player enters their name and (optionally) a room code
//   - "Tạo phòng" → POST /api/rooms { hostName } → lobby
//   - "Vào phòng" with code → POST /api/rooms/join { code, playerName } → lobby
//   - "Vào phòng" without code → also creates a new room (acts as create)
//
// The form is structured so both the room code and the buttons are visible from
// the start. That way:
//   - If JS fails to load, the user can still see the controls without a confusing
//     "two-step" reveal collapsing away.
//   - The form has an inline `onsubmit="event.preventDefault(); return false;"`
//     as a hard guarantee it never reloads the page (default browser submit would
//     have reloaded the landing and lost the user's input).

import { saveSession, ROUTES } from "../../config/env.js";
import { roomsApi } from "../../shared/api/roomsApi.js";
import { audioManager } from "../../shared/audio/AudioManager.js";

console.log("[arcana] landing: entry.js loaded");

const form = document.querySelector("#player-form");
const nameInput = document.querySelector("#player-name");
const roomCodeInput = document.querySelector("#room-code");
const createButton = document.querySelector("#create-button");
const joinButton = document.querySelector("#join-button");
const messageEl = document.querySelector("#form-message");

if (!form || !nameInput || !createButton || !joinButton) {
  console.error("[arcana] landing: required DOM nodes missing", { form, nameInput, createButton, joinButton });
}

function showMessage(text, tone = "error") {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.dataset.tone = tone;
  messageEl.hidden = false;
}

function hideMessage() {
  if (!messageEl) return;
  messageEl.hidden = true;
  messageEl.textContent = "";
}

function shakeForm() {
  form?.classList.add("form-attention");
  setTimeout(() => form?.classList.remove("form-attention"), 450);
}

function setBusy(busy) {
  [createButton, joinButton].forEach((b) => { if (b) b.disabled = busy; });
}

function pickMember(room, action, name) {
  if (action === "create") {
    return room.members.find((m) => m.isHost) ?? room.members[0];
  }
  // For join, the last-added member is the new arrival (others were already there).
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}

async function goToFlow(action) {
  const name = nameInput.value.trim();
  if (!name) {
    showMessage("Vui lòng nhập tên trước.");
    nameInput.focus();
    shakeForm();
    return;
  }

  const code = roomCodeInput.value.trim().toUpperCase();
  // If the user typed a code, we always JOIN, regardless of which button they clicked.
  // If the code is empty, "Tạo phòng" creates, "Vào phòng" also creates (forgiving UX).
  const effectiveAction = code ? "join" : action;

  audioManager.unlock();
  audioManager.playSfx("buttonClick");
  setBusy(true);
  hideMessage();

  try {
    const room = effectiveAction === "create"
      ? await roomsApi.create(name)
      : await roomsApi.join(code, name);

    const member = pickMember(room, effectiveAction, name);
    if (!member) {
      throw new Error("Không tìm thấy thành viên trong phòng sau khi tạo/join.");
    }

    saveSession({
      roomId: room.id,
      roomCode: room.code,
      playerId: member.id,
      playerName: member.name,
      isHost: effectiveAction === "create",
      stage: "lobby",
    });

    audioManager.playSfx(effectiveAction === "create" ? "roomCodeReveal" : "playerJoin");
    console.log("[arcana] landing: room ready", { id: room.id, code: room.code, action: effectiveAction });
    window.location.href = ROUTES.lobby;
  } catch (err) {
    console.error("[arcana] landing: room flow failed", err);
    showMessage(err.message || "Có lỗi xảy ra, vui lòng thử lại.");
    audioManager.playSfx("error");
    shakeForm();
  } finally {
    setBusy(false);
  }
}

createButton?.addEventListener("click", () => goToFlow("create"));
joinButton?.addEventListener("click", () => goToFlow("join"));

// Auto-format room code to uppercase.
roomCodeInput?.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
  hideMessage();
});

nameInput?.addEventListener("input", () => {
  nameInput.setCustomValidity("");
  hideMessage();
});

// Submitting the form (Enter key) triggers the primary action — create.
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  goToFlow("create");
});

console.log("[arcana] landing: entry.js ready");
