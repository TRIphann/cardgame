// Rooms API — fetch wrappers. Used by useOptimisticRoom + LobbyPage.

import { API_BASE_URL } from "@config/env.js";

const COLD_START_TIMEOUT_MS = 50000;
const WARM_TIMEOUT_MS = 15000;
const MAX_RETRIES = 1;

function isAbort(err) {
  return (
    err &&
    (err.name === "AbortError" || /abort/i.test(String(err.message || "")))
  );
}

function isTransient(err) {
  if (!err) return false;
  if (isAbort(err)) return true;
  if (/timeout|network|failed to fetch/i.test(err.message || "")) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";
  const timeoutMs = isMutation ? COLD_START_TIMEOUT_MS : WARM_TIMEOUT_MS;

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(options.headers || {}),
        },
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES && isTransient(err)) {
        // Exponential backoff: 1s, 2s, up to 5s — helps Render cold-start.
        const delay = Math.min(5000, 500 * Math.pow(2, attempt));
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function jsonRequest(path, options = {}) {
  const res = await request(path, options);
  if (!res.ok) {
    let code = `http_${res.status}`;
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      code = body.code || code;
      msg = body.message || msg;
    } catch (_) { /* ignore */ }
    const err = new Error(msg);
    err.code = code;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const roomsApi = {
  create(hostName) {
    return jsonRequest("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ hostName }),
    });
  },
  join(code, playerName) {
    return jsonRequest("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code, playerName }),
    });
  },
  // Snapshot endpoint also prunes stale members server-side. Used by the
  // polling loop instead of /api/rooms/{id} so we get fresh IsOnline flags.
  // Pass memberId so the server marks us online on each call (prevents
  // the 35s offline prune from kicking us while we're actively polling).
  snapshot(roomId, memberId) {
    const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
    return jsonRequest(`/api/rooms/${roomId}/snapshot${qs}`);
  },
  kick(roomId, hostId, targetMemberId) {
    return jsonRequest(`/api/rooms/${roomId}/kick`, {
      method: "POST",
      body: JSON.stringify({ hostId, targetMemberId }),
    });
  },
  setReady(roomId, memberId, isReady) {
    return jsonRequest(`/api/rooms/${roomId}/ready`, {
      method: "POST",
      body: JSON.stringify({ memberId, isReady }),
    });
  },
  leave(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/members/${memberId}/leave`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
    });
  },
  heartbeat(roomId, memberId) {
    // Fire-and-forget on the caller side; we still wrap it in jsonRequest
    // so the abort/timeout logic is reused. The promise resolves with
    // { memberId, isOnline } on success and rejects with an Error otherwise.
    return jsonRequest(`/api/rooms/${roomId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
    });
  },
  // Game endpoints
  snapshotWithViewer(roomId, memberId) {
    const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
    return jsonRequest(`/api/rooms/${roomId}/snapshot${qs}`);
  },
  startGame(roomId, hostId) {
    return jsonRequest(`/api/rooms/${roomId}/start`, {
      method: "POST",
      body: JSON.stringify({ hostId }),
    });
  },
  rotateRoom(roomId, hostId) {
    return jsonRequest(`/api/rooms/${roomId}/rotate`, {
      method: "POST",
      body: JSON.stringify({ hostId }),
    });
  },
  playCard(roomId, payload) {
    return jsonRequest(`/api/rooms/${roomId}/game/play-card`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  drawCard(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/game/draw-card`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
    });
  },
  useDefuse(roomId, memberId, slotIndex) {
    return jsonRequest(`/api/rooms/${roomId}/game/defuse`, {
      method: "POST",
      body: JSON.stringify({ memberId, slotIndex }),
    });
  },
  nope(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/game/nope`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
    });
  },
  concede(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/game/concede`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
    });
  },
};