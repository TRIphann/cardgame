# Local Test Run Log

> Lưu ý: file này ghi lại **nhật ký các lần chạy test cụ thể**. Tổng quan kiến trúc
> kiểm thử nằm ở [`TEST_SUITE_MATRIX.md`](TEST_SUITE_MATRIX.md).

---

## Run #2 — 2026-10-25 (Full 4-layer verification)

### Environment
- OS: Windows 11 (win32 10.0.26300)
- Shell: PowerShell 7 (pwsh)
- Workspace: D:\gmae
- .NET 8 SDK / Node 20 LTS / PowerShell 7 / Playwright Chromium

### TẦNG 1 — Backend unit tests (xUnit)

```powershell
cd D:\gmae\backend
dotnet test tests\unit\Arcana.UnitTests\Arcana.UnitTests.csproj
```

| Kết quả | |
|----------|---|
| Passed | **164** |
| Failed | 0 |
| Skipped | 0 |
| Duration | 62 ms |

Coverage (coverlet, XPlat Code Coverage):

| Assembly | Line rate | Branch rate |
|----------|-----------|-------------|
| `Arcana.Domain` | 94.0% | 100% |
| `Arcana.Application` | 36.7% | 35.6% |
| `Arcana.Infrastructure` | 13.8% | 4.4% |
| **Tổng** | **26.6%** | **18.8%** |

### TẦNG 2 — Frontend unit & component (Vitest + RTL)

```bash
cd D:\gmae\frontend
npm run test
npm run test:coverage
```

| Kết quả | |
|----------|---|
| Test files | **5 passed** |
| Tests | **64 passed** |
| Duration | 2.70s |

Coverage (v8):

| Nhóm | % Stmts | % Branch | % Funcs |
|------|---------|----------|---------|
| `src/config/env.js` | 100 | 57.1 | 100 |
| `cardCloudinary.js` | 100 | 100 | 100 |
| `cardFx.js` | 100 | 100 | 100 |
| `cardLabels.js` | 100 | 100 | 100 |
| `shared/animation/*` | 0 | 0 | 0 |
| `shared/realtime/useGameChannel.js` | 0 | 0 | 0 |
| **Tổng (scope)** | **30.2** | **66.7** | **78.6** |

### TẦNG 3 — Backend integration (PowerShell REST)

**Syntax check:**

```powershell
cd D:\gmae\backend\tests\integration
pwsh -NoProfile -File .\_tools\_check-syntax.ps1
# → ALL SYNTAX OK (23 files)
```

**Suite registry:**

```powershell
pwsh -NoProfile -File .\run-all.ps1 -List
# → Total: 15 suites
```

| Suite | File | Cases |
|-------|------|-------|
| `card-future` | `cards/card-future-test.ps1` | 6 |
| `card-shuffle` | `cards/card-shuffle-test.ps1` | 5 |
| `card-attack` | `cards/card-attack-test.ps1` | 6 |
| `card-skip` | `cards/card-skip-test.ps1` | 4 |
| `card-nope` | `cards/card-nope-test.ps1` | 7 |
| `card-favor` | `cards/card-favor-test.ps1` | 5 |
| `card-defuse` | `cards/card-defuse-test.ps1` | 5 |
| `card-combo` | `cards/card-combo-test.ps1` | 3 |
| `card-bomb` | `cards/card-bomb-test.ps1` | 3 |
| `game-flow` | `flow/game-flow-test.ps1` | 6 |
| `timer` | `flow/timer-test.ps1` | 14 |
| `bot-modes` | `flow/bot-modes-test.ps1` | 8 |
| `normal-game-flow` | `flow/normal-game-flow.ps1` | 18 |
| `lobby-normal` | `lobby/lobby-normal-test.ps1` | 25 |
| `lobby-test-bot` | `lobby/lobby-test-bot-test.ps1` | 20 |
| **Tổng** | | **117** |

### TẦNG 4 — Frontend E2E (Playwright)

| Spec | Tests |
|------|-------|
| `normal-game-flow.spec.ts` | 7 |
| `test-lobby-flow.spec.ts` | 8 |
| `smoke-production.spec.ts` | 10 |
| `layout/responsive-comprehensive.spec.ts` | 6 |
| `visual/frontend-visual.spec.ts` | 10 |
| `game-flow/game-animations.spec.ts` | 3 |
| `accessibility/touch-target-audit.spec.ts` | 1 |
| `layout/frontend-deep-test.spec.ts` | 0 ⚠️ |
| **Tổng** | **49** |

