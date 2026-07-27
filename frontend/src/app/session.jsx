// Session — central, observable session store. Replaces the imperative
// localStorage read/write functions used by the vanilla pages with a React
// context so any component can subscribe to changes.
//
// The session shape:
//   { roomId, roomCode, playerId, playerName, isHost, stage, avatar }
//
// Storage: sessionStorage, scoped to this tab. (See config/env.js for why.)
//
// Cross-component sync: the browser only fires the `storage` event on OTHER
// tabs, not the current one. To make a session update from anywhere in the
// same tab (e.g. useOptimisticRoom.run -> saveSession) visible to React, we
// dispatch a custom `arcana:session` event that this provider listens for.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { loadSession, saveSession, clearSession as clearStorage } from "@config/env.js";

const SessionContext = createContext(null);
const SESSION_EVENT = "arcana:session";

function emitSessionChange(next) {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: next }));
  } catch (_) { /* SSR / older browsers */ }
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());

  // Listen for session changes from anywhere in this tab + other tabs.
  useEffect(() => {
    function onCustom(e) {
      setSession(e.detail === undefined ? loadSession() : e.detail);
    }
    function onStorage(e) {
      if (e.key === "arcana.session.v1") {
        try {
          setSession(e.newValue ? JSON.parse(e.newValue) : null);
        } catch (_) {
          setSession(null);
        }
      }
    }
    window.addEventListener(SESSION_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((next) => {
    setSession(next);
    if (next) saveSession(next);
    else clearStorage();
    emitSessionChange(next);
  }, []);

  const patch = useCallback((partial) => {
    setSession((prev) => {
      const merged = prev ? { ...prev, ...partial } : partial;
      if (merged) saveSession(merged);
      emitSessionChange(merged);
      return merged;
    });
  }, []);

  const clear = useCallback(() => {
    setSession(null);
    clearStorage();
    emitSessionChange(null);
  }, []);

  const value = useMemo(
    () => ({ session, update, patch, clear }),
    [session, update, patch, clear],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}