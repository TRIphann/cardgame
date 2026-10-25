# SECURITY.md — Arcana — Card Battle

## Supported versions

| Branch  | Supported          |
|-----------|--------------------|
| main     | ✓ Active        |
| dev      | ✓ Best-effort   |
| older    | ✗ EOL           |

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security bugs.**

Email: security@gmae.dev (placeholder; replace with your real address).

We will:

1. Acknowledge your report within 48 hours.
3. Investigate and triage within 5 business days.
4. Issue a fix on the same week for HIGH severity, 30 days for MEDIUM,
   90 days for LOW. We'll coordinate disclosure with you.

## What's in scope

- Authentication bypass, privilege escalation
- Cross-site scripting (XSS) in the SPA
- Cross-site request forgery (CSRF) for state-changing endpoints
- Server-side request forgery (SSRF) from the backend
- Injection (Firestore query injection, SQL/NoSQL injection if we add
  SQL later)
- Insecure direct object references in /api/rooms/:id
- Information disclosure via debug endpoints or log lines

## What's NOT in scope

- Denial of service via the Firestore daily quota (rate-limit our
  problem, not yours — the project uses in-memory repos where possible)
- Client-side code injection if a user pastes JS into the dev console
  (no `eval` in our code)

## Disclosure policy

We aim to follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure).
Give us a reasonable window to fix before publishing details.

## Automated scanning

- `codeql.yml` runs weekly + on every push to main/dev
- Dependabot opens weekly PRs for outdated packages
- ESLint with `eslint-plugin-jsx-a11y` catches a11y regressions that
  often correlate with XSS risk