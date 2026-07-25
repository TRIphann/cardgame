// Auto-resolving environment module.
// On localhost we use the dev config pointing at the local .NET API.
// Anywhere else we use the production config pointing at the Render-hosted API.

import * as dev from "./local.js";
import * as prod from "./production.js";

const isLocal =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

export const API_BASE_URL = isLocal ? dev.API_BASE_URL : prod.API_BASE_URL;
export const ROUTES = isLocal ? dev.ROUTES : prod.ROUTES;
export const saveSession = dev.saveSession;
export const loadSession = dev.loadSession;
export const clearSession = dev.clearSession;
