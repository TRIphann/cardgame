// Application config — kept tiny so the bundler can tree-shake unused branches.
//
// `import.meta.env.PROD` is true in production builds. We use that instead of
// a hostname check so the same bundle works for preview deploys, local
// production builds, and the live site without any environment wiring.

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "https://cardgame-lwsk.onrender.com";

// React Router paths. Anything you want to be deep-linkable lives here.
export const ROUTES = {
  landing: "/",
  lobby: "/lobby",
  game: (roomId) => `/game/${roomId}`,
  settings: "/settings",
};

// localStorage-backed session. Single source of truth.
const SESSION_KEY = "arcana.session.v1";

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (_) { /* private mode / quota */ }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (_) { /* no-op */ }
}

export const SESSION_STORAGE_KEY = SESSION_KEY;