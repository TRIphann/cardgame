# CHANGELOG

All notable changes to Arcana — Card Battle are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/).

> **How to add an entry**: open a PR that adds an `## [Unreleased]`
> section below, list your fix under the appropriate heading
> (Added / Changed / Fixed / Removed / Security), and the release
> workflow will move it to a versioned section at tag time.

## [Unreleased]

### Fixed

- **Shuffle no longer ends the player's turn.** Per the official Exploding
  Kittens rules, playing a Shuffle shuffles the draw pile and the player
  keeps going — the turn only ends when they draw (or play Attack/Skip).
  Shuffle now behaves like Future: the Nope window opens, but committing it
  leaves the turn with the same player. Previously the turn advanced as soon
  as the Nope window closed, so a follow-up play (e.g. the TC2.3 / TC3.3
  "Shuffle → Future" flow) was rejected with `not_your_turn`.
- **FuturePeek sweeper no longer fails on Test Lobby rooms.** The sweeper
  wrote every stale peek through the Firestore-backed repository, but Test
  Lobby rooms live in the in-memory test repository — so each tick failed
  with `No document to update` (NotFound), spamming the log and leaving the
  peek stuck on screen. The sweeper now resolves the owning repository the
  same way `GameService` does (test repo first, Firestore as fallback).
- Test Lobby "Failed to create test room" toast when running with a
  built (production-mode) bundle. Root cause: `cmd /c "set FOO=..."`
  on Windows adds a trailing space to the env var, so the build
  baked `"http://localhost:5000 "` (with a space) into the bundle
  and the browser silently failed every fetch. Workaround: PowerShell
  `$env:VAR = "..."` (clean). Helper: `frontend/build-with-local.ps1`.

## [v0.5.0] — 2026-09-27

### Added
- 10s unified timer for turns, Nope windows, Future Peek, and picker
  flows. Replaces the previous 60s turn timer + 5s Nope window.
- `TEST_LOBBY_TEST_CASES.md` — exhaustive manual test plan covering
  Future, Shuffle, Attack, Skip, Nope, Defuse, Combo, Bomb, Bot modes,
  edge cases, accessibility, and animation regressions.
- Comprehensive CI/CD pipeline (`.github/workflows/`).
- Production smoke test (`frontend/e2e/smoke-production.spec.ts`).

### Changed
- `Math.max(0, ...)` → `Math.min(10, ...)` in `GamePage.jsx` to clamp
  the timer display. The previous code returned the stale `turnTimeLimitSec`
  (60s) for the first second of a turn, showing "54s" on screen.
- `HOLD_MS = 5000` → `0` in `ActionCardReveal.jsx` so the reveal
  doesn't lock the action for 5s after a card is played.
- `rotateY: [180, 180]` → `rotateY: "180deg"` to force anime.js to
  write a transform string (the array form is a no-op when from === to,
  which let the inner fall back to the literal back-of-card image).
- Page z-index lowered from 1 → 0 across landing/lobby/game so the
  global `.arc-ambient` radial-gradient shows through. Fixes the
  "split background" seam between routes.
- Touch target size for `.btn-count-sm` raised from 22×22 to 44×44
  (Apple/Google minimum).

### Removed
- AFK modal, AFK state, `/resume` API call from `GamePage.jsx`.

### Fixed
- Card reveal no longer shows face-down for the played action card
  (rotateY regression in anime.js).
- Background no longer has a visible seam between Landing/Lobby/Game.
- Test Lobby no longer fails to create a room when the bundle is built
  with `VITE_API_BASE_URL=http://localhost:5000`.

## [v0.4.0] — 2026-09-20

### Added
- Bot service: draw-only, play-cards, skip, play-one-card modes.
- Combo cards: Ninja, Superman, Zombie, Robot, Hải Tặc.

## [v0.3.0] — 2026-09-15

### Added
- Future Peek modal (peek top-3 deck).
- Bomb placement picker.
- CachedRoomRepository (Redis-backed).

## [v0.2.0] — 2026-09-08

### Added
- Test Lobby (sandbox room with 4 bots).
- Nope chain logic.

## [v0.1.0] — 2026-09-01

### Added
- Initial release. Exploding Kittens rules implemented with
  10-player max, SignalR real-time updates, Firestore persistence,
  Netlify frontend, Render backend.