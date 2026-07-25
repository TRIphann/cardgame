// Landing page — two-step flow:
//   1. Player enters name → clicks "Vào đấu trường" → reveal room code + buttons
//   2. Player clicks "Tạo phòng" or "Vào phòng" (with optional code) → API call → lobby
//
// Why two-step?
//   - UX: feels less crowded on first load, room code is "scoped" to the action
//   - Lets us do a single click confirmation of the name before any network call
//
// Robustness:
//   - The form has inline onsubmit="event.preventDefault()" so it NEVER reloads
//   - All fetches go through `fetchWithTimeout` so a stuck request (e.g. CORS
//     rejection, hung cold-start) fails after 90 s instead of forever
//   - Loading spinner is shown during the network round-trip

import { saveSession, ROUTES, API_BASE_URL } from "../../config/env.js";
import { roomsApi } from "../../shared/api/roomsApi.js";
import { audioManager } from "../../shared/audio/AudioManager.js";

console.log("[arcana] landing: entry.js loaded");

const form = document.querySelector("#player-form");
const nameInput = document.querySelector("#player-name");
const roomCodeInput = document.querySelector("#room-code");
const enterButton = document.querySelector("#enter-button");
const roomActions = document.querySelector("#room-actions");
const createButton = document.querySelector("#create-button");
const joinButton = document.querySelector("#join-button");
const messageEl = document.querySelector("#form-message");
const loadingEl = document.querySelector("#loading");
const loadingText = document.querySelector("#loading-text");

if (!form || !nameInput || !enterButton || !roomActions || !createButton || !joinButton) {
  console.error("[arcana] landing: required DOM nodes missing", {
    form, nameInput, enterButton, roomActions, createButton, joinButton,
  });
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

function showLoading(text = "Đang kết nối máy chủ...") {
  if (loadingEl) loadingEl.hidden = false;
  if (loadingText) loadingText.textContent = text;
}
function hideLoading() {
  if (loadingEl) loadingEl.hidden = true;
}

function setBusy(busy) {
  [enterButton, createButton, joinButton].forEach((b) => { if (b) b.disabled = busy; });
}

function pickMember(room, isHostAction, name) {
  if (isHostAction) {
    return room.members.find((m) => m.isHost) ?? room.members[0];
  }
  // For join, the last-added member is the new arrival.
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}

// fetch with explicit timeout + clear error messages for CORS / network failures.
async function fetchWithTimeout(path, options = {}, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Máy chủ không phản hồi (timeout 90s). Vui lòng thử lại.");
    }
    // Network/CORS failure usually surfaces here with a TypeError.
    throw new Error(`Không kết nối được máy chủ (${err.message || err}). Kiểm tra CORS hoặc mạng.`);
  } finally {
    clearTimeout(t);
  }
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
  // Code typed => always join. No code => create when "Tạo", create when "Vào" too (forgiving UX).
  const effectiveAction = code ? "join" : action;

  audioManager.unlock();
  audioManager.playSfx("buttonClick");
  setBusy(true);
  hideMessage();
  showLoading(effectiveAction === "create" ? "Đang tạo phòng..." : "Đang vào phòng...");

  try {
    const res = effectiveAction === "create"
      ? await fetchWithTimeout("/api/rooms", {
          method: "POST",
          body: JSON.stringify({ hostName: name }),
        })
      : await fetchWithTimeout("/api/rooms/join", {
          method: "POST",
          body: JSON.stringify({ code, playerName: name }),
        });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        msg = body.title || body.message || body.error || msg;
      } catch (_) { /* ignore */ }
      throw new Error(humanizeApiError(res.status, msg, effectiveAction));
    }

    const body = await res.json();
    const room = body.room ?? body; // tolerate wrapped/unwrapped response shape

    const member = pickMember(room, effectiveAction === "create", name);
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
    showLoading("Đang vào phòng chờ...");
    console.log("[arcana] landing: room ready", { id: room.id, code: room.code, action: effectiveAction });
    window.location.href = ROUTES.lobby;
  } catch (err) {
    console.error("[arcana] landing: room flow failed", err);
    showMessage(err.message || "Có lỗi xảy ra, vui lòng thử lại.");
    audioManager.playSfx("error");
    shakeForm();
  } finally {
    setBusy(false);
    hideLoading();
  }
}

function humanizeApiError(status, msg, action) {
  if (status === 400) {
    if (action === "join") return "Mã phòng không hợp lệ. Hãy kiểm tra lại.";
    return "Tên không hợp lệ. Vui lòng thử tên khác.";
  }
  if (status === 404) return "Phòng không tồn tại hoặc đã đóng.";
  if (status === 409) return "Phòng đã đầy hoặc trò chơi đã bắt đầu.";
  if (status === 403) return "Bạn không có quyền vào phòng này.";
  if (status >= 500) return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.";
  return msg;
}

// --- Step 1: reveal room code + buttons ---
enterButton?.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) {
    showMessage("Vui lòng nhập tên trước.");
    nameInput.focus();
    shakeForm();
    return;
  }
  audioManager.unlock();
  audioManager.playSfx("buttonClick");
  hideMessage();
  roomActions.hidden = false;
  enterButton.hidden = true;
  roomCodeInput.focus();
});

// --- Step 2: create / join ---
createButton?.addEventListener("click", () => goToFlow("create"));
joinButton?.addEventListener("click", () => goToFlow("join"));

roomCodeInput?.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
  hideMessage();
});
nameInput?.addEventListener("input", () => {
  nameInput.setCustomValidity("");
  hideMessage();
});

// Enter in name field → advance to step 2.
nameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); enterButton.click(); }
});
// Enter in code field → trigger join (or create if empty).
roomCodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); joinButton.click(); }
});

console.log("[arcana] landing: entry.js ready");
