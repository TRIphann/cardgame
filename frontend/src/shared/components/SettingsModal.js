// SettingsModal — modal with multiple tabs (Settings / Members).
// Tabs are added by passing a descriptor in the constructor: each tab has an id,
// a label, a renderer, and an optional list of "actions" that the host page
// can subscribe to (e.g. "kick" member). The modal itself is generic and only
// knows how to mount tabs and dispatch events; the host page provides the data.

import { t, i18n } from "../i18n/i18n.js";
import { audioManager } from "../audio/AudioManager.js";

function applyI18n(root) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

export class SettingsModal {
  /**
   * @param {HTMLElement} host — element to mount into
   * @param {Array<{id: string, label: string, render: (mount: HTMLElement) => () => void, onAction?: (action: string, payload: any) => void}>} [tabs]
   *   - render(mount): renders the tab body into `mount`; returns an optional `refresh()` function
   *   - onAction(action, payload): called when an interactive element inside the tab dispatches a data-action
   */
  constructor(host, tabs = []) {
    this.host = host;
    this.tabs = tabs;
    this.activeTabId = tabs[0]?.id ?? null;
    this.tabRenderers = new Map(); // id -> { mount, refresh? }
    this.tabActions = new Map();   // id -> onAction callback

    this.root = document.createElement("div");
    this.root.className = "settings-root";
    this.root.innerHTML = `
      <div class="settings-backdrop" data-close></div>
      <section class="settings-panel" role="dialog" aria-labelledby="settings-title">
        <header class="settings-header">
          <h2 id="settings-title" data-i18n="settings.title">Cài đặt</h2>
          <button type="button" class="settings-close" data-close aria-label="Close">✕</button>
        </header>
        <nav class="settings-tabs" data-tabs></nav>
        <div class="settings-body" data-tab-body></div>
      </section>
    `;
    this.host.appendChild(this.root);

    applyI18n(this.root);
    this._renderTabs();
    this._renderActiveTab();
    this._bind();
    this._sync();
  }

  open() {
    this.root.classList.add("is-open");
    this._renderActiveTab();
    this._sync();
    audioManager.unlock();
    audioManager.playSfx("buttonClick");
  }

  close() {
    this.root.classList.remove("is-open");
    audioManager.playSfx("buttonClick");
  }

  /** Re-render the active tab — call after the host's data changes. */
  refresh() {
    this._renderActiveTab();
  }

  destroy() {
    this.root.remove();
  }

  _renderTabs() {
    const nav = this.root.querySelector("[data-tabs]");
    if (this.tabs.length <= 1) {
      nav.hidden = true;
      return;
    }
    nav.innerHTML = "";
    for (const tab of this.tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-tab";
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      btn.addEventListener("click", () => {
        this.activeTabId = tab.id;
        this._renderTabs();
        this._renderActiveTab();
      });
      if (tab.id === this.activeTabId) btn.classList.add("is-active");
      nav.appendChild(btn);
    }
  }

  _renderActiveTab() {
    const body = this.root.querySelector("[data-tab-body]");
    body.innerHTML = "";
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!tab) {
      // Default Settings tab (music/sfx/lang)
      body.innerHTML = `
        <div class="settings-group">
          <label class="settings-label" data-i18n="settings.language">Ngôn ngữ</label>
          <select class="settings-select" data-settings-language>
            <option value="en" data-i18n="settings.language.value">English</option>
          </select>
          <p class="settings-hint" data-i18n="settings.languageLocked">Sẽ hỗ trợ thêm ngôn ngữ sau.</p>
        </div>
        <div class="settings-group">
          <label class="settings-label" for="music-vol" data-i18n="settings.music">Nhạc nền</label>
          <div class="settings-slider-row">
            <input type="range" id="music-vol" min="0" max="100" step="1" data-settings-music />
            <button type="button" class="settings-toggle" data-settings-music-mute data-on="true">♪</button>
          </div>
        </div>
        <div class="settings-group">
          <label class="settings-label" for="sfx-vol" data-i18n="settings.sfx">Hiệu ứng</label>
          <div class="settings-slider-row">
            <input type="range" id="sfx-vol" min="0" max="100" step="1" data-settings-sfx />
            <button type="button" class="settings-toggle" data-settings-sfx-mute data-on="true">🔊</button>
          </div>
        </div>
      `;
      applyI18n(body);
      this._bindAudioControls(body);
      return;
    }
    const refresh = tab.render(body);
    if (typeof refresh === "function") this.tabRenderers.set(tab.id, { mount: body, refresh });
    if (typeof tab.onAction === "function") this.tabActions.set(tab.id, tab.onAction);
  }

  _bind() {
    this.root.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) this.close();

      // Tab actions: any [data-action] inside an active tab body dispatches to the tab's onAction
      const actionEl = e.target.closest("[data-action]");
      if (actionEl) {
        const tab = this.tabs.find((t) => t.id === this.activeTabId);
        if (tab && typeof tab.onAction === "function") {
          tab.onAction(actionEl.dataset.action, {
            memberId: actionEl.dataset.memberId,
            target: actionEl,
          });
        }
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.root.classList.contains("is-open")) this.close();
    });
  }

  _bindAudioControls(scope) {
    const langSel = scope.querySelector("[data-settings-language]");
    if (langSel) langSel.value = i18n.getLocale();

    const musicSlider = scope.querySelector("[data-settings-music]");
    if (musicSlider) {
      musicSlider.addEventListener("input", () => {
        audioManager.setMusicVolume(Number(musicSlider.value) / 100);
        this._sync();
      });
    }

    const sfxSlider = scope.querySelector("[data-settings-sfx]");
    if (sfxSlider) {
      sfxSlider.addEventListener("input", () => {
        audioManager.setSfxVolume(Number(sfxSlider.value) / 100);
        audioManager.playSfx("buttonClick");
        this._sync();
      });
    }

    const musicMute = scope.querySelector("[data-settings-music-mute]");
    if (musicMute) {
      musicMute.addEventListener("click", () => {
        audioManager.setMusicMuted(!audioManager.getState().musicMuted);
        audioManager.playSfx("buttonClick");
        this._sync();
      });
    }

    const sfxMute = scope.querySelector("[data-settings-sfx-mute]");
    if (sfxMute) {
      sfxMute.addEventListener("click", () => {
        audioManager.setSfxMuted(!audioManager.getState().sfxMuted);
        audioManager.playSfx("buttonClick");
        this._sync();
      });
    }
  }

  _sync() {
    const s = audioManager.getState();
    const musicSlider = this.root.querySelector("[data-settings-music]");
    const sfxSlider = this.root.querySelector("[data-settings-sfx]");
    if (musicSlider) musicSlider.value = Math.round(s.musicVolume * 100);
    if (sfxSlider) sfxSlider.value = Math.round(s.sfxVolume * 100);

    const musicMuteBtn = this.root.querySelector("[data-settings-music-mute]");
    if (musicMuteBtn) {
      musicMuteBtn.dataset.on = String(!s.musicMuted);
      musicMuteBtn.textContent = s.musicMuted ? "🔇" : "♪";
      musicMuteBtn.classList.toggle("is-off", s.musicMuted);
    }

    const sfxMuteBtn = this.root.querySelector("[data-settings-sfx-mute]");
    if (sfxMuteBtn) {
      sfxMuteBtn.dataset.on = String(!s.sfxMuted);
      sfxMuteBtn.textContent = s.sfxMuted ? "🔇" : "🔊";
      sfxMuteBtn.classList.toggle("is-off", s.sfxMuted);
    }
  }
}
