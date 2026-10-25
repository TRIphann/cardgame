# ─────────────────────────────────────────────────────────────────────
#  PR template — Arcana — Card Battle
# ─────────────────────────────────────────────────────────────────────

## What changed?

<!-- One-paragraph summary. Example: 'Refactor turn clock to use a single
TURN_TIME_LIMIT_SEC constant across frontend + backend so timer stays in
sync on multi-window games.' -->

## Why?

<!-- What's the motivation? Bug, new feature, perf, refactor? Link the
issue / ticket if there is one. -->

Closes #

## How to test

<!-- Steps a reviewer can follow to reproduce / validate. Include curl
examples for backend changes. -->

1.
2.
3.

## Checklist

- [ ] I read the [CONTRIBUTING.md](../blob/main/.github/CONTRIBUTING.md)
- [ ] I added/updated unit tests when it made sense
- [ ] I added/updated E2E docs in `frontend/e2e/` for UI changes
- [ ] I ran `dotnet build Arcana.sln -c Release` locally — clean
- [ ] I ran `npm run build` in `frontend/` — clean
- [ ] I ran `npm run lint` — 0 warnings
- [ ] I ran the backend integration suite — `pwsh backend/tests/integration/normal-game-flow.ps1`
- [ ] I ran the Playwright suite — `cd frontend && npm run e2e`
- [ ] I bumped `docs/CHANGELOG.md` (or added an "Unreleased" entry)
- [ ] I did NOT touch any `Secrets/` files

## Screenshots / recordings

<!-- If this is a UI change, attach before/after screenshots or a
screen recording. Drag-and-drop into the comment area works. -->

## Risk

<!--
LOW — pure refactor, no behaviour change.
MEDIUM — affects gameplay but only adds a feature or new flow.
HIGH — modifies existing behaviour, DB schema, or touches auth/CORS.
-->

Risk: **LOW**

## Rollback plan

<!-- One sentence. Example: 'Revert the merge commit — no migration
required.' Or 'Disable the GameService cache flag via env var.' -->