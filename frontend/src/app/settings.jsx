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
} from "react";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const actionsRef = useRef(new Map());
  const rendersRef = useRef(new Map());

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const registerTabs = useCallback((newTabs) => {
    setTabs(newTabs);
    actionsRef.current.clear();
    rendersRef.current.clear();
    for (const t of newTabs) {
      if (t.onAction) actionsRef.current.set(t.id, t.onAction);
      rendersRef.current.set(t.id, { mount: t.render });
    }
    if (newTabs.length > 0) {
      setActiveTabId(newTabs[0].id);
    }
  }, []);

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
    [isOpen, tabs, activeTabId, dispatchAction, refreshActive],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
