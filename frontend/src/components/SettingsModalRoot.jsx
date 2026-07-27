// SettingsModalRoot — renders the global settings modal driven by
// SettingsContext. Pages register tabs via useSettings().registerTabs(...).

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../app/settings.jsx";
import { useAudio } from "@shared/audio/AudioManager.jsx";
import { useI18n } from "@shared/i18n/i18n.jsx";

export function SettingsModalRoot() {
  const settings = useSettings();
  const audio = useAudio();
  const { t } = useI18n();

  // Esc closes the modal.
  useEffect(() => {
    if (!settings.isOpen) return undefined;
    function onKey(e) { if (e.key === "Escape") settings.close(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settings.isOpen, settings]);

  if (!settings.isOpen) return null;

  return createPortal(
    <div className="settings-root" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-backdrop" onClick={settings.close} />
      <section className="settings-panel">
        <header className="settings-header">
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button type="button" className="settings-close" aria-label="Đóng" onClick={settings.close}>
            ✕
          </button>
        </header>
        {settings.tabs.length > 1 && (
          <nav className="settings-tabs" role="tablist">
            {settings.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === settings.activeTabId}
                className={`settings-tab ${tab.id === settings.activeTabId ? "is-active" : ""}`}
                onClick={() => settings.setActiveTabId(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
        <div className="settings-body" role="tabpanel">
          <SettingsBody settings={settings} audio={audio} t={t} />
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SettingsBody({ settings, audio, t }) {
  const tab = settings.tabs.find((x) => x.id === settings.activeTabId);

  if (tab) {
    return <CustomTabBody tab={tab} settings={settings} />;
  }

  // Built-in Settings tab.
  return (
    <>
      <div className="settings-group">
        <label className="settings-label">{t("settings.language")}</label>
        <select className="settings-select" defaultValue="vi">
          <option value="vi">{t("settings.language.value")}</option>
        </select>
        <p className="settings-hint">{t("settings.languageLocked")}</p>
      </div>
      <div className="settings-group">
        <label className="settings-label" htmlFor="music-vol">{t("settings.music")}</label>
        <div className="settings-slider-row">
          <input
            type="range"
            id="music-vol"
            min="0"
            max="100"
            value={Math.round(audio.state.musicVolume * 100)}
            onChange={(e) => audio.setMusicVolume(Number(e.target.value) / 100)}
          />
          <button
            type="button"
            className="settings-toggle"
            aria-pressed={!audio.state.musicMuted}
            onClick={() => audio.setMusicMuted(!audio.state.musicMuted)}
          >
            ♪
          </button>
        </div>
      </div>
      <div className="settings-group">
        <label className="settings-label" htmlFor="sfx-vol">{t("settings.sfx")}</label>
        <div className="settings-slider-row">
          <input
            type="range"
            id="sfx-vol"
            min="0"
            max="100"
            value={Math.round(audio.state.sfxVolume * 100)}
            onChange={(e) => audio.setSfxVolume(Number(e.target.value) / 100)}
          />
          <button
            type="button"
            className="settings-toggle"
            aria-pressed={!audio.state.sfxMuted}
            onClick={() => audio.setSfxMuted(!audio.state.sfxMuted)}
          >
            ▶
          </button>
        </div>
      </div>
    </>
  );
}

function CustomTabBody({ tab, settings }) {
  // Custom tab content is rendered via the render function registered in the
  // tab descriptor. We attach onAction via a global click handler so any
  // `data-action="kick"` element inside the tab triggers the host's action.
  const containerRef = React.useRef(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    function onClick(e) {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const payload = target.dataset.payload ? JSON.parse(target.dataset.payload) : null;
      settings.dispatchAction(action, payload);
    }
    node.addEventListener("click", onClick);
    return () => node.removeEventListener("click", onClick);
  }, [settings]);

  return (
    <div ref={containerRef}>
      {tab.render()}
    </div>
  );
}