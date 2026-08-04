// useOptimisticRoom — encapsulates the "create or join a room in <900ms" UX.
//
// The backend on Render free tier sleeps after ~15min idle, so the first POST
// after a quiet period can take 30-60s. Instead of staring at a spinner, we
// race the network against a hard UI timeout:
//   - If the real response arrives inside FAST_NAV_TIMEOUT_MS, we use it.
//   - Otherwise we navigate to /lobby immediately with a placeholder room
//     (random code, fake id) and continue the POST in the background; when
//     the real response lands we patch sessionStorage so a refresh on /lobby
//     picks up the real room id.
//
// The hook returns { create, join, busy, error } and the caller is responsible
// for navigating after success.

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { roomsApi } from "@shared/api/roomsApi.js";
import { ROUTES, saveSession, loadSession } from "@config/env.js";

const FAST_NAV_TIMEOUT_MS = 900;
const PLACEHOLDER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function placeholderCode() {
  let s = "";
  for (let i = 0; i < 6; i += 1) {
    s += PLACEHOLDER_CHARS[Math.floor(Math.random() * PLACEHOLDER_CHARS.length)];
  }
  return s;
}

function pickMember(room, isHostAction, name) {
  if (isHostAction) return room.members.find((m) => m.isHost) ?? room.members[0];
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}

function raceWithFallback(postPromise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ kind: "timeout" });
    }, ms);
    postPromise.then(
      (val) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ kind: "ok", value: val }); } },
      (err) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ kind: "err", error: err }); } },
    );
  });
}

export function useOptimisticRoom({ onNavigate } = {}) {
  const navigate = useNavigate();
  const navigateToLanding = useCallback(() => {
    if (typeof onNavigate === "function") {
      onNavigate(ROUTES.landing);
      return;
    }
    // SPA navigation — preserves router state, no full reload flicker.
    navigate(ROUTES.landing, { replace: true });
  }, [navigate, onNavigate]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (action, { name, code }) => {
    setBusy(true);
    setError(null);

    const postPromise = (async () => {
      const res = action === "create"
        ? await roomsApi.create(name)
        : await roomsApi.join(code, name);
      return res;
    })();

    // CREATE: always wait for the real response — the room code must be
    // shown to the user immediately after the API resolves. No timeout.
    // JOIN: use the 900ms race so the player isn't staring at a spinner
    // on Render's cold-start.
    const raced = await raceWithFallback(postPromise, action === "join" ? FAST_NAV_TIMEOUT_MS : 999_999);

    // Only join triggers the optimistic cold-start path (CREATE never does).
    const isJoinColdStart = action === "join" && raced.kind === "timeout";

    const finalize = (room, member) => {
      // isHost is decided by the *action*, not by inspecting the server's
      // members list. When joining we can't tell from the response alone
      // whether the joining player is the original host or just an early
      // member, so we trust the user-intent from the action.
      saveSession({
        roomId: room.id,
        roomCode: room.code,
        playerId: member.id,
        playerName: member.name,
        isHost: action === "create",
        stage: "lobby",
      });
      if (onNavigate) onNavigate(room);
    };

    if (raced.kind === "ok") {
      const body = raced.value;
      const room = body.room ?? body;
      const member = pickMember(room, action === "create", name);
      if (!member) {
        setError(new Error("Không tìm thấy thành viên sau khi tạo/vào phòng."));
        setBusy(false);
        return { kind: "err" };
      }
      finalize(room, member);
      setBusy(false);
      return { kind: "ok", optimistic: false, room };
    }

    if (raced.kind === "err") {
      setError(raced.error);
      setBusy(false);
      return { kind: "err", error: raced.error };
    }

    // ── Optimistic path: only for JOIN cold-start ────────────────────
    if (!isJoinColdStart) {
      // This should never happen for CREATE since we set timeout = 999_999ms.
      setError(new Error("Unexpected timeout — please try again."));
      setBusy(false);
      return { kind: "err" };
    }

    // Cold-start: navigate immediately, patch session later.
    const fakeRoom = {
      id: "PENDING-" + Date.now(),
      code: placeholderCode(),
      hostId: "PENDING",
      hostName: name,
      status: "waiting",
      maxPlayers: 7,
      currentPlayers: 1,
      createdAt: new Date().toISOString(),
      members: [{ id: "PENDING-me", name, isHost: true, joinedAt: new Date().toISOString() }],
    };
    finalize(fakeRoom, fakeRoom.members[0]);
    setBusy(false);

    // Background replace.
    postPromise
      .then((body) => {
        const real = body.room ?? body;
        const me = pickMember(real, action === "create", name);
        if (!real?.id || !me?.id) return;
        const cur = loadSession();
        if (cur && cur.playerId === "PENDING-me") {
          saveSession({
            ...cur,
            roomId: real.id,
            roomCode: real.code,
            playerId: me.id,
            playerName: me.name,
          });
        }
      })
      .catch((err) => {
        console.warn("[arcana] optimistic cold-start POST failed", err);
        const cur = loadSession();
        if (cur && cur.roomId?.startsWith("PENDING-")) {
          // SPA rollback — no full page reload.
          navigateToLanding();
        }
      });

    return { kind: "ok", optimistic: true, room: fakeRoom };
  }, [onNavigate, navigateToLanding]);

  return { run, busy, error };
}