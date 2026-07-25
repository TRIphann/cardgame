// Local dev config.
export const API_BASE_URL = "http://localhost:5080";

export const ROUTES = {
  landing: "/pages/landing/index.html",
  lobby: "/pages/lobby/index.html",
  roomEntry: "/pages/room-entry/index.html",
};

const SESSION_KEY = "arcana.session.v1";

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
