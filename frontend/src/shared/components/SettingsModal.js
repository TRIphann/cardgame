// SettingsModal — generic modal with music / sfx / language controls.
// Mounts into a host element passed in. Self-contained: instantiates, listens, exposes destroy().

import { t, i18n } from "../i18n/i18n.js";
import { audioManager } from "../audio/AudioManager.js";

const HTML = /* html */ `
  <div class="settings-backdrop" data-close></div>
  <section class="settings-panel" role="dialog" aria-labelledby="settings-title">
    <header class="settings-header">
      <h2 id="settings-title" data-i18n="settings.title"></h2>
      <button type="button" class="settings-close" data-close aria-label="Close">✕</button>
    </header>
    <div class="settings-body">
      <div class="settings-group">
        <label class="settings-label" data-i18n="settings.language"></label>
        <select class="settings-select" data-settings-language>
          <option value="en" data-i18n="settings.language.value"></option>
        </select>
        <p class="settings-hint" data-i18n="settings.languageLocked"></p>
      </div>

      <div class="settings-group">
        <label class="settings-label" for="music-vol" data-i18n="settings.music"></label>
        <div class="settings-slider-row">
          <input type="range" id="music-vol" min="0" max="100" step="1" data-settings-music />
          <button type="button" class="settings-toggle" data-settings-music-mute data-on="true">♪</button>
        </div>
      </div>

      <div class="settings-group">
        <label class="settings-label" for="sfx-vol" data-i18n="settings.sfx"></label>
        <div class="settings-slider-row">
          <input type="range" id="sfx-vol" min="0" max="100" step="1" data-settings-sfx />
          <button type="button" class="settings-toggle" data-settings-sfx-mute data-on="true">🔊</button>
        </div>
      </div>
    </div>
  </section>
`;

function applyI18n(root) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

export class SettingsModal {
  constructor(host) {
    this.host = host;
    this.root = document.createElement("div");
    this.root.className = "settings-root";
    this.root.innerHTML = HTML;
    this.host.appendChild(this.root);

    applyI18n(this.root);
    this._bind();
    this._sync();
  }

  open() {
    this.root.classList.add("is-open");
    this._sync();
    audioManager.unlock();
    audioManager.playSfx("buttonClick");
  }

  close() {
    this.root.classList.remove("is-open");
    audioManager.playSfx("buttonClick");
  }

  destroy() {
    this.root.remove();
  }

  _bind() {
    this.root.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.root.classList.contains("is-open")) this.close();
    });

    const langSel = this.root.querySelector("[data-settings-language]");
    langSel.value = i18n.getLocale();

    const musicSlider = this.root.querySelector("[data-settings-music]");
    musicSlider.addEventListener("input", () => {
      audioManager.setMusicVolume(Number(musicSlider.value) / 100);
      this._sync();
    });

    const sfxSlider = this.root.querySelector("[data-settings-sfx]");
    sfxSlider.addEventListener("input", () => {
      audioManager.setSfxVolume(Number(sfxSlider.value) / 100);
      audioManager.playSfx("buttonClick");
      this._sync();
    });

    const musicMute = this.root.querySelector("[data-settings-music-mute]");
    musicMute.addEventListener("click", () => {
      audioManager.setMusicMuted(!audioManager.getState().musicMuted);
      audioManager.playSfx("buttonClick");
      this._sync();
    });

    const sfxMute = this.root.querySelector("[data-settings-sfx-mute]");
    sfxMute.addEventListener("click", () => {
      audioManager.setSfxMuted(!audioManager.getState().sfxMuted);
      audioManager.playSfx("buttonClick");
      this._sync();
    });
  }

  _sync() {
    const s = audioManager.getState();
    this.root.querySelector("[data-settings-music]").value = Math.round(s.musicVolume * 100);
    this.root.querySelector("[data-settings-sfx]").value = Math.round(s.sfxVolume * 100);

    const musicMuteBtn = this.root.querySelector("[data-settings-music-mute]");
    musicMuteBtn.dataset.on = String(!s.musicMuted);
    musicMuteBtn.textContent = s.musicMuted ? "🔇" : "♪";
    musicMuteBtn.classList.toggle("is-off", s.musicMuted);

    const sfxMuteBtn = this.root.querySelector("[data-settings-sfx-mute]");
    sfxMuteBtn.dataset.on = String(!s.sfxMuted);
    sfxMuteBtn.textContent = s.sfxMuted ? "🔇" : "🔊";
    sfxMuteBtn.classList.toggle("is-off", s.sfxMuted);
  }
}
