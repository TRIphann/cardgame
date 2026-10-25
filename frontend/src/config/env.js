// Application config — kept tiny so the bundler can tree-shake unused branches.
//
// Production endpoints are baked in at build time via these Vite env vars
// (set in the deploy workflow, never at runtime):
//
//   VITE_API_BASE_URL  → REST + SignalR negotiate (e.g. https://cardgame-lwsk.onrender.com)
//   VITE_API_HUB_URL   → SignalR hub URL. Often the same as the REST base, but
//                        some setups (Netlify edge redirects + Render hub) keep
//                        them separate. Currently identical.
//
// If unset (npm run dev), the code falls back to:
//   - empty string ("")  → relative URL → Vite proxy (or same-origin when served
//                          behind the Netlify redirects).
//   - "https://cardgame-lwsk.onrender.com" for production.
//
// Why direct to Render instead of proxying through Netlify?
//   - SignalR's WebSocket endpoint (/hubs/game) cannot traverse Netlify's
//     HTTP-only edge redirects (the browser would still need to talk to Render
//     for the hub, which defeats the purpose).
//   - The backend's Cors:AllowedOrigins already whitelists the Netlify origin
//     (see backend/src/Arcana.Api/appsettings.json), so cross-origin requests
//     are permitted.
//
// Local development with a real backend (e.g. for the Test Lobby):
//   PowerShell: $env:VITE_API_BASE_URL = "http://localhost:5000"; npm run build
//   Helper script: frontend/build-with-local.ps1
//
// CI / production deploys set VITE_API_BASE_URL automatically — see
// .github/workflows/deploy-frontend.yml and netlify.toml.

const RELATIVE_REST_BASE = "";
const IS_DEV = typeof import.meta !== "undefined" &&
  import.meta.env &&
  (import.meta.env.DEV === true || import.meta.env.MODE === "development");

const FALLBACK_REST_BASE = IS_DEV
  ? "" // let the Vite proxy handle it
  : "https://cardgame-lwsk.onrender.com";
const FALLBACK_HUB_BASE = IS_DEV
  ? ""
  : FALLBACK_REST_BASE;

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  FALLBACK_REST_BASE;
export const API_HUB_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_HUB_URL) ||
  FALLBACK_HUB_BASE;

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