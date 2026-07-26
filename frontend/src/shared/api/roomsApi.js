// Shared HTTP client + room endpoints.
// Centralized here so any game can call into the backend without rewriting fetches.

import { API_BASE_URL } from "../config/env.js";

const COLD_START_TIMEOUT_MS = 50000;
const WARM_TIMEOUT_MS = 15000;
const MAX_RETRIES = 1;

function isAbort(err) {
  return err && (err.name === "AbortError" || /abort/i.test(String(err.message || "")));
}

function isTransient(err) {
  // Network/timeout failures mean the server may still be booting (Render free
  // tier cold-start can hit ~50s). Treat them as retryable.
  if (!err) return false;
  if (isAbort(err)) return true;
  if (/timeout|máy chủ không phản hồi|không kết nối được|network|failed to fetch/i.test(err.message || "")) {
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// request — fetch with explicit timeout, AbortController, and a single retry on
// transient failures. Rooms API on Render free tier can be cold-started for
// 30–60s after a quiet period, so we set a long default timeout and retry once
// before giving up. Returns the raw Response so callers can branch on status.
export async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";
  const timeoutMs = isMutation ? COLD_START_TIMEOUT_MS : WARM_TIMEOUT_MS;

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
      clearTimeout(t);
      return res;
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt < MAX_RETRIES && isTransient(err)) {
        // Brief backoff so we don't slam a cold-starting service.
        await sleep(700);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// jsonRequest — convenience wrapper that parses JSON and throws on !res.ok.
async function jsonRequest(path, options = {}) {
  const res = await request(path, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Prewarm — ping the server's /health endpoint so the first interactive
// request lands on a warm container. Fire-and-forget; never throws.
let prewarmPromise = null;
export function prewarmBackend() {
  if (prewarmPromise) return prewarmPromise;
  prewarmPromise = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (_) { /* cold start still in progress, that's fine */ }
    clearTimeout(t);
  })();
  return prewarmPromise;
}

export const roomsApi = {
  create(hostName) {
    return jsonRequest("/api/rooms", { method: "POST", body: JSON.stringify({ hostName }) });
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
  kick(roomId, hostId, targetMemberId) {
    return jsonRequest(`/api/rooms/${roomId}/kick`, {
      method: "POST",
      body: JSON.stringify({ hostId, targetMemberId }),
    });
  },
};

export const getRoom = roomsApi.get;