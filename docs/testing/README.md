# Test Suites

Tổng hợp các tests cho Arcana (backend + frontend).

> 📖 **Tài liệu chính:** [`TEST_SUITE_MATRIX.md`](TEST_SUITE_MATRIX.md) — ma trận
> coverage đầy đủ cho cả 4 tầng kiểm thử (Unit / Integration / E2E / CI-CD),
> mapping test-case ID ↔ suite, cách chạy, và danh sách khoảng trống cần bù.

---

## Cấu trúc kiểm thử

```
backend/tests/
├── unit/Arcana.UnitTests/     ← xUnit: 164 test
└── integration/                ← PowerShell REST: 117 test / 15 suite
    ├── cards/                  ← 9 suite theo lá bài
    ├── flow/                   ← 4 suite game flow / timer / bot
    ├── lobby/                  ← 2 suite lobby (normal + test-bot)
    ├── _tools/                 ← start-dev, rebuild-backend, syntax check
    ├── _lib.ps1                ← 27 helper function dùng chung
    ├── _suites.ps1             ← registry 15 suite (nguồn sự thật duy nhất)
    ├── run-all.ps1             ← orchestrator tuần tự
    └── run-all-parallel.ps1    ← orchestrator song song

frontend/
├── src/__tests__/              ← Vitest + RTL: 64 test
├── e2e/                        ← Playwright: 49 test
└── manual/                     ← 15 script test thủ công
```

---

## Backend unit tests

```powershell
cd backend
dotnet test tests/unit/Arcana.UnitTests/Arcana.UnitTests.csproj
```

| File test | Số test | Phủ |
|-----------|---------|-----|
| `Game/CardCatalogTests.cs` | 94 | Luật bài: deck composition 2–8 người, combo detection |
| `Services/GameServiceTests.cs` | 25 | Start / draw / play / concede / turn / nope window |
| `Infrastructure/RoomSnapshotTests.cs` | 14 | Deep-clone isolation của snapshot |
| `Services/DealingProtocolTests.cs` | 10 | Bomb không vào tay; 1 defuse + 4 action mỗi người |
| `Application/InvitationCodeGeneratorTests.cs` | 25 | Alphabet an toàn, độ dài, tính duy nhất |

---

## Backend integration tests

PowerShell test suites gọi trực tiếp production REST endpoints (`/api/rooms/*`,
`/api/test/*`) để verify gameplay, timer, luật bài, lobby và bot modes.

**Yêu cầu:** PowerShell 7+ và backend đang chạy (`http://localhost:5000`).

```powershell
# Khởi động backend + frontend
pwsh -NoProfile -File backend/tests/integration/_tools/start-dev.ps1

# Chạy tất cả suite (tuần tự)
cd backend/tests/integration
pwsh -NoProfile -File run-all.ps1

# Chạy song song (family "normal" parallel, family "test" tuần tự)
pwsh -NoProfile -File run-all-parallel.ps1 -Throttle 6

# Chạy subset
pwsh -NoProfile -File run-all.ps1 -Only card-future,card-shuffle
pwsh -NoProfile -File run-all.ps1 -Skip card-bomb,game-flow

# Liệt kê suite
pwsh -NoProfile -File run-all.ps1 -List

# Kiểm tra syntax toàn bộ file .ps1
pwsh -NoProfile -File ./_tools/_check-syntax.ps1
```

### Suite theo nhóm

