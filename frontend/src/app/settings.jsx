// SettingsContext — global settings modal state. The modal is mounted once
// in the root layout; pages can open it via useSettings().open() and pass
// tab descriptors via useSettings().registerTabs().

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { useAudio } from "@shared/audio/AudioManager.jsx";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const actionsRef = useRef(new Map()); // tabId -> onAction callback
  const rendersRef = useRef(new Map()); // tabId -> { mount, refresh? }

  const open = useCallback(() => {
    setIsOpen(true);
    if (!activeTabId && tabs[0]) setActiveTabId(tabs[0].id);
  }, [activeTabId, tabs]);

  const close = useCallback(() => setIsOpen(false), []);

  const registerTabs = useCallback((newTabs, onAction) => {
    setTabs(newTabs);
    actionsRef.current.clear();
    for (const t of newTabs) {
      if (t.onAction) actionsRef.current.set(t.id, t.onAction);
      rendersRef.current.set(t.id, { mount: t.render });
    }
    if (newTabs.length > 0 && !newTabs.find((t) => t.id === activeTabId)) {
      setActiveTabId(newTabs[0].id);
    }
  }, [activeTabId]);

  const dispatchAction = useCallback((action, payload) => {
    const fn = actionsRef.current.get(activeTabId);
    if (fn) fn(action, payload);
  }, [activeTabId]);

  const refreshActive = useCallback(() => {
    const entry = rendersRef.current.get(activeTabId);
    if (entry && entry.refresh) entry.refresh();
  }, [activeTabId]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      tabs,
      activeTabId,
      setActiveTabId,
      registerTabs,
      dispatchAction,
      refreshActive,
    }),
    [isOpen, open, close, tabs, activeTabId, registerTabs, dispatchAction, refreshActive],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
      {/* Modal is mounted at the App level via <SettingsModal />. */}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}