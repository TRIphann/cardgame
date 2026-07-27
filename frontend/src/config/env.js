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

// sessionStorage-backed session, scoped to this browser tab. Single source of truth.
//
// Why sessionStorage instead of localStorage?
// - Two Chrome tabs on the same domain share localStorage, so a player in tab A
//   would see their session overwritten by tab B (or vice versa). This caused
//   the "I typed a code and got 'created room X' back" bug when testing across
//   tabs. With sessionStorage each tab keeps its own join/create state.
// - sessionStorage survives F5 inside the same tab, which is what we need.

const SESSION_KEY = "arcana.session.v1";

export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (_) { /* private mode / quota */ }
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (_) { /* no-op */ }
}

// Some older code still imports "localStorage" by name for the last-used
// display name; keep that on localStorage so the value persists across tabs.
const LAST_NAME_KEY = "arcana.lastName.v1";
export function saveLastName(name) {
  try { localStorage.setItem(LAST_NAME_KEY, name); } catch (_) { /* noop */ }
}
export function loadLastName() {
  try { return localStorage.getItem(LAST_NAME_KEY) || ""; } catch (_) { return ""; }
}
export function clearLastName() {
  try { localStorage.removeItem(LAST_NAME_KEY); } catch (_) { /* noop */ }
}

export const SESSION_STORAGE_KEY = SESSION_KEY;