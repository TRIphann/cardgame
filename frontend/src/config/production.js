// Production config — used when deployed on Netlify / Vercel
export const API_BASE_URL = "https://cardgame-hndy.onrender.com";

export const ROUTES = {
  landing: "/pages/landing/index.html",
  lobby: "/pages/lobby/index.html",
  room: "/pages/room/index.html",
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
