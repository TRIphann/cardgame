// Landing page — two-step flow:
//   1. Player types a name and clicks "Vào đấu trường" — locks the name + reveals the rest
//   2. Player either creates a room (becomes host) or joins with a code (optional input)

import { saveSession, ROUTES } from "../../config/env.js";
import { roomsApi } from "../../shared/api/roomsApi.js";
import { audioManager } from "../../shared/audio/AudioManager.js";

const form = document.querySelector("#player-form");
const nameInput = document.querySelector("#player-name");
const roomCodeInput = document.querySelector("#room-code");
const enterButton = document.querySelector("#enter-button");
const roomActions = document.querySelector("#room-actions");
const actionButtons = document.querySelectorAll("[data-action]");
const messageEl = document.querySelector("#form-message");

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

function pickMember(room, action, name) {
  if (action === "create") {
    return room.members.find((m) => m.isHost) ?? room.members[0];
  }
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}

// Step 1 — commit the name and reveal the create/join block.
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    nameInput.reportValidity();
    shakeForm();
    return;
  }

  audioManager.unlock();
  audioManager.playSfx("buttonClick");

  // Lock the name input and reveal the room actions
  nameInput.setAttribute("readonly", "readonly");
  nameInput.style.opacity = "0.75";
  enterButton.hidden = true;
  roomActions.hidden = false;
  // Focus the room code field for quick keyboard entry
  setTimeout(() => roomCodeInput.focus(), 200);
});

// Step 2 — create or join.
actionButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      // Player tried to skip step 1; shake and bail
      showMessage("Vui lòng nhập tên trước.");
      shakeForm();
      return;
    }
    const code = roomCodeInput.value.trim().toUpperCase();
    const action = code ? "join" : button.dataset.action;
    audioManager.unlock();
    actionButtons.forEach((b) => (b.disabled = true));

    try {
      const room = action === "create"
        ? await roomsApi.create(name)
        : await roomsApi.join(code, name);

      const member = pickMember(room, action, name);
      saveSession({
        roomId: room.id,
        roomCode: room.code,
        playerId: member.id,
        playerName: member.name,
        isHost: action === "create",
        stage: "lobby",
      });

      audioManager.playSfx(action === "create" ? "roomCodeReveal" : "playerJoin");
      window.location.href = ROUTES.lobby;
    } catch (err) {
      showMessage(err.message || "Có lỗi xảy ra, vui lòng thử lại.");
      audioManager.playSfx("error");
      shakeForm();
    } finally {
      actionButtons.forEach((b) => (b.disabled = false));
    }
  });
});

// Auto-format room code to uppercase.
roomCodeInput?.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
  hideMessage();
});

nameInput.addEventListener("input", () => {
  nameInput.setCustomValidity("");
  hideMessage();
});
