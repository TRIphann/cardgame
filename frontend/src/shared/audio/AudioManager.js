// AudioManager — singleton that mixes music + sfx with independent volume controls.
// Strategy: HTMLAudioElement for music (looping), AudioBufferSource for sfx (low latency).
// Why two technologies? <audio> is easier for streaming long loops; AudioBuffer is
// decoded once then triggered with sample-accurate timing for short UI feedback.

import { ASSET_MANIFEST } from "../../games/exploding-cats/assets/manifest.js";

const STORAGE_KEY = "arcana.audio.v1";

class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicEl = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.buffers = new Map();
    this.state = { ...ASSET_MANIFEST.defaults };
    this.unlocked = false;
    this._loadPersisted();
  }

  _loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(this.state, JSON.parse(raw));
    } catch (_) { /* ignore */ }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (_) { /* ignore */ }
  }

  // Browsers block AudioContext until a user gesture. Call this inside a click handler.
  unlock() {
    if (this.unlocked) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.gain.value = this._effectiveMusicVolume();
      this.sfxGain.gain.value = this._effectiveSfxVolume();
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.unlocked = true;
    } catch (err) {
      console.warn("AudioContext unavailable", err);
    }
  }

  _effectiveMusicVolume() {
    return this.state.musicMuted ? 0 : this.state.musicVolume;
  }

  _effectiveSfxVolume() {
    return this.state.sfxMuted ? 0 : this.state.sfxVolume;
  }

  setMusicVolume(v) {
    this.state.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = this._effectiveMusicVolume();
    this._persist();
  }

  setSfxVolume(v) {
    this.state.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this._effectiveSfxVolume();
    this._persist();
  }

  setMusicMuted(muted) {
    this.state.musicMuted = !!muted;
    if (this.musicGain) this.musicGain.gain.value = this._effectiveMusicVolume();
    this._persist();
  }

  setSfxMuted(muted) {
    this.state.sfxMuted = !!muted;
    if (this.sfxGain) this.sfxGain.gain.value = this._effectiveSfxVolume();
    this._persist();
  }

  getState() {
    return { ...this.state };
  }

  // Start background music loop. Safe to call multiple times.
  async startMusic() {
    if (!this.unlocked) this.unlock();
    if (!this.ctx) return;
    if (this.musicEl && !this.musicEl.paused) return;

    if (!this.musicEl) {
      this.musicEl = new Audio(ASSET_MANIFEST.music.primary);
      this.musicEl.loop = true;
      this.musicEl.crossOrigin = "anonymous";
    }
    try {
      this.musicEl.volume = 1; // we use the gain node instead
      await this.musicEl.play();
    } catch (err) {
      console.warn("Music autoplay blocked", err);
    }
  }

  stopMusic() {
    if (this.musicEl && !this.musicEl.paused) {
      this.musicEl.pause();
      this.musicEl.currentTime = 0;
    }
  }

  async _ensureSfxBuffer(name) {
    if (!this.ctx) return null;
    if (this.buffers.has(name)) return this.buffers.get(name);
    const url = ASSET_MANIFEST.sfx[name];
    if (!url) return null;
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.buffers.set(name, buf);
      return buf;
    } catch (err) {
      console.warn(`SFX load failed: ${name}`, err);
      return null;
    }
  }

  // Play a registered SFX. Resolves when started (not when finished).
  async playSfx(name) {
    if (!this.unlocked) this.unlock();
    if (!this.ctx) return;
    if (this.state.sfxMuted) return;
    const buffer = await this._ensureSfxBuffer(name);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.sfxGain);
    src.start(0);
  }
}

export const audioManager = new AudioManager();
