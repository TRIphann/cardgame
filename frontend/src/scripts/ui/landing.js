import { createRoom, joinRoom } from "../network/rooms.js";
import { saveSession, ROUTES } from "../../config/env.js";

const playerForm = document.querySelector("#player-form");
const playerName = document.querySelector("#player-name");
const buttons = document.querySelectorAll("[data-action]");
const actionButtons = document.querySelector(".action-row");
const messageEl = ensureMessageElement();

buttons.forEach((button) => {
  button.addEventListener("click", async () => {
    const name = playerName.value.trim();
    if (!name) {
      playerName.focus();
      playerName.reportValidity();
      return;
    }

    const action = button.dataset.action;
    setLoading(true, action);

    try {
      const room = action === "create"
        ? await createRoom(name)
        : await joinRoom(promptCode(), name);

      const member = pickMember(room, action, name);
      saveSession({
        roomId: room.id,
        roomCode: room.code,
        playerId: member.id,
        playerName: member.name,
        isHost: action === "create",
        stage: "lobby",
      });

      window.location.href = ROUTES.lobby;
    } catch (err) {
      showMessage(err.message || "Có lỗi xảy ra, vui lòng thử lại.", true);
    } finally {
      setLoading(false);
    }
  });
});

playerName.addEventListener("input", () => {
  playerName.setCustomValidity("");
  hideMessage();
});

function promptCode() {
  const raw = window.prompt("Nhập mã mời phòng (6 ký tự):");
  if (!raw) throw new Error("Bạn chưa nhập mã phòng.");
  return raw.trim().toUpperCase();
}

function pickMember(room, action, name) {
  if (action === "create") {
    return room.members.find((m) => m.isHost) ?? room.members[0];
  }
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}

function setLoading(loading, action) {
  actionButtons.querySelectorAll("button").forEach((btn) => {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalLabel = btn.dataset.originalLabel ?? btn.firstChild?.textContent ?? "";
      btn.firstChild.textContent = action === "create"
        ? "Đang tạo phòng..."
        : "Đang vào phòng...";
    } else if (btn.dataset.originalLabel) {
      btn.firstChild.textContent = btn.dataset.originalLabel;
    }
  });
  if (loading) hideMessage();
}

function ensureMessageElement() {
  let el = document.querySelector("#form-message");
  if (!el) {
    el = document.createElement("p");
    el.id = "form-message";
    el.className = "form-message";
    el.hidden = true;
    playerForm.appendChild(el);
  }
  return el;
}

function showMessage(text, isError) {
  messageEl.textContent = text;
  messageEl.dataset.tone = isError ? "error" : "info";
  messageEl.hidden = false;
}

function hideMessage() {
  messageEl.hidden = true;
}
