# CONTRIBUTING.md — Arcana — Card Battle

Thanks for contributing. This guide covers the workflow + what we
expect before a PR can be merged.

## Code of conduct

Be excellent to each other. We don't have a long document; just don't
be rude.

## Branch model

```
main   ← production (https://tricardgame.netlify.app, Render)
feat/* ← short-lived feature branches (PR → dev)
fix/*  ← short-lived bug-fix branches (PR → dev)
chore/*← refactor / tooling (PR → dev)
release/*← 1-2 day release-candidate branches (PR → main, but only after
           integration.yml is green)
```

We don't merge directly into `main` — everything goes through `dev`
which is auto-deployed to a Netlify preview URL. Releases are cut from
`main` by the [release workflow](.github/workflows/release.yml) after
a green integration run.

## Local setup

### Backend

```bash
cd backend
dotnet restore Arcana.sln
dotnet build   Arcana.sln -c Release
dotnet run     --project src/Arcana.Api/Arcana.Api.csproj --urls http://localhost:5000
```

### Frontend

```bash
cd frontend
npm ci
npm run dev    # Vite dev server on http://localhost:5173
# OR
npm run build && npm run preview  # Production preview on http://localhost:4173
```

### Tests

```bash
# Backend integration suite
cd backend/tests/integration
pwsh ./normal-game-flow.ps1
pwsh ./bot-modes-test.ps1

# Frontend E2E (needs the backend running on :5000)
cd frontend
npx playwright install --with-deps chromium
npm run e2e
```

## Coding conventions

### Backend (.NET 8)

- 4-space indents, file-scoped namespaces.
- `dotnet format` is enforced in CI — see `ci.yml`.
- No `Console.WriteLine` in production code. Use `ILogger<T>`.
- Domain logic lives in `Arcana.Domain` + `Arcana.Application`. API
  controllers are thin — they translate HTTP ↔ commands/queries.
- Add a unit test for any change to `GameService`, `TurnClockService`,
  `BotService`, or any repo `WriteAsync`.

### Frontend (React + Vite)

- 2-space indents, single quotes, semicolons. ESLint config in
  `frontend/eslint.config.js` enforces this with `max-warnings 0`.
- Components live in `frontend/src/pages/<feature>/` with co-located
  `.jsx` + CSS modules / named subcomponents.
- Avoid `useEffect` for derived state — derive inline. The only
  legitimate `useEffect` use cases are: subscribing to a WebSocket,
  attaching a global event listener, or syncing imperative DOM APIs.
- Add a Playwright test for any new route, modal, or game action.

## Pre-commit (optional but recommended)

```bash
# Backend
cd backend
dotnet format Arcana.sln && git add -A && git commit -m "..."

# Frontend
cd frontend
npm run lint && git add -A && git commit -m "..."
```

## Pre-PR checklist

See [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

## CI pipeline

PRs must pass:

1. **`ci.yml`** — backend build + lint, frontend build + ESLint
2. **`integration.yml`** — backend integration suite + frontend E2E
3. **`codeql.yml`** — no new HIGH-severity security findings

After merge to `main`, `deploy-frontend.yml` and `deploy-backend.yml`
fire automatically. The `release.yml` workflow only runs when you push
a `v*.*.*` tag.

## Releasing

```bash
git checkout main && git pull
git tag -a v0.1.0 -m "v0.1.0 — first public beta"
git push origin v0.1.0
```

This kicks off `release.yml` which:

1. Validates the tag format + CHANGELOG entry.
2. Deploys backend (Render).
3. Deploys frontend (Netlify).
4. Creates a GitHub release with auto-notes.

## Need help?

- Slack: `#gmae-dev`
- Issues: open a GitHub issue with the `bug` or `question` label.
- Security: see `docs/SECURITY.md`.
