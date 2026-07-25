// Landing page — name input + create/join room.
// Single-page flow: pick name → either create a room (becomes host) or join with a code.

import { saveSession, ROUTES } from "../../config/env.js";
import { roomsApi } from "../../shared/api/roomsApi.js";
import { audioManager } from "../../shared/audio/AudioManager.js";

const form = document.querySelector("#player-form");
const nameInput = document.querySelector("#player-name");
const buttons = document.querySelectorAll("[data-action]");
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

function promptCode() {
  const raw = window.prompt("Nhập mã mời phòng (6 ký tự):");
  if (!raw) throw new Error("Bạn chưa nhập mã phòng.");
  return raw.trim().toUpperCase();
}

buttons.forEach((button) => {
  button.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.reportValidity();
      shakeForm();
      return;
    }

    const action = button.dataset.action;
    audioManager.unlock();
    button.disabled = true;

    try {
      const room = action === "create"
        ? await roomsApi.create(name)
        : await roomsApi.join(promptCode(), name);

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
      button.disabled = false;
    }
  });
});

nameInput.addEventListener("input", () => {
  nameInput.setCustomValidity("");
  hideMessage();
});
