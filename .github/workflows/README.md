# CI/CD — Arcana — Card Battle

This folder contains every workflow, config, and document that powers
Arcana's build → test → deploy pipeline.

## Live environments

| Stage        | Frontend                                       | Backend                                          |
|--------------|------------------------------------------------|--------------------------------------------------|
| Production   | https://tricardgame.netlify.app                | https://cardgame-lwsk.onrender.com               |
| Branch preview | (per-push Netlify URL on `dev` + PRs)         | Render auto-deploys from `main` (single env)    |

## Workflows

| File                              | Triggers                          | Purpose                                                |
|-----------------------------------|-----------------------------------|--------------------------------------------------------|
| `ci.yml`                          | push, PR                          | Lint + build (backend + frontend).                     |
| `integration.yml`                 | push, PR, weekly cron, manual     | Backend REST integration + Playwright E2E + prod smoke. |
| `deploy-frontend.yml`             | push to `main`/`dev`, release     | Build + `netlify deploy --prod`.                       |
| `deploy-backend.yml`              | push to `main`, release           | Trigger Render deploy hook + wait for /health.         |
| `release.yml`                     | tag `v*.*.*`, manual              | Validate tag → deploy → publish GitHub release.        |
| `codeql.yml`                      | push, PR, weekly                  | Static security analysis.                           |

## Supporting docs
| File                          | Purpose                                          |
|-------------------------------|--------------------------------------------------|
| `../CONTRIBUTING.md`           | Branch model, conventions, local setup.          |
| `../../docs/SECURITY.md`      | Vulnerability disclosure policy.                 |
| `../../docs/CHANGELOG.md`     | Release notes (read by the release workflow).    |
| `PULL_REQUEST_TEMPLATE.md`    | PR checklist that pre-fills on every PR.         |
| `dependabot.yml`              | Weekly dependency PRs (NuGet, npm, Actions).     |

## Infrastructure config

| File                  | Purpose                                          |
|-----------------------|--------------------------------------------------|
| `../netlify.toml`     | Build command, SPA fallback, CSP headers.        |
| `../render.yaml`      | Render blueprint (Web Service + Redis).          |

## Secrets to configure in GitHub

| Secret                        | Used by                                | How to obtain                                        |
|-------------------------------|-----------------------------------------|------------------------------------------------------|
| `NETLIFY_AUTH_TOKEN`          | `deploy-frontend.yml`                  | Netlify → User Settings → Personal access tokens     |
| `NETLIFY_SITE_ID`             | `deploy-frontend.yml`                  | Netlify → Site settings → API → Site ID              |
| `RENDER_DEPLOY_HOOK_URL`      | `deploy-backend.yml`                   | Render → Service → Settings → Deploy hook URL        |
| `RENDER_API_KEY`              | `deploy-backend.yml` (optional)        | Render → Account Settings → API keys                  |
| `RENDER_SERVICE_ID`           | `deploy-backend.yml` (optional)        | Render → Service → Settings → Service ID             |
| `CODECOV_TOKEN`               | `ci.yml`                               | codecov.io → repo settings → upload token            |
| `NPM_AUTH_TOKEN`              | `deploy-frontend.yml`                  | npmjs.com → Access tokens (write:packages)           |

## Variable bootstrap (org-level, optional)

You can also set these as GitHub **Variables** (read-only, env-level)
to avoid hard-coding the production URLs in workflow YAML:

| Variable                    | Default                                       |
|---------------------------|-----------------------------------------------|
| `PRODUCTION_API_BASE_URL` | `https://cardgame-lwsk.onrender.com`          |
| `PRODUCTION_API_HUB_URL`  | `https://cardgame-lwsk.onrender.com`          |
| `PRODUCTION_FRONTEND_URL` | `https://tricardgame.netlify.app`             |
| `STAGING_API_BASE_URL`    | _(unset — falls back to localhost)_           |
| `STAGING_FRONTEND_BASE_URL` | _(unset — falls back to localhost)_          |

## First-time setup

