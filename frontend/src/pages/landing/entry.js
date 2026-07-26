// Landing page — direct-action flow:
//   - "Tạo phòng"  → POST /api/rooms, then jump to lobby (1 click).
//   - "Vào phòng"  → first click reveals the room-code input,
//                    second click posts /api/rooms/join and jumps to lobby.
//
// Why no intermediate "Vào đấu trường" button?
//   The action IS the act of creating/joining. Clicking "Tạo phòng" is the
//   strongest possible commitment from the user — no extra confirmation gate.
//
// Backend:
//   - env.js picks the correct API_BASE_URL (local -> localhost:5080,
//     production -> https://cardgame-lwsk.onrender.com).
//   - Render free tier spins down idle services, so the first request after
//     a quiet period can take ~30s. We surface progress via toast only —
//     no inline spinner, no "Đang kết nối..." text — per latest UX request.

import { saveSession, ROUTES, API_BASE_URL } from "../../config/env.js";
import { prewarmBackend, request } from "../../shared/api/roomsApi.js";
import { audioManager } from "../../shared/audio/AudioManager.js";
import { toast } from "../../shared/ui/toast.js";

console.log("[arcana] landing: entry.js loaded");

// Wake the Render free-tier container up-front so the first user action
// doesn't pay the full cold-start cost (~30-60s).
prewarmBackend();

const form = document.querySelector("#player-form");
const nameInput = document.querySelector("#player-name");
const roomCodeInput = document.querySelector("#room-code");
const createButton = document.querySelector("#create-button");
const joinButton = document.querySelector("#join-button");
const roomActions = document.querySelector("#room-actions");
const messageEl = document.querySelector("#form-message");

if (!form || !nameInput || !createButton || !joinButton || !roomActions) {
  console.error("[arcana] landing: required DOM nodes missing", {
    form, nameInput, createButton, joinButton, roomActions,
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

function setBusy(busy) {
  if (createButton) createButton.disabled = busy;
  if (joinButton) joinButton.disabled = busy;
}

function getName() {
  return nameInput?.value.trim() ?? "";
}

function pickMember(room, isHostAction, name) {
  if (isHostAction) {
    return room.members.find((m) => m.isHost) ?? room.members[0];
  }
  // For join, the last-added member is the new arrival.
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}

// fetch with explicit timeout + clear error messages for CORS / network failures.
// `request` is the retry-aware wrapper in roomsApi.js; here we just translate
// errors into user-friendly Vietnamese messages.
async function fetchWithTimeout(path, options = {}) {
  try {
    return await request(path, options);
  } catch (err) {
    if (err && (err.name === "AbortError" || /abort/i.test(String(err.message || "")))) {
      throw new Error("Máy chủ không phản hồi. Vui lòng thử lại.");
    }
    if (/timeout/i.test(err?.message || "")) {
      throw new Error("Máy chủ không phản hồi. Vui lòng thử lại.");
    }
    throw new Error(`Không kết nối được máy chủ (${err.message || err}). Kiểm tra CORS hoặc mạng.`);
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

async function runAction(action) {
  const name = getName();
  if (!name) {
    showMessage("Vui lòng nhập tên trước.");
    nameInput?.focus();
    shakeForm();
    return;
  }

  let code = "";
  if (action === "join") {
    code = (roomCodeInput?.value ?? "").trim().toUpperCase();
    if (!code) {
      showMessage("Vui lòng nhập mã phòng rồi bấm «Vào phòng» lần nữa.");
      roomCodeInput?.focus();
      shakeForm();
      return;
    }
  }

  audioManager.unlock();
  audioManager.playSfx("buttonClick");
  setBusy(true);
  hideMessage();

  const pendingToast = toast.info(
    action === "create" ? "Đang tạo phòng..." : "Đang vào phòng...",
    { title: action === "create" ? "Tạo phòng" : "Vào phòng", duration: 0 },
  );

  try {
    const res = action === "create"
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
      throw new Error(humanizeApiError(res.status, msg, action));
    }

    const body = await res.json();
    const room = body.room ?? body;

    const member = pickMember(room, action === "create", name);
    if (!member) {
      throw new Error("Không tìm thấy thành viên trong phòng sau khi tạo/join.");
    }

    saveSession({
      roomId: room.id,
      roomCode: room.code,
      playerId: member.id,
      playerName: member.name,
      isHost: action === "create",
      stage: "lobby",
    });

    audioManager.playSfx(action === "create" ? "roomCodeReveal" : "playerJoin");

    if (pendingToast?.dismiss) pendingToast.dismiss();
    toast.success(
      `Đã ${action === "create" ? "tạo" : "vào"} phòng ${room.code}`,
      { title: "Thành công", duration: 2000 },
    );

    console.log("[arcana] landing: room ready", { id: room.id, code: room.code, action });
    window.location.href = ROUTES.lobby;
  } catch (err) {
    console.error("[arcana] landing: room flow failed", err);
    if (pendingToast?.dismiss) pendingToast.dismiss();
    toast.error(err.message || "Có lỗi xảy ra, vui lòng thử lại.", {
      title: action === "create" ? "Tạo phòng thất bại" : "Vào phòng thất bại",
    });
    audioManager.playSfx("error");
    shakeForm();
  } finally {
    setBusy(false);
  }
}

// --- "Tạo phòng": one click, done. ---
createButton?.addEventListener("click", () => runAction("create"));

// --- "Vào phòng": two-stage button.
//     stage="enter-code"  → reveal the input, focus it.
//     stage="submit"      → runAction("join"). ---
joinButton?.addEventListener("click", () => {
  if (joinButton.dataset.stage === "enter-code") {
    const name = getName();
    if (!name) {
      showMessage("Vui lòng nhập tên trước.");
      nameInput?.focus();
      shakeForm();
      return;
    }
    audioManager.unlock();
    audioManager.playSfx("buttonClick");
    hideMessage();
    roomActions.hidden = false;
    joinButton.dataset.stage = "submit";
    joinButton.querySelector("span").textContent = "↳";
    roomCodeInput?.focus();
    return;
  }
  runAction("join");
});

// If user changes the code, re-arm the button to require a fresh second click.
roomCodeInput?.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
  hideMessage();
  if (joinButton?.dataset.stage === "submit") {
    joinButton.dataset.stage = "enter-code";
    joinButton.querySelector("span").textContent = "→";
  }
});

nameInput?.addEventListener("input", () => {
  nameInput.setCustomValidity("");
  hideMessage();
});

// Enter in name field → trigger Tạo phòng (fastest path).
nameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); createButton.click(); }
});

// Enter in code field → trigger join.
roomCodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); joinButton.click(); }
});

console.log("[arcana] landing: entry.js ready");
