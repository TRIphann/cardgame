// AudioManager — singleton that mixes music + sfx with independent volume
// controls. Strategy: HTMLAudioElement for music (looping), AudioBufferSource
// for sfx (low latency).
//
// Why a class wrapped in a hook? The audio graph is genuinely a singleton
// (one AudioContext per tab, lifetime = page) so we don't want a fresh
// instance per render. The hook just gives React a way to read state + trigger
// actions.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "arcana.audio.v1";

const DEFAULT_STATE = {
  musicVolume: 0.6,
  sfxVolume: 0.8,
  musicMuted: false,
  sfxMuted: false,
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicEl = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.buffers = new Map();
    this.unlocked = false;
    this.state = { ...DEFAULT_STATE, ...this._loadPersisted() };
    this._listeners = new Set();
  }

  _loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (_) { /* private mode */ }
  }

  _emit() {
    for (const fn of this._listeners) fn();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

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
    this._emit();
  }

  setSfxVolume(v) {
    this.state.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this._effectiveSfxVolume();
    this._persist();
    this._emit();
  }

  setMusicMuted(muted) {
    this.state.musicMuted = !!muted;
    if (this.musicGain) this.musicGain.gain.value = this._effectiveMusicVolume();
    this._persist();
    this._emit();
  }

  setSfxMuted(muted) {
    this.state.sfxMuted = !!muted;
    if (this.sfxGain) this.sfxGain.gain.value = this._effectiveSfxVolume();
    this._persist();
    this._emit();
  }

  async _loadBuffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
    this.buffers.set(url, audioBuf);
    return audioBuf;
  }

  playSfx(name) {
    if (!this.unlocked || !this.ctx) return;
    // Simple mapping — extend as the game adds more sounds.
    const url = SFX_URLS[name];
    if (!url) return;
    this._loadBuffer(url)
      .then((buf) => {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.sfxGain);
        src.start();
      })
      .catch((err) => console.warn("sfx play failed", name, err));
  }
}

// Placeholder sfx URLs — swap with real files when available. Keeping them
// no-op means the rest of the app keeps working while the audio pack lands.
const SFX_URLS = {
  buttonClick: null,
  roomCodeReveal: null,
  playerJoin: null,
  error: null,
};

const audioManager = new AudioManager();
export { audioManager };

// React hook ---------------------------------------------------------------

export function useAudio() {
  const state = useSyncExternalStore(
    (cb) => audioManager.subscribe(cb),
    () => audioManager.state,
  );

  const unlock = useCallback(() => audioManager.unlock(), []);
  const playSfx = useCallback((name) => audioManager.playSfx(name), []);
  const setMusicVolume = useCallback((v) => audioManager.setMusicVolume(v), []);
  const setSfxVolume = useCallback((v) => audioManager.setSfxVolume(v), []);
  const setMusicMuted = useCallback((m) => audioManager.setMusicMuted(m), []);
  const setSfxMuted = useCallback((m) => audioManager.setSfxMuted(m), []);

  return {
    state,
    unlock,
    playSfx,
    setMusicVolume,
    setSfxVolume,
    setMusicMuted,
    setSfxMuted,
  };
}