1. **Create the GitHub repo** with the `main` and `dev` branches.
2. **Render** → `New Blueprint Instance` → point at this repo → it
   reads `render.yaml` and creates the Web Service + Redis. Add
   the Firestore credentials file via `Disks` → mount at
   `/app/Seccrets/cardgame-594f0-firebase-adminsdk-fbsvc-af3a2f6dee.json`.
3. **Netlify** → `Add new site` → `Import from Git` → select repo.
   Netlify auto-detects `netlify.toml`. Add the GitHub secrets from
   the table above.
4. **Push a tag** to test the release pipeline:
   ```bash
   git tag -a v0.1.0 -m "v0.1.0 — first CI/CD release"
   git push origin v0.1.0
   ```
   The release workflow validates → deploys backend → deploys
   frontend → creates a GitHub release. If anything fails, the
   release isn't created and the failed job shows up in Actions.

## Flow diagram

```
                         ┌───────────────┐
                         │  Push / PR    │
                         └──────┬────────┘
                                │
                  ┌─────────────┴──────────────┐
                  ▼                            ▼
        ┌─────────────────┐           ┌─────────────────┐
        │     ci.yml      │           │   codeql.yml    │
        │ (build + lint  │           │  (security)   │
        └────────┬────────┘           └─────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  integration.yml   │
        │ (backend REST +  │
        │  Playwright E2E) │
        └────────┬───────────┘
                 │
                 ▼ (push to main only)
        ┌────────────────────┐
        │  release.yml?     │
        └────┬───────────┬────┘
             ▼           ▼
   ┌────────────────┐ ┌─────────────────┐
   │ Render backend │ │ Netlify frontend│
   │ (cardgame-...  │ │ (tricardgame... │
   │  .onrender.com)│ │  .netlify.app) │
   └────────────────┘ └─────────────────┘
```

## Production smoke (weekly)

`integration.yml` runs `e2e/smoke-production.spec.ts` every Sunday
02:00 UTC. It:

- Verifies the SPA loads on Netlify.
- Confirms `/health` on Render returns 200.
- Checks CORS preflight between the two origins.
- Pings 10+ known-bad paths to make sure no debug endpoints are
  accidentally exposed (`/admin`, `/swagger`, `/.git/config`,
  `/api/secret`, etc.).
- Verifies security headers (CSP, X-Frame-Options, etc.) are present.
- Measures the median `/health` latency.

If any check fails the workflow fails and a Security Alert is
emailed. The check never mutates state, so it can run against
production safely.

## Adding new tests

| You added...                | Update                                             |
|-----------------------------|--------------------------------------------------------|
| A new REST endpoint          | `backend/tests/integration/normal-game-flow.ps1`        |
| A new Playwright E2E case  | `frontend/e2e/<feature>.spec.ts`                  |
| A new browser-visible route | `frontend/e2e/smoke-production.spec.ts` (route)  |
| A new env var               | `netlify.toml` `[build.environment]`                   |
| A new backend service       | `render.yaml` `services:` block                        |

## Rollback procedure

| Component      | Rollback                                                                  |
|----------------|--------------------------------------------------------------------------|
| Frontend       | `gh workflow run deploy-frontend.yml -f target=production` (re-deploys the last green commit) OR `curl -X POST "https://api.netlify.com/api/v1/sites/<id>/rollback" -H "Authorization: Bearer <token>"` |
| Backend        | Re-deploy the previous commit: `curl -X POST "https://api.render.com/v1/services/<id>/deploys" -d '{"commitId":"<sha>"}' -H "Authorization: Bearer <token>"` |
| Database       | Firestore daily export from Google Cloud Console → restore to a new project (rare) |

## Cost

| Service          | Plan       | ~$ / month                                            |
|-----------------|------------|-------------------------------------------------------|
| Render Web      | Starter    | $7 (covers ~400h runtime)                            |
| Render Redis    | Starter    | $10 (capped-friends)                                  |
| GitHub Actions  | Free tier  | $0 (≤2000 min/month on private; 200s if public)       |
| Netlify         | Free       | $0 (Pro at $19/mo for branch previews without limits) |
| Cloud Firestore | Spark      | $0 within free quota (50k reads / 20k writes / day) |
| **Total**       |            | **~$17 / month**                                      |