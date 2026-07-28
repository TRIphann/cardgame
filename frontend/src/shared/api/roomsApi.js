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
          ...(options.headers || {}),
        },
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES && isTransient(err)) {
        await sleep(700);
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
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).message || msg;
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

let prewarmPromise = null;
export function prewarmBackend() {
  if (prewarmPromise) return prewarmPromise;
  prewarmPromise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (_) { /* cold start still in progress */ }
    clearTimeout(timer);
  })();
  return prewarmPromise;
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
  get(roomId) {
    return jsonRequest(`/api/rooms/${roomId}`);
  },
  // Snapshot endpoint also prunes stale members server-side. Used by the
  // polling loop instead of /api/rooms/{id} so we get fresh IsOnline flags.
  snapshot(roomId) {
    return jsonRequest(`/api/rooms/${roomId}/snapshot`);
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
  heartbeat(roomId, memberId) {
    // Fire-and-forget on the caller side; we still wrap it in jsonRequest
    // so the abort/timeout logic is reused. The promise resolves with
    // { memberId, isOnline } on success and rejects with an Error otherwise.
    return jsonRequest(`/api/rooms/${roomId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
    });
  },
};

export const getRoom = roomsApi.get;