export const API_BASE_URL = "http://localhost:5080";

export const ROUTES = {
  landing: "/frontend/src/pages/landing/index.html",
  lobby: "/frontend/src/pages/lobby/index.html",
  room: "/frontend/src/pages/room/index.html",
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