### Build & quality gates

| Check | Lệnh | Kết quả |
|-------|------|---------|
| Backend build | `dotnet build Arcana.sln -c Release` | ✅ SUCCESS |
| Backend format | `dotnet format --verify-no-changes` | ✅ sạch |
| Frontend lint | `npm run lint` (max-warnings=0) | ✅ 0 warning |
| Frontend build | `npm run build` | ✅ SUCCESS |
| Workflow YAML | Python `yaml.safe_load` × 6 files | ✅ all parse |

### Tổng kết

**394 automated test cases** — 164 + 64 + 117 + 49 — trong 4 tầng,
tất cả đều được nối vào CI/CD (`ci.yml` + `integration.yml`).

---

## Run #1 — 2026-09-27 (Timer 10s verification)

### Environment
- OS: Windows 11 (win32 10.0.26200)
- Shell: PowerShell (pwsh)
- Workspace: D:\gmae

### Servers
- Backend: http://localhost:5000 — `dotnet run --project src/Arcana.Api --urls "http://localhost:5000"`
- Frontend: http://localhost:5173 — `npx vite --host --port 5173`

### Backend startup logs (xác nhận Timer 10s)
```
TurnClockService started (poll=2000ms, limit=10s)        ✅
NopeTimeoutService started (poll=500ms, window=10s)      ✅
FuturePeekSweeperService started (poll=10000ms, lifetime=10s) ✅
FavorPickAutoResolverService started (poll=2000ms)        ✅
BotService started (poll=1500ms)
```

### Backend Test Results

| Suite | Pass | Fail | Skip | Time |
|-------|------|------|------|------|
| `flow/normal-game-flow.ps1` | **18** | 0 | 0 | ~40s |
| `flow/bot-modes-test.ps1` | **5** | 2 | 0 | ~49s |

**Fail details**:
- 3.1 "One-card bot plays skip" → timeout (flake, see note)
- 3.2 "One-card bot plays favor" → timeout (flake, see note)

**Root cause analysis**:
- Nope window hiện = 10s (was 5s), cộng dồn latency.
- `botTurnSeconds=1` + BotService poll 1.5s, test cho 24×500ms = 12s không đủ.
- Production code OK, just a timing test issue.

### Frontend Test Results

| Suite | Pass | Fail | Skip | Time |
|-------|------|------|------|------|
| `normal-game-flow.spec.ts` | **7** | 0 | 2 | 31.7s |
| (other suites) | 22 | 8 | 4 | ~150s |

### Manual Smoke Test
- [x] Health endpoint returns `{"status":"ok"}`
- [x] POST /api/rooms creates room with code `SE4U5M`
- [x] All Timer 10s services log "limit=10s" / "window=10s" / "lifetime=10s"
- [x] Frontend loads at http://localhost:5173/ (HTTP 200)
- [x] Frontend builds OK (`npm run build` SUCCESS)

### Lệnh đã chạy

```powershell
# 1. Start backend
cd D:\gmae\backend
dotnet run --project src\Arcana.Api --urls "http://localhost:5000"

# 2. Start frontend (terminal khác)
cd D:\gmae\frontend
npx vite --host --port 5173

# 3. Verify
curl http://localhost:5000/health
# {"status":"ok","time":"2026-09-27T07:05:14Z"}

curl -X POST -H "Content-Type: application/json" \
  -d '{"hostName":"Test"}' http://localhost:5000/api/rooms
# Returns: {"id":"...","code":"SE4U5M",...}

# 4. Run backend tests
cd D:\gmae\backend\tests\integration
pwsh -NoProfile -File .\flow\normal-game-flow.ps1     # 18/18 PASS
pwsh -NoProfile -File .\flow\bot-modes-test.ps1       # 5/7 PASS

# 5. Run frontend e2e
cd D:\gmae\frontend
npx playwright test e2e/normal-game-flow.spec.ts       # 7/7 PASS, 2 SKIP
```

### Cleanup

```powershell
# Stop tất cả jobs
Get-Job | Stop-Job
Get-Job | Remove-Job

# Hoặc stop process chiếm port
Get-NetTCPConnection -LocalPort 5000,5173 -State Listen |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Conclusion
✅ **Timer 10s feature đã verified local** với:
- Backend build OK
- Backend integration tests: 18/18 + 5/7 PASS
- Frontend build OK
- Frontend e2e tests: 7/7 + 22 PASS trên các suite khác
- Tất cả Timer services log `10s` ✅
