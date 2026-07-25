// Room entry for Exploding Cats — name + create/join.
// Reuses backend API exactly as the previous landing flow did.

import { saveSession, ROUTES } from "../../../config/env.js";
import { roomsApi } from "../../../shared/api/roomsApi.js";
import { audioManager } from "../../../shared/audio/AudioManager.js";
import { t } from "../../../shared/i18n/i18n.js";

const form = document.querySelector("#player-form");
const nameInput = document.querySelector("#player-name");
const buttons = document.querySelectorAll("[data-action]");

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

function pickMember(room, action, name) {
  if (action === "create") {
    return room.members.find((m) => m.isHost) ?? room.members[0];
  }
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}

function promptCode() {
  const raw = window.prompt(t("landing.codePrompt"));
  if (!raw) throw new Error(t("landing.codeEmpty"));
  return raw.trim().toUpperCase();
}

async function callApi(path, body) {
  // thin wrapper kept for compatibility; delegates to roomsApi.
  if (path === "/api/rooms") return roomsApi.create(body.hostName);
  if (path === "/api/rooms/join") return roomsApi.join(body.code, body.playerName);
  throw new Error(`Unknown path: ${path}`);
}

buttons.forEach((button) => {
  button.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.reportValidity();
      return;
    }
    const action = button.dataset.action;
    audioManager.unlock();

    try {
      const room = action === "create"
        ? await callApi("/api/rooms", { hostName: name })
        : await callApi(`/api/rooms/join`, { code: promptCode(), playerName: name });

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
      window.location.href = "../lobby/index.html";
    } catch (err) {
      audioManager.playSfx("error");
      alert(err.message || "Có lỗi xảy ra, vui lòng thử lại.");
    }
  });
});

applyI18n();
