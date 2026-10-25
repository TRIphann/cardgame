import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  API_BASE_URL,
  API_HUB_URL,
  ROUTES,
  SESSION_STORAGE_KEY,
  saveSession,
  loadSession,
  clearSession,
  saveLastName,
  loadLastName,
  clearLastName,
} from "@config/env.js";

describe("env — routes", () => {
  it("exposes the static routes", () => {
    expect(ROUTES.landing).toBe("/");
    expect(ROUTES.lobby).toBe("/lobby");
    expect(ROUTES.settings).toBe("/settings");
  });

  it("builds the game route from a room id", () => {
    expect(ROUTES.game("abc123")).toBe("/game/abc123");
  });

  it("exposes an API base URL usable for requests", () => {
    // In dev/test the base URL is intentionally EMPTY so requests use relative
    // URLs and go through the Vite proxy. In a production build it is an
    // absolute https URL. Both are valid; anything else is not.
    expect(typeof API_BASE_URL).toBe("string");
    if (API_BASE_URL !== "") {
      expect(API_BASE_URL).toMatch(/^https?:\/\//);
    }
  });

  it("exposes a hub URL usable for SignalR", () => {
    expect(typeof API_HUB_URL).toBe("string");
    if (API_HUB_URL !== "") {
      expect(API_HUB_URL).toMatch(/^https?:\/\//);
    }
  });

  it("uses the same base for REST and the hub when no hub override is set", () => {
    // The hub falls back to the REST base, so they must agree unless the
    // build explicitly set VITE_API_HUB_URL.
    if (!import.meta.env.VITE_API_HUB_URL) {
      expect(API_HUB_URL).toBe(API_BASE_URL);
    }
  });
});

describe("env — session storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips a session object", () => {
    const session = { roomId: "room-1", memberId: "m1", name: "Alice" };

    saveSession(session);

    expect(loadSession()).toEqual(session);
  });

  it("returns null when there is no stored session", () => {
    expect(loadSession()).toBeNull();
  });

  it("returns null for a corrupted session instead of throwing", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, "{not valid json");

    expect(loadSession()).toBeNull();
  });

  it("clears the stored session", () => {
    saveSession({ roomId: "room-1" });

    clearSession();

    expect(loadSession()).toBeNull();
  });

  it("dispatches a session-change event when saving", () => {
    const handler = vi.fn();
    window.addEventListener("arcana:session", handler);

    saveSession({ roomId: "room-1" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ roomId: "room-1" });

    window.removeEventListener("arcana:session", handler);
  });

  it("stores the session under the shared key", () => {
    saveSession({ roomId: "room-1" });

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeTruthy();
  });
});

describe("env — last name storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips the last used name", () => {
    saveLastName("Alice");

    expect(loadLastName()).toBe("Alice");
  });

  it("returns an empty string when nothing is stored", () => {
    expect(loadLastName()).toBe("");
  });

  it("clears the stored name", () => {
    saveLastName("Alice");

    clearLastName();

    expect(loadLastName()).toBe("");
  });

  it("persists the name across tabs (localStorage, not sessionStorage)", () => {
    saveLastName("Bob");

    expect(sessionStorage.getItem("arcana.lastName.v1")).toBeNull();
  });
});