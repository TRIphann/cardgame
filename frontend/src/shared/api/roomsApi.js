// Shared HTTP client + room endpoints.
// Centralized here so any game can call into the backend without rewriting fetches.

import { API_BASE_URL } from "../config/env.js";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const roomsApi = {
  create(hostName) {
    return request("/api/rooms", { method: "POST", body: JSON.stringify({ hostName }) });
  },
  join(code, playerName) {
    return request("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code, playerName }),
    });
  },
  get(roomId) {
    return request(`/api/rooms/${roomId}`);
  },
  kick(roomId, hostId, targetMemberId) {
    return request(`/api/rooms/${roomId}/kick`, {
      method: "POST",
      body: JSON.stringify({ hostId, targetMemberId }),
    });
  },
};

export const getRoom = roomsApi.get;
