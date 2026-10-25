# Arcana — Backend Integration Tests

PowerShell test suites covering every card in the game plus lobby, bot modes,
and game-flow scenarios. All suites are designed to run against the local
backend (default `http://localhost:5000`) but can target staging / production
via the `ARCANA_API_BASE_URL` env var.

> 📖 Ma trận coverage đầy đủ (kèm mapping TC-ID ↔ suite): [`docs/testing/TEST_SUITE_MATRIX.md`](../../../docs/testing/TEST_SUITE_MATRIX.md)

## Prerequisites

- PowerShell 7+ (pwsh)
- Backend running and reachable on `$api` (default `http://localhost:5000`)

## Quick start

```powershell
# Khởi động backend + frontend (helper dùng chung)
pwsh -NoProfile -File ./_tools/start-dev.ps1

# Run all suites
pwsh -NoProfile -File run-all.ps1

# Run specific suites
pwsh -NoProfile -File run-all.ps1 -Only card-future,card-shuffle

# Skip a suite
pwsh -NoProfile -File run-all.ps1 -Skip card-bomb,game-flow

# Run in parallel (family "normal" parallel, family "test" sequential)
pwsh -NoProfile -File run-all-parallel.ps1 -Throttle 6

# List suites and exit
pwsh -NoProfile -File run-all.ps1 -List

# Override backend URL
$env:ARCANA_API_BASE_URL = "https://staging.example.com"
pwsh -NoProfile -File run-all.ps1
```

## Layout

```
integration/
├── _lib.ps1                 ← 27 helper functions (Run-Test, New-TestRoom, Wait-Snap, ...)
├── _suites.ps1              ← registry 15 suite — nguồn sự thật duy nhất
├── run-all.ps1              ← orchestrator tuần tự
├── run-all-parallel.ps1     ← orchestrator song song
├── cards/                   ← 9 suite theo lá bài
├── flow/                    ← 4 suite game flow / timer / bot
├── lobby/                   ← 2 suite lobby
└── _tools/                  ← start-dev, rebuild-backend, _check-syntax, _parse-check
```

> **Quan trọng:** cả `run-all.ps1` và `run-all-parallel.ps1` đều đọc danh sách
> suite từ `_suites.ps1`. Khi thêm suite mới, **phải** đăng ký vào file này —
> nếu không orchestrator sẽ không bao giờ chạy nó.

## Suites

| Suite | File | Covers | Cases | Speed |
|-------|------|--------|-------|-------|
| `card-future` | `cards/card-future-test.ps1` | Peek 3, multi-nope, 10s timer | 6 | fast (~20s) |
| `card-shuffle` | `cards/card-shuffle-test.ps1` | Deck reorder, double shuffle, bot shuffle | 5 | fast (~15s) |
| `card-attack` | `cards/card-attack-test.ps1` | Attack stack, chain, nope, timer reset | 6 | medium (~35s) |
| `card-skip` | `cards/card-skip-test.ps1` | Turn advance, bot play, nope, fresh timer | 4 | fast (~20s) |
| `card-nope` | `cards/card-nope-test.ps1` | Cancel each action type, multi-nope chain | 7 | medium (~25s) |
| `card-favor` | `cards/card-favor-test.ps1` | User→bot, bot→user, bot→bot, nope, empty hand | 5 | medium (~25s) |
| `card-defuse` | `cards/card-defuse-test.ps1` | Bomb placement, 5 variants, no-defuse death | 5 | slow (~45s) |
| `card-combo` | `cards/card-combo-test.ps1` | 2-same (5 types), 5-any, cancel | 3 | medium (~25s) |
| `card-bomb` | `cards/card-bomb-test.ps1` | Bomb draw, placement, game over | 3 | slow (~70s) |
| `game-flow` | `flow/game-flow-test.ps1` | Start, turn, winner, restart, normal draw | 6 | very slow (~100s) |
| `timer` | `flow/timer-test.ps1` | 10s turn timer rule (TC-T1..T12 + edge cases) | 14 | slow (~60s) |
| `bot-modes` | `flow/bot-modes-test.ps1` | Draw-only / play-cards / one-card bot modes | 8 | medium (~30s) |
| `normal-game-flow` | `flow/normal-game-flow.ps1` | Room lifecycle: create/join/ready/kick/start/leave/rotate | 18 | fast (~20s) |
| `lobby-normal` | `lobby/lobby-normal-test.ps1` | Multi-tab real-user lobby flow (TC13) | 25 | fast (~25s) |
| `lobby-test-bot` | `lobby/lobby-test-bot-test.ps1` | Test lobby bot modes + timer + defuse (TC14) | 20 | slow (~70s) |

**Tổng: 117 test cases / 15 suites.**

### Family isolation

| Family | Endpoint used | Concurrency |
|--------|---------------|-------------|
| `test` | Shared `/api/test/room/current` | **Phải chạy tuần tự** — các suite dùng chung 1 phòng |
| `normal` | Self-created rooms via `/api/rooms` | **Chạy song song được** — state độc lập |

`run-all-parallel.ps1` tự động tách 2 family: family `normal` chạy qua
ThreadJob song song, family `test` chạy tuần tự inline. Dùng `-NoIsolate` để
bỏ qua tách biệt (không khuyến nghị).

## CI integration

These suites run automatically in GitHub Actions via
`.github/workflows/integration.yml`. The CI workflow:

1. Spins up an ephemeral .NET API backend (in-memory repo, no Firestore quota).
2. Runs `normal-game-flow` and `bot-modes` as dedicated steps.
3. Runs all remaining fast suites via `run-all.ps1`.
4. Runs long suites (`game-flow`, `card-bomb`, `timer`, `lobby-test-bot`) separately.
5. On failure, backend log is uploaded as an artifact.

## Writing a new suite

1. Copy any existing `cards/*-test.ps1` as a template.
2. Source the shared helpers at the top:
   ```powershell
   . "$PSScriptRoot\..\_lib.ps1"
   ```
3. Use `Run-Test "description" { ... }` blocks — each block is one test.
4. Available helpers: `New-TestRoom`, `Start-TestGame`, `Get-Snap`,
   `Wait-Snap`, `Get-Bots`, `Get-Host`, `Print-Summary`.
5. End the file with `Print-Summary` to print results and set exit code.
6. **Register the suite in `_suites.ps1`** — otherwise it will never run.
7. Run `./_tools/_check-syntax.ps1` before pushing.

## Tips

- Use `DisableBotService = $true` if you want full manual control over the game.
- Use `botTurnSeconds = 0` for instant bot moves, `1` for one-second delay.
- `customDeck` accepts the exact card order — useful for forcing bomb draws.
- Always `Reset-TestRoom` between tests for a clean member set.
- For tests that wait for state changes, prefer `Wait-Snap` with a predicate
  rather than `Start-Sleep` (faster + more reliable).
