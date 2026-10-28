// useOptimisticRoom — encapsulates the "create or join a room in <1.5s" UX.
//
// The backend on Render free tier sleeps after ~15min idle, so the first POST
// after a quiet period can take 30-60s. Instead of staring at a spinner, we
// race the network against a hard UI timeout:
//   - If the real response arrives inside OPTIMISTIC_TIMEOUT_MS, we use it.
//   - Otherwise we navigate to /lobby immediately with a placeholder room
//     (random code, fake id) and continue the POST in the background; when
//     the real response lands we patch sessionStorage so a refresh on /lobby
//     picks up the real room id.
//
// The same optimistic path now applies to BOTH create and join — the host
// benefits from the same fast-feedback UX (so they aren't staring at a
// spinner during a cold-start), and the lobby already tolerates placeholder
// room ids by patching them in once the real response lands.
//
// The hook returns { run, busy, error } and the caller is responsible for
// navigating after success.

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { roomsApi } from "@shared/api/roomsApi.js";
import { ROUTES, saveSession, loadSession, queueSessionPatch } from "@config/env.js";

const OPTIMISTIC_TIMEOUT_MS = 1500;

// ── Background retry queue (FIFO, exponential backoff) ─────────────
// Why a second queue? After the 1.5s optimistic timeout the POST may still
// be in flight on a sleeping Render container for 30-60s. If that request
// fails once (cold container reset, transient 502/504), we used to give up
// silently and roll back to landing — the player lost their room even
// though a retry 5s later would have succeeded. The queue below retries the
// SAME create/join payload up to MAX_RETRIES times with exponential backoff
// (2s → 4s → 8s), so transient cold-start failures self-heal instead of
// bouncing the player. Only after the queue is exhausted do we roll back.
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2000;

function enqueueBackgroundRetry(task, attempt = 1) {
  task().catch(() => {
    if (attempt >= RETRY_MAX_ATTEMPTS) {
      // Queue exhausted — the caller's .catch handles rollback.
      throw new Error("background-retry-exhausted");
    }
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    setTimeout(() => enqueueBackgroundRetry(task, attempt + 1), delay);
  });
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
  // Rollback must ALWAYS use the router directly. On 28/10 prod a failed
  // cold-start POST bounced the player to a DEAD /lobby with an empty code
  // ("••••••", copy disabled) and no way out — the rollback went through
  // the landing onNavigate handler, which navigates to /lobby unconditionally.
  // Routing straight to landing here killed that dead-end for good.
  const navigateToLanding = useCallback(() => {
    navigate(ROUTES.landing, { replace: true });
  }, [navigate]);
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

    // Race against OPTIMISTIC_TIMEOUT_MS for BOTH create and join.
    // The cold-start on Render can take 30-60s, so we navigate after 1.5s
    // with a placeholder and patch the real id in the background.
    const raced = await raceWithFallback(postPromise, OPTIMISTIC_TIMEOUT_MS);

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

    // ── Optimistic path: cold-start ──────────────────────────────────
    // Navigate immediately WITHOUT a fake code (an older build showed a
    // random placeholder code in the toast/copy button, then the real code
    // arrived seconds later — players copied the wrong code on first open).
    // The lobby shows a "Đang khởi tạo phòng..." state until the real
    // response lands and patches the session.
    //
    // The background replace below re-runs `finalize`, which re-invokes
    // onNavigate(realRoom) — the SessionProvider event from saveSession
    // wakes the already-mounted LobbyPage out of its pending state
    // (pollRoomId flips from null to the real id, polling starts, and the
    // real code renders). The landing handler toasts the real code when it
    // sees a non-optimistic room arrive while already on /lobby.
    const fakeRoom = {
      id: "PENDING-" + Date.now(),
      code: "",
      hostId: "PENDING",
      hostName: name,
      status: "waiting",
      maxPlayers: 7,
      currentPlayers: 1,
      createdAt: new Date().toISOString(),
      members: [{
        id: "PENDING-me",
        name,
        isHost: action === "create",
        joinedAt: new Date().toISOString(),
      }],
      optimistic: true,
    };
    // Here we only need the session write to be visible to React promptly —
    // saveSession emits `arcana:session`, which the SessionProvider listens
    // for, so the LobbyPage re-renders with the pending session immediately.
    // The write goes through the session patch QUEUE so a double-click
    // (two PENDING writes) can never reorder past the REAL patch below.
    queueSessionPatch({
      roomId: fakeRoom.id,
      roomCode: fakeRoom.code,
      playerId: fakeRoom.members[0].id,
      playerName: fakeRoom.members[0].name,
      isHost: action === "create",
      stage: "lobby",
    });
    if (onNavigate) onNavigate(fakeRoom);
    setBusy(false);

    // Background replace. On REAL-room arrival, re-run `finalize` — it calls
    // onNavigate(room) with the REAL room, so the landing handler can toast
    // the actual code if the user is already on /lobby, and the patched
    // sessionStorage wakes the lobby out of its pending state.
    //
    // The whole patch runs inside the background RETRY QUEUE: if the cold
    // container reset mid-flight and the first attempt rejects, we retry the
    // SAME payload with backoff before giving up and rolling back.
    const applyRealRoom = (body) => {
      const real = body.room ?? body;
      const me = pickMember(real, action === "create", name);
      if (!real?.id || !me?.id) return;
      const cur = loadSession();
      // Only patch if the user hasn't moved on (created/joined another
      // room, or rolled back to landing after a failure). Queued so the
      // REAL write always lands AFTER any stale PENDING write still in
      // the queue.
      if (cur && cur.playerId === "PENDING-me" && String(cur.roomId || "").startsWith("PENDING-")) {
        queueSessionPatch({
          roomId: real.id,
          roomCode: real.code,
          playerId: me.id,
          playerName: me.name,
          isHost: action === "create",
          stage: "lobby",
        });
        if (onNavigate) onNavigate({ ...real, optimistic: false });
      }
    };
    const rollbackToLanding = () => {
      // Silent rollback: the landing page already surfaced the error via
      // `error` state + shake. Logging here spammed the console every
      // cold-start and buried the real CORS/snapshot errors.
      const cur = loadSession();
      if (cur && String(cur.roomId || "").startsWith("PENDING-")) {
        // SPA rollback — no full page reload.
        navigateToLanding();
      }
    };
    postPromise.then(applyRealRoom, () => {
      // First attempt failed — retry the payload through the queue, then
      // roll back only if the queue is exhausted.
      enqueueBackgroundRetry(
        () => (action === "create" ? roomsApi.create(name) : roomsApi.join(code, name)).then(applyRealRoom),
      );
      // Give the retry queue a chance: delay rollback past the last retry.
      // Total backoff budget = 2s + 4s + 8s ≈ 14s + request time.
      setTimeout(() => {
        const cur = loadSession();
        if (cur && String(cur.roomId || "").startsWith("PENDING-") && cur.playerId === "PENDING-me") {
          rollbackToLanding();
        }
      }, 20000);
    });

    return { kind: "ok", optimistic: true, room: fakeRoom };
  }, [onNavigate, navigateToLanding]);

  return { run, busy, error };
}