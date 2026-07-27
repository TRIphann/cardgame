// Session — central, observable session store. Replaces the imperative
// localStorage read/write functions used by the vanilla pages with a React
// context so any component can subscribe to changes.
//
// The session shape:
//   { roomId, roomCode, playerId, playerName, isHost, stage }

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

export function SessionProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());

  // Sync external changes (e.g. another tab calling saveSession via a non-
  // React code path). Listen to the storage event to update.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === "arcana.session.v1") {
        try {
          setSession(e.newValue ? JSON.parse(e.newValue) : null);
        } catch (_) {
          setSession(null);
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next) => {
    setSession(next);
    if (next) saveSession(next);
    else clearStorage();
  }, []);

  const patch = useCallback((partial) => {
    setSession((prev) => {
      const merged = prev ? { ...prev, ...partial } : partial;
      if (merged) saveSession(merged);
      return merged;
    });
  }, []);

  const clear = useCallback(() => {
    setSession(null);
    clearStorage();
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