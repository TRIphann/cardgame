import { loadSession, clearSession, ROUTES } from "../../config/env.js";
import { getRoom } from "../../scripts/network/rooms.js";

const session = loadSession();
if (!session || !session.roomId || !session.playerId) {
  window.location.replace(ROUTES.landing);
}

const metaCodeEl = document.querySelector("#meta-code");
const metaHostEl = document.querySelector("#meta-host");
const meNameEl = document.querySelector("#me-name");
const meTagEl = document.querySelector("#me-tag");
const leaveButton = document.querySelector("#leave-button");

async function refreshRoom() {
  try {
    const room = await getRoom(session.roomId);
    metaCodeEl.textContent = room.code;
    metaHostEl.textContent = room.hostName;
    const me = room.members?.find((m) => m.id === session.playerId);
    if (me) {
      meNameEl.textContent = me.name;
      meTagEl.textContent = me.isHost ? "Chủ phòng" : "Thành viên";
    } else {
      meTagEl.textContent = "Không tìm thấy bạn trong phòng";
    }
  } catch (err) {
    meTagEl.textContent = `Lỗi: ${err.message}`;
  }
}

leaveButton.addEventListener("click", () => {
  clearSession();
  window.location.href = ROUTES.landing;
});

refreshRoom();
setInterval(refreshRoom, 3000);