| Nhóm | Suite | Số test | Phủ |
|------|-------|---------|-----|
| **cards/** | `card-future` | 6 | Peek 3 lá, multi-nope, timer 10s |
| | `card-shuffle` | 5 | Đảo deck, double shuffle giữ multiset |
| | `card-attack` | 6 | Attack stack, chain, nope, reset timer |
| | `card-skip` | 4 | Chuyển lượt, bot play, nope |
| | `card-nope` | 7 | Cản từng loại action, multi-nope chain |
| | `card-favor` | 5 | User→bot, bot→user, bot→bot, tay rỗng |
| | `card-defuse` | 5 | Cứu bomb, đặt lại deck, 5 variant, chết khi không defuse |
| | `card-combo` | 3 | 2-same (5 loại), 5-any, hủy pending |
| | `card-bomb` | 3 | Rút bomb → chết, đặt lại deck, người cuối thắng |
| **flow/** | `game-flow` | 6 | Start, turn progression, winner, restart, draw |
| | `timer` | 14 | Luật timer 10s (TC-T1..T12) + edge case |
| | `bot-modes` | 8 | Draw-only / play-cards / one-card bot |
| | `normal-game-flow` | 18 | REST thuần: create/join/ready/kick/start/draw/... |
| **lobby/** | `lobby-normal` | 25 | Lobby thật nhiều người (TC13) |
| | `lobby-test-bot` | 20 | Test Lobby bot modes + timer + defuse (TC14) |

Chi tiết từng suite: [`backend/tests/integration/README.md`](../../backend/tests/integration/README.md).

---

## Frontend unit & component tests

```bash
cd frontend
npm run test            # Vitest + React Testing Library
npm run test:coverage   # kèm báo cáo coverage
npm run test:watch      # watch mode
```

| File test | Số test | Phủ |
|-----------|---------|-----|
| `cardCloudinary.test.js` | 13 | Mapping ảnh Cloudinary + fallback |
| `cardLabels.test.js` | 12 | Nhãn lá bài + map hiệu ứng `CARD_FX` |
| `env.test.js` | 15 | Route table, sessionStorage, event dispatch |
| `SummaryScreen.test.jsx` | 11 | Bảng tổng kết + người thắng |
| `Seats.test.jsx` | 13 | Vị trí ghế, avatar, tương tác |

---

## Frontend E2E tests

```bash
cd frontend
npm run e2e                 # toàn bộ Playwright specs
npm run e2e:headed          # có browser nhìn thấy
npm run e2e:smoke           # chỉ production smoke (read-only)
```

**Yêu cầu:** backend `:5000` + frontend `:5173` đang chạy.

| Spec | Số test | Phủ |
|------|---------|-----|
| `normal-game-flow.spec.ts` | 7 | Landing → lobby, 3 browser context, validation |
| `test-lobby-flow.spec.ts` | 8 | Test Lobby sandbox, race DELETE→create |
| `smoke-production.spec.ts` | 10 | SPA HTML, CORS, health, security headers, 404 sweep |
| `layout/responsive-comprehensive.spec.ts` | 6 | 4 viewport, animation quality, touch target |
| `visual/frontend-visual.spec.ts` | 10 | 5 viewport, contrast, FPS, touch target |
| `game-flow/game-animations.spec.ts` | 3 | Full flow desktop/mobile, frame rate |
| `accessibility/touch-target-audit.spec.ts` | 1 | Audit chi tiết touch target < 44px |

---

## Manual browser tests

`frontend/manual/` chứa 15 script Playwright/Puppeteer-style dùng để test thủ công
nhiều người chơi, motion effect, deep game page:

```bash
cd frontend
node manual/3-player-full-game.js
node manual/motion-effects-test.js
node manual/testlobby-deep-test.js
```

---

## CI/CD

| Workflow | Job | Tầng test |
|----------|-----|-----------|
| `ci.yml` | `backend-build` | Unit backend (164) + coverage |
| `ci.yml` | `backend-lint` | `dotnet format` + grep guard |
| `ci.yml` | `frontend-build` | ESLint + production build |
| `ci.yml` | `frontend-test` | Unit frontend (64) + coverage |
| `ci.yml` | `ci-status` | Gate — chỉ merge khi cả 4 job xanh |
| `integration.yml` | `backend-integration` | Integration REST (117) vs ephemeral server |
| `integration.yml` | `frontend-e2e` | Playwright (49) vs `vite preview` |
| `integration.yml` | `production-smoke` | Production read-only smoke (cron weekly) |

---

## Tài liệu liên quan

| File | Nội dung |
|------|----------|
| [`TEST_SUITE_MATRIX.md`](TEST_SUITE_MATRIX.md) | **Ma trận coverage đầy đủ + test plan** |
| [`TEST_LOBBY_TEST_CASES.md`](TEST_LOBBY_TEST_CASES.md) | Đặc tả chi tiết 25+ test case Test Lobby |
| [`TIMER_10S_SPEC.md`](TIMER_10S_SPEC.md) | Đặc tả luật timer 10 giây |
| [`FRONTEND_TEST_CHECKLIST.md`](FRONTEND_TEST_CHECKLIST.md) | Checklist test frontend thủ công |
| [`LOCAL_TEST_GUIDE.md`](LOCAL_TEST_GUIDE.md) | Hướng dẫn chạy test local từng bước |
| [`LOCAL_TEST_RUN.md`](LOCAL_TEST_RUN.md) | Nhật ký test run gần nhất |
| [`TEST-REPORT.md`](TEST-REPORT.md) | Báo cáo kết quả test |
| [`FINAL_REPORT.md`](FINAL_REPORT.md) | Báo cáo tổng hợp |
