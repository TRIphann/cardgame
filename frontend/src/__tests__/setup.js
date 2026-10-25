// Global test setup — loaded by Vitest before every test file.
//
// jsdom does not implement a few browser APIs the app relies on, so we stub
// the ones that would otherwise throw. Everything here is a no-op fake: the
// tests assert on application behaviour, never on real media playback.

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no matchMedia. Several components (Seat, HandArc, CardActionModal,
// DefuseModal, FxBurst, PageEntryFx) call window.matchMedia to honour the
// user's "prefers-reduced-motion" setting. Stub it so those components can
// render in tests.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom has no AudioContext. The AudioManager guards for this, but stubbing
// it keeps the console clean and lets us assert that unlock() does not throw.
if (!window.AudioContext) {
  window.AudioContext = class {
    constructor() {
      this.state = "running";
      this.destination = {};
      this.currentTime = 0;
    }
    createGain() {
      return {
        gain: { value: 1 },
        connect: () => {},
        disconnect: () => {},
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: () => {},
        start: () => {},
        stop: () => {},
        onended: null,
      };
    }
    decodeAudioData() {
      return Promise.resolve({});
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  };
}

// Unmount any React tree that was rendered, so a failed test cannot leak
// DOM nodes into the next one.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});