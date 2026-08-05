// Application config — kept tiny so the bundler can tree-shake unused branches.
//
// REST endpoints are reached via the Netlify reverse-proxy at `/api/*` and
// `/health` (see `netlify.toml`). Using relative URLs guarantees the browser
// only talks to `tricardgame.netlify.app`, which:
//
//   - Skips the CORS preflight (same-origin).
//   - Sidesteps ad blockers / privacy filters that block `*.onrender.com`
//     with `ERR_BLOCKED_BY_CLIENT`.
//   - Removes the 30-60s Render cold-start spike from the first request.
//
// SignalR (the GameHub at `/hubs/game`) does NOT go through the redirect —
// Netlify proxies are pure HTTP, WebSockets need a different plumbing. Set
// `VITE_API_HUB_URL` to the direct Render URL when SignalR should bypass
// the proxy; otherwise it falls back to the same origin (so it works in
// local dev and when the hub is hosted on the same domain in production).

// Production uses the absolute Render URL. The backend whitelists
// https://tricardgame.netlify.app in Cors:AllowedOrigins, so cross-origin
// requests from the Netlify-deployed SPA are allowed. A previous attempt
// to hide the Render URL behind a Netlify /api/* proxy failed because
// SignalR's WebSocket (/hubs/game) cannot be proxied through Netlify's
// edge redirects — the browser would still have to talk to Render for
// the hub, which defeats the purpose.
const RELATIVE_REST_BASE = "";
const FALLBACK_REST_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "https://cardgame-lwsk.onrender.com";
const FALLBACK_HUB_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_HUB_URL) ||
  FALLBACK_REST_BASE;

export const API_BASE_URL = FALLBACK_REST_BASE;
export const API_HUB_URL = FALLBACK_HUB_BASE;

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
const SESSION_EVENT = "arcana:session";

function emitSessionChange(next) {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: next }));
  } catch (_) { /* SSR / older browsers */ }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    // Notify in-tab listeners (React SessionProvider) that the session changed,
    // since `storage` events only fire across tabs.
    emitSessionChange(session);
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