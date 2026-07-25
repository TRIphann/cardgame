// Asset registry — single source of truth for all game audio.
// Change a URL here once and the entire app picks it up.
// All tracks are from Pixabay (royalty-free, no attribution required).

export const ASSET_MANIFEST = {
  // Background music tracks. Music engine will pick `primary` at boot.
  music: {
    primary: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3",
    alternatives: [
      "https://cdn.pixabay.com/audio/2022/03/15/audio_b0d4a8b4eb.mp3",
      "https://cdn.pixabay.com/audio/2024/02/08/audio_e9c61a8ec0.mp3",
    ],
  },

  // Sound effects — short clips played on UI events.
  sfx: {
    buttonClick: "https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3",
    playerJoin: "https://cdn.pixabay.com/audio/2022/03/10/audio_1aaeeed2a3.mp3",
    playerLeave: "https://cdn.pixabay.com/audio/2022/03/10/audio_267072d99a.mp3",
    roomCodeReveal: "https://cdn.pixabay.com/audio/2022/03/15/audio_b9bd1e74c9.mp3",
    error: "https://cdn.pixabay.com/audio/2022/03/15/audio_4d4f3e1e2a.mp3",
  },

  // Default volume levels — overridable from Settings.
  defaults: {
    musicVolume: 0.4,    // 0..1
    sfxVolume: 0.7,      // 0..1
    musicMuted: false,
    sfxMuted: false,
  },
};
