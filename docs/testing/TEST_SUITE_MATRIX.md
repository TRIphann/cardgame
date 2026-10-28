# Arcana — Test Suite Matrix & Test Plan

> **Version:** 1.2 · **Updated:** 2026-10-28
> **Scope:** toàn bộ 4 tầng kiểm thử của dự án Arcana — Card Battle.

Tài liệu này là **nguồn sự thật duy nhất** (single source of truth) mô tả:
- Tất cả các tầng kiểm thử đang tồn tại trong repo.
- Test nào phủ cái gì (mapping tới test-case ID trong `TEST_LOBBY_TEST_CASES.md`).
- Cách chạy từng tầng (local).
- CI/CD nào chạy tầng nào, khi nào.
- Khoảng trống coverage hiện tại và kế hoạch bù.

---

## 1. Tổng quan — 4 tầng kiểm thử

| # | Tầng | Công cụ | Vị trí | Số test | Chạy trong CI | Thời gian |
|---|------|---------|--------|---------|----------------|-----------|
| 1 | **Unit — Backend** | xUnit 2 + coverlet | `backend/tests/unit/Arcana.UnitTests/` | **170** | ✅ `ci.yml` → `backend-build` | ~15s |
| 2 | **Unit / Component — Frontend** | Vitest 2 + React Testing Library | `frontend/src/__tests__/` | **88** | ✅ `ci.yml` → `frontend-test` | ~30s |
| 3 | **Integration — Backend REST** | PowerShell 7 + `Invoke-RestMethod` | `backend/tests/integration/` | **134** (15 suite) | ✅ `integration.yml` → `backend-integration` | ~10 phút |
| 4 | **E2E / Automation — Browser** | Playwright (Chromium) | `frontend/e2e/` | **56** (52 pass + 4 skip) | ✅ `integration.yml` → `frontend-e2e` | ~2.5 phút |
| — | **Manual — Browser** | Puppeteer-style scripts | `frontend/manual/` | 15 script | ❌ (theo yêu cầu, thủ công) | thủ công |

**Tổng automated: ~448 test cases** (170 + 88 + 134 + 56).

> **Kết quả chạy thực tế (28/10/2026):** Backend unit **170/170** ✅ · Frontend unit **88/88** ✅ · Backend integration **15/15 suite** (134 case) ✅ · Playwright E2E **52 passed / 4 skipped** ✅ · ESLint `src` + `e2e` **0 error 0 warning** ✅ · `npm run build` ✅ · `dotnet test` ✅

```
┌──────────────────────────────────────────────────────────────┐
│  CI/CD  (GitHub Actions)                                    │
│  ci.yml            → build + lint + unit tests + coverage   │
│  integration.yml   → live server + REST suites + Playwright │
│  deploy-*.yml      → build & ship only when ci.yml is green │
└───────────────┬──────────────────────────┬───────────────────┘
                │                          │
     ┌──────────▼─────────┐     ┌──────────▼──────────┐
     │  TẦNG 1-2          │     │  TẦNG 3-4           │
     │  Unit / Component  │     │  Integration / E2E  │
     │  (không cần server)│     │  (cần server thật)  │
     └────────────────────┘     └─────────────────────┘
```

---

## 2. Kiến trúc thư mục kiểm thử

```
backend/tests/
├── unit/
│   └── Arcana.UnitTests/          ← xUnit project (đăng ký trong Arcana.sln)
│       ├── Application/           ← InvitationCodeGenerator
│       ├── Game/                  ← CardCatalog (luật bài)
│       ├── Infrastructure/        ← RoomSnapshot (deep-clone)
│       ├── Services/              ← GameService, DealingProtocol
│       └── GlobalUsings.cs
│
└── integration/                   ← PowerShell REST suites
    ├── _lib.ps1                   ← 27 helper functions dùng chung
    ├── _suites.ps1                ← registry 15 suite (nguồn sự thật duy nhất)
    ├── run-all.ps1                ← orchestrator tuần tự
    ├── run-all-parallel.ps1       ← orchestrator song song (2 family)
    ├── cards/                     ← 9 suite theo lá bài
    ├── flow/                      ← 4 suite luồng game / timer / bot
    ├── lobby/                     ← 2 suite lobby (normal + test-bot)
    └── _tools/                    ← script hỗ trợ (syntax check, rebuild, start-dev)

frontend/
├── src/__tests__/                 ← Vitest unit + component tests
│   ├── setup.js                   ← jsdom stubs (matchMedia, AudioContext)
│   ├── cardCloudinary.test.js
│   ├── cardLabels.test.js
│   ├── env.test.js                ← + session patch queue tests
│   ├── coldStartCode.test.js      ← regression 26/10 + 28/10
│   ├── landingProdBugs.test.js
│   ├── Seats.test.jsx
│   └── SummaryScreen.test.jsx
│
├── e2e/                           ← Playwright specs (được lint bằng typescript-eslint)
│   ├── normal-game-flow.spec.ts   ← landing + lobby + multiplayer UI
│   ├── lobby-code-queue.spec.ts   ← regression 28/10 (session queue + code reveal)
│   ├── test-lobby-flow.spec.ts    ← Test Lobby sandbox
│   ├── smoke-production.spec.ts   ← production read-only smoke
│   ├── accessibility/             ← touch-target audit
│   ├── game-flow/                 ← animations & frame rate
│   ├── layout/                    ← responsive, deep layout
│   └── visual/                    ← visual regression
│
└── manual/                        ← 15 script test thủ công (Puppeteer)
```

---

## 3. TẦNG 1 — Backend Unit Tests (xUnit)

**Vị trí:** `backend/tests/unit/Arcana.UnitTests/`
**Lệnh:** `cd backend && dotnet test tests/unit/Arcana.UnitTests/Arcana.UnitTests.csproj`
**Trạng thái:** ✅ **170/170 pass**

### 3.1. Ma trận coverage

| File test | Số test | Lớp production được cover | Nội dung kiểm thử |
|-----------|---------|---------------------------|-------------------|
| `Game/CardCatalogTests.cs` | 94 | `Arcana.Application/CardCatalog` | Deck composition 2–8 người; số lượng từng loại lá; combo detection (2-same / 3-same / 5-any); danh mục lá bài; validate key |
| `Services/GameServiceTests.cs` | 25 | `Arcana.Application/GameService` | Start game; draw; play card; concede; turn advancement; nope window; pending action |
| `Infrastructure/RoomSnapshotTests.cs` | 17 | `Arcana.Infrastructure/RoomSnapshot` | Deep-clone isolation — snapshot trả về không rò rỉ mutable state (Room & GameState); regression guards cho `OneCardBotCardMap` + `PendingTargetPick` |
| `Services/DealingProtocolTests.cs` | 10 | `GameService.StartGameAsync` | **Bomb không bao giờ được chia vào tay**; mỗi người đúng **1 defuse + 4 action**; tổng số lá bất biến |
| `Application/InvitationCodeGeneratorTests.cs` | 25 | `InvitationCodeGenerator` | Alphabet an toàn (loại ký tự nhầm lẫn); độ dài cố định; tính duy nhất |

### 3.2. Bug production được phát hiện bởi tầng này

| # | Bug | Tầng test phát hiện | Fix |
|---|-----|---------------------|-----|
| 1 | Playing **Shuffle** kết thúc lượt người chơi → `403 not_your_turn` | `GameServiceTests` | `QueueNopeWindow(..., skipTurnAdvance: true)` trong `GameService.cs` |
| 2 | **Bomb** bị chia vào tay khởi đầu | `DealingProtocolTests` | Stash bomb ra khỏi deck trước khi chia, chèn lại sau khi chia |
| 3 | Người chơi nhận **nhiều defuse** trong tay đầu | `DealingProtocolTests` | `DealRandomCards()` bỏ qua nhóm defuse khi chia 4 lá action |

### 3.3. Coverage đo được

| Assembly | Line rate | Branch rate |
|----------|-----------|-------------|
| `Arcana.Domain` | **94.0%** | 100% |
| `Arcana.Application` | 36.7% | 35.6% |
| `Arcana.Infrastructure` | 13.8% | 4.4% |
| **Tổng** | **26.6%** | **18.8%** |

> Infrastructure thấp vì Firestore/Cache adapter cần hạ tầng thật — được phủ bởi **tầng 3 (integration)** thay vì unit test.

---

## 4. TẦNG 2 — Frontend Unit & Component Tests (Vitest + RTL)

**Vị trí:** `frontend/src/__tests__/`
**Lệnh:** `cd frontend && npm run test` (hoặc `npm run test:coverage`)
**Trạng thái:** ✅ **88/88 pass** · 7 test files

### 4.1. Ma trận coverage

| File test | Số test | Target | Nội dung kiểm thử |
|-----------|---------|--------|-------------------|
| `cardCloudinary.test.js` | 13 | `src/games/exploding-cats/cardCloudinary.js` | Mapping ảnh Cloudinary; URL fallback; card key chưa map → default art |
| `cardLabels.test.js` | 12 | `src/pages/game/cardLabels.js` | Nhãn hiển thị từng lá; map hiệu ứng (`CARD_FX`) — bao gồm combo variants → `CARD_FX.combo` |
| `env.test.js` | 19 | `src/config/env.js` | Route table; sessionStorage serialize/deserialize; custom event dispatch; API/HUB URL resolution; **session patch queue (FIFO)** — 28/10 prod incident |
| `SummaryScreen.test.jsx` | 11 | `SummaryScreen` component | Render bảng tổng kết; hiển thị người thắng; empty state |
| `Seats.test.jsx` | 13 | `Seats` component | Vị trí ghế theo số người; render avatar; tương tác click |
| `coldStartCode.test.js` | 13 | `src/hooks/useOptimisticRoom.js`, `src/pages/landing/LandingPage.jsx`, `src/pages/lobby/LobbyPage.jsx` | Regression 26/10 + 28/10 — không fake code, console hygiene, rollback về landing, **session patch queue**, background retry |
| `landingProdBugs.test.js` | 7 | `src/pages/landing/` | Regression các bug production đã gặp trên landing page |

### 4.2. Coverage đo được

| Nhóm file | % Stmts | % Branch | % Funcs |
|-----------|---------|----------|---------|
| `src/config/env.js` | 98.8 | 63.6 | 100 |
| `src/games/exploding-cats/cardCloudinary.js` | 100 | 100 | 100 |
| `src/pages/game/cardFx.js` | 100 | 100 | 100 |
| `src/pages/game/cardLabels.js` | 100 | 100 | 100 |
| `src/shared/animation/PageEntryFx.js` | 0 | 0 | 0 |
| `src/shared/animation/useAnimeFx.js` | 0 | 0 | 0 |
| `src/shared/realtime/useGameChannel.js` | 0 | 0 | 0 |
| **Tổng (scope cấu hình)** | **30.2** | **66.7** | **78.6** |

> 3 file 0% là **module side-effect nặng** (anime.js timeline, SignalR connection). Chúng được cover bởi **tầng 4 (Playwright)** — xem §8 khoảng trống.

---

## 5. TẦNG 3 — Backend Integration Tests (PowerShell REST)

**Vị trí:** `backend/tests/integration/`
**Yêu cầu:** PowerShell 7+ (`pwsh`) + backend đang chạy
**Lệnh:**

```powershell
cd backend/tests/integration

# Chạy tất cả (tuần tự)
pwsh -NoProfile -File run-all.ps1

# Chạy song song (2 family: test=tuần tự, normal=parallel)
pwsh -NoProfile -File run-all-parallel.ps1 -Throttle 6

# Chạy subset
pwsh -NoProfile -File run-all.ps1 -Only card-future,card-shuffle
pwsh -NoProfile -File run-all.ps1 -Skip card-bomb,game-flow

# Liệt kê suite
pwsh -NoProfile -File run-all.ps1 -List
```

**Trạng thái:** ✅ **134 test cases** trong **15 suite** — 15/15 PASS (28/10/2026)

### 5.1. Registry suite (nguồn sự thật duy nhất — `_suites.ps1`)

| Suite | File | Family | Timeout | Test case | Mô tả |
|-------|------|--------|---------|-----------|-------|
| `card-future` | `cards/card-future-test.ps1` | test | 20s | 6 | Peek 3 lá, multi-nope, timer 10s, 3× shuffle+peek |
| `card-shuffle` | `cards/card-shuffle-test.ps1` | test | 15s | 5 | Đảo deck, double shuffle giữ multiset, bot shuffle |
| `card-attack` | `cards/card-attack-test.ps1` | test | 35s | 6 | Attack stack, chain, nope, reset timer |
| `card-skip` | `cards/card-skip-test.ps1` | test | 20s | 4 | Chuyển lượt, bot play, nope, timer mới |
| `card-nope` | `cards/card-nope-test.ps1` | test | 25s | 7 | Cản từng loại action, multi-nope chain, bot nope |
| `card-favor` | `cards/card-favor-test.ps1` | test | 25s | 5 | User→bot, bot→user, bot→bot, nope, tay rỗng |
| `card-defuse` | `cards/card-defuse-test.ps1` | test | 45s | 5 | Cứu bomb, đặt lại vào deck slot, 5 variant, chết khi không defuse |
| `card-combo` | `cards/card-combo-test.ps1` | test | 25s | 3 (+5 loop) | 2-same (5 loại), 5-any, hủy pending |
| `card-bomb` | `cards/card-bomb-test.ps1` | test | 70s | 3 | Rút bomb → chết, đặt lại deck, người cuối còn sống thắng |
| `game-flow` | `flow/game-flow-test.ps1` | test | 100s | 6 | Start → playing, turn progression, winner, restart, draw |
| `timer` | `flow/timer-test.ps1` | test | 60s | 14 | Toàn bộ luật timer 10s (TC-T1..T12) + 2 edge case |
| `bot-modes` | `flow/bot-modes-test.ps1` | test | 30s | 8 | Draw-only / play-cards / one-card bot + mixed |
| `normal-game-flow` | `flow/normal-game-flow.ps1` | normal | 20s | 18 | REST thuần: create/join/ready/kick/start/draw/heartbeat/concede/leave/rotate/snapshot |
| `lobby-normal` | `lobby/lobby-normal-test.ps1` | normal | 25s | 25 | Lobby thật nhiều người (TC13) — create, join song song, ready, kick, leave, snapshot consistency |
| `lobby-test-bot` | `lobby/lobby-test-bot-test.ps1` | test | 70s | 20 | Test Lobby bot modes + timer + defuse (TC14) |

> **Tổng: 134 test case** (6+5+6+4+7+5+5+3+3+6+14+7+18+25+20).

> **Family semantics:**
> - `test` = dùng chung phòng `/api/test/room/current` → **phải chạy tuần tự**.
> - `normal` = tự tạo phòng qua `/api/rooms` → **chạy song song được**.

### 5.2. Mapping `TEST_LOBBY_TEST_CASES.md` → suite tự động hoá

| TC trong spec | Mô tả | Suite tự động hoá | Tự động? |
|---------------|-------|--------------------|-----------|
| TC2.2–TC2.7 | Future card | `card-future` | ✅ |
| TC3.2–TC3.6 | Shuffle card | `card-shuffle` | ✅ |
| TC4.2–TC4.7 | Attack card | `card-attack` | ✅ |
| TC5.2–TC5.5 | Skip card | `card-skip` | ✅ |
| TC6.2–TC6.8 | Nope card | `card-nope` | ✅ |
| TC7.2–TC7.6 | Favor card | `card-favor` | ✅ |
| TC8.2–TC8.6 | Defuse card | `card-defuse` | ✅ |
| TC9.2–TC9.7 | Combo card (Ninja/Superman/Zombie/Robot/Hải Tặc) | `card-combo` | ✅ |
| TC10.2–TC10.4 | Bomb card | `card-bomb` | ✅ |
| TC11.1–TC11.3 | Draw card | `game-flow` | ✅ |
| TC12.1–TC12.4 | Game flow | `game-flow` | ✅ |
| TC-T1..TC-T12 | Timer 10 giây | `timer` | ✅ |
| EC-T1, EC-T5 | Edge case timer | `timer` | ✅ |
| TC13 (N.1–N.25) | Lobby normal | `lobby-normal` | ✅ |
| TC14 (T.1–T.20) | Test Lobby bot | `lobby-test-bot` | ✅ |

### 5.3. Helper library (`_lib.ps1`) — 27 function

| Nhóm | Function |
|------|----------|
| Test harness | `Run-Test`, `Print-Summary` |
| Room setup | `New-TestRoom`, `Reset-TestRoom`, `Start-TestGame` |
| Read state | `Get-Snap`, `Get-GS`, `Get-TestSnap`, `Wait-Snap`, `Wait-Idle`, `Wait-NopeResolve` |
| Query helpers | `Get-Bots`, `Get-Host`, `Get-HandCount`, `Get-HandOf`, `Get-MyHand`, `Get-HandCountMap` |
| Deck / discard | `Get-DeckList`, `Get-DeckTop`, `Get-DiscardPile`, `Test-DiscardHas` |
| Turn helpers | `Get-CurrentTurnId`, `Get-CounterTotal`, `Advance-Turn`, `Invoke-Status` |
| Misc | `Find-PlayerWithCard` |

### 5.4. Bug production được phát hiện bởi tầng này

| # | Bug | Suite phát hiện |
|---|-----|----------------|
| 1 | `GameState` thiếu `OneCardBotCardMap` (compile error) | `normal-game-flow` |
| 2 | `GameService.StartGameAsync` thiếu tham số `oneCardBotCardMap` | `normal-game-flow` |
| 3 | `GameService.PrimaryRepository` luôn ưu tiên test repo cho production room → `room_not_found` | `normal-game-flow` |
| 4 | `CachedRoomRepository` cache stale pre-write → member mới / member bị kick biến mất khỏi snapshot | `normal-game-flow` |
| 5 | `FirestoreRoomRepository.RemoveMemberAsync` không filter member đã bị xoá → endpoint trả về victim còn trong room | `normal-game-flow` |
| 6 | `FuturePeekSweeperService` ghi Firestore cho phòng Test Lobby → `DocumentNotFound` + log spam | `card-future` |
| 7 | **`PendingTargetPick` bị drop ở cả 3 clone helper** → Favor phase-1 timeout không bao giờ fire, phòng kẹt vĩnh viễn | `timer` (TC-T6) |
| 8 | **Favor phase 1 không set `PendingTargetPick`** → không có timeout 10s phía server, actor bỏ tab là treo cả phòng | `timer` (TC-T6) |
| 9 | **Session patch không serialize** → write PENDING đè lên write REAL, lobby kẹt "••••••" (prod 28/10) | `env.test.js` + `lobby-code-queue.spec.ts` |
| 10 | **React StrictMode double-invoke** chặn `GamePage` fetch snapshot → game page kẹt "Đang tải ván chơi…" | `normal-game-flow.spec.ts` (2.1) |
| 11 | **143 touch target < 44×44px** (thiếu `flex-shrink: 0`, thiếu `min-height`) → vi phạm WCAG 2.5.5 | `visual/frontend-visual.spec.ts` (a11y) |
| 12 | **HEAD request không gửi `Content-Type`** → mỗi poll/snapshot kích hoạt CORS preflight, tăng độ trễ & rủi ro block ở production | `env.test.js` |

---

## 6. TẦNG 4 — E2E / Automation Tests (Playwright)

**Vị trí:** `frontend/e2e/`
**Yêu cầu:** backend `:5000` + frontend `:5173` đang chạy
**Lệnh:**

```bash
cd frontend
npm run e2e                 # toàn bộ
npm run e2e:headed          # có browser nhìn thấy
npm run e2e:smoke           # chỉ production smoke
npx playwright test e2e/normal-game-flow.spec.ts   # 1 file
```

**Trạng thái:** ✅ **56 test** trong **8 spec file** — 52 passed / 4 skipped (28/10/2026)

### 6.1. Ma trận coverage

| Spec file | Số test | Phủ | Ghi chú |
|-----------|---------|-----|---------|
| `normal-game-flow.spec.ts` | 9 | Landing form → lobby; invite code reveal; **3 browser context** host+2 joiner; game page render; validation form; link Test Lobby | 2 test game-page bị skip (cần SignalR ổn định trong headless) |
| `test-lobby-flow.spec.ts` | 8 | `/test` load; POST/DELETE room; empty hostName reject; race DELETE→create; snapshot; tab Bài/Deck/Bot; tạo room < 3s | Test Lobby sandbox |
| `smoke-production.spec.ts` | 10 | SPA HTML; asset 404 sweep; `/health`; CORS preflight; `/test` route; fonts; SPA fallback; uptime; security headers (CSP, X-Frame-Options); debug endpoint 404 | **Read-only** — an toàn chạy trên production |
| `layout/responsive-comprehensive.spec.ts` | 10 | 4 viewport (375×667 → 1920×1080); page entry fade; hover; counter buttons; toggle states; no-overlap; game board scale | Touch target ≥ 44×44px |
| `visual/frontend-visual.spec.ts` | 11 | Desktop / Tablet / Mobile / 360px / 2560px; draw animation; landscape mobile; contrast ratio; FPS; touch target; game page | Visual + a11y |
| `game-flow/game-animations.spec.ts` | 3 | Full flow desktop 1920×1080; responsive mobile 375×667; frame-rate check | Chromium flags chống throttle |
| `accessibility/touch-target-audit.spec.ts` | 1 | Liệt kê chi tiết mọi touch target < 44px | Báo cáo, không fail |
| `lobby-code-queue.spec.ts` | 4 | Regression 28/10 — eye-toggle hiện mã phòng thật; PENDING state không hiện code giả; **session patch queue** (last write wins); handover pending → real | Copy button phải enable khi có mã thật |

> `layout/frontend-deep-test.spec.ts` tồn tại nhưng **0 test case** (placeholder) → xem §8 khoảng trống #3.

### 6.2. Chiến lược chia tầng

```
Playwright KHÔNG test mọi thứ — mỗi tầng có trách nhiệm riêng:

Tầng 3 (REST)  → chứng minh GAMEPLAY đúng (state mutation, timer, luật bài)
Tầng 4 (Browser) → chứng minh UI ĐÚNG (render, layout, animation, a11y)

Cùng một luật game KHÔNG bị test lặp ở cả 2 tầng (trừ khi UI che mất state
mà REST không expose — ví dụ animation, touch target, CORS).
```

---

## 7. CI/CD — Workflow map

### 7.1. `.github/workflows/ci.yml` — chạy mỗi push/PR

| Job | Nội dung | Tầng test | Trigger path |
|-----|----------|-----------|--------------|
| `backend-build` | `dotnet restore` → `build -c Release` → `dotnet test` (tất cả `*.UnitTests.csproj`) + coverage | **TẦNG 1** | `backend/**` |
| `backend-lint` | `dotnet format --verify-no-changes` + grep chặn `Console.WriteLine`/TODO/FIXME | — | `backend/**` |
| `frontend-build` | `npm ci` → `npm run lint` (max-warnings=0) → **`npm run lint:e2e`** → `npm run build` + verify `dist/` | — | `frontend/src/**` |
| `frontend-test` | `npm run test:coverage` (Vitest) + upload coverage | **TẦNG 2** | `frontend/src/**` |
| `ci-status` | Gate — chỉ merge khi cả 4 job xanh | — | — |

**Coverage upload:** Codecov v4 (`backend/coverage` + `frontend/coverage`), artifact `*.trx` / `html` / `lcov` giữ 7 ngày.

### 7.2. `.github/workflows/integration.yml` — cần server thật

| Job | Nội dung | Tầng test |
|-----|----------|-----------|
| `backend-integration` | Dựng .NET API ephemeral (in-memory repo, **không** tốn Firestore quota) → 3 step: `normal-game-flow` → `bot-modes` → `run-all.ps1` fast suites → `run-all.ps1` slow suites (game-flow/card-bomb/timer/lobby-test-bot) | **TẦNG 3** |
| `frontend-e2e` | `npm run lint:e2e` → `npm run build` → `vite preview :4173` → `npx playwright test` (reporter list/html/junit) | **TẦNG 4** |
| `production-smoke` | Chỉ `e2e/smoke-production.spec.ts` — read-only, an toàn trên prod | **TẦNG 4 (subset)** |
| `summary` | Gate — fail nếu backend-integration hoặc frontend-e2e fail | — |

**Target:** `workflow_dispatch` chọn `ephemeral` / `staging` / `production-smoke`; cron **weekly Sunday 02:00 UTC** chạy production smoke.

### 7.3. Workflow khác

| File | Mục đích |
|------|----------|
| `codeql.yml` | Quét bảo mật tự động (C# + JS) |
| `deploy-backend.yml` | Deploy backend lên Render — `needs: ci.yml` |
| `deploy-frontend.yml` | Deploy frontend lên Netlify — `needs: ci.yml` |
| `release.yml` | Tạo GitHub Release |

### 7.4. Ma trận trigger × tầng test

| Tầng | `ci.yml` | `integration.yml` | Khi nào chạy |
|------|----------|-------------------|---------------|
| Unit backend | ✅ | ❌ | Mọi push/PR chạm `backend/**` |
| Unit frontend | ✅ | ❌ | Mọi push/PR chạm `frontend/src/**` |
| Integration REST | ❌ | ✅ | Push/PR chạm `backend/**` hoặc `backend/tests/**` |
| E2E Playwright | ❌ | ✅ | Push/PR chạm `frontend/src/**` hoặc `frontend/e2e/**` |
| Production smoke | ❌ | ✅ (cron) | Chủ nhật 02:00 UTC + dispatch tay |

---

## 8. Khoảng trống coverage & kế hoạch bù

| # | Khoảng trống | Mức độ | Kế hoạch |
|---|---------------|--------|----------|
| 1 | `src/shared/realtime/useGameChannel.js` — 0% unit | Trung bình | Tách phần logic thuần (retry/backoff, event dedupe) ra module riêng để unit test được |
| 2 | `src/shared/animation/useAnimeFx.js`, `PageEntryFx.js` — 0% unit | Thấp | Đã cover gián tiếp qua Playwright animation specs; không cần unit test |
| 3 | `layout/frontend-deep-test.spec.ts` — 0 test case | Trung bình | Bổ sung spec deep-layout cho game page (hand arc, fan, hover, combo panel) |
| 4 | `Arcana.Infrastructure` — 13.8% line coverage | Cao | Unit test adapter với mock Firestore client; hiện đang cover bằng integration |
| 5 | `Arcana.Application` — 36.7% line coverage | Trung bình | Thêm test cho `RoomService`, `CardCatalog` edge-case |
| 6 | `Arcana.Api` — chưa có unit test project | Trung bình | Tạo `Arcana.Api.Tests` cho controller validation + authorization |
| 7 | SignalR realtime không được assert trong headless | Trung bình | Cần test hub bằng `Microsoft.AspNetCore.SignalR.Client` trong integration |
| 8 | Load / performance test | Thấp | Dùng Postman collection + k6 cho API |

---

## 9. Chạy toàn bộ kiểm thử local

### 9.1. Yêu cầu

```powershell
# .NET 8 SDK
dotnet --version          # 8.x

# Node 20 LTS
node --version            # v20.x

# PowerShell 7
pwsh --version            # 7.x

# Playwright browsers (1 lần)
cd frontend; npx playwright install chromium
```

### 9.2. Bước 1 — Khởi động server

```powershell
# Chạy backend + frontend cùng lúc (đợi cả hai sẵn sàng)
pwsh -NoProfile -File backend/tests/integration/_tools/start-dev.ps1

# Hoặc chạy riêng từng server
cd backend; dotnet run --project src/Arcana.Api --urls "http://localhost:5000"
cd frontend; npm run dev
```

### 9.3. Bước 2 — Chạy từng tầng

```powershell
# TẦNG 1 — Backend unit
cd backend; dotnet test tests/unit/Arcana.UnitTests/Arcana.UnitTests.csproj

# TẦNG 2 — Frontend unit/component
cd frontend; npm run test

# TẦNG 3 — Backend integration (cần server :5000)
cd backend/tests/integration
pwsh -NoProfile -File run-all.ps1                        # tuần tự
pwsh -NoProfile -File run-all-parallel.ps1 -Throttle 6   # song song

# TẦNG 4 — Frontend E2E (cần server :5000 + :5173)
cd frontend; npm run e2e
```

### 9.4. Kiểm tra syntax toàn bộ PowerShell

```powershell
cd backend/tests/integration
pwsh -NoProfile -File ./_tools/_check-syntax.ps1
```

### 9.5. Tạo lại card artwork (tuỳ chọn)

`img/` bị `.gitignore` — asset là **build input** được upload lên Cloudinary:

```powershell
cd img/tools
node generate-cards.js          # sinh SVG vào img/cards/
pwsh upload-cards.ps1           # upload lên Cloudinary
```

---

## 10. Quy tắc viết test

### 10.1. Backend integration (PowerShell)

1. Copy file `cards/*-test.ps1` làm mẫu.
2. Source helper: `. "$PSScriptRoot\..\_lib.ps1"`.
3. Mỗi test = 1 khối `Run-Test "mô tả" { ... }`.
4. Luôn kết thúc file bằng `Print-Summary` (set exit code).
5. Reset phòng giữa các test: `Reset-TestRoom`.
6. Chờ state change bằng `Wait-Snap` + predicate, **không** dùng `Start-Sleep`.
7. Đăng ký suite mới vào `_suites.ps1` (bắt buộc — cả 2 orchestrator đọc file này).

### 10.2. Frontend unit (Vitest)

1. Đặt file trong `frontend/src/__tests__/`.
2. Tên file `*.test.js` / `*.test.jsx`.
3. Dùng alias sẵn có: `@shared`, `@config`, `@games`, `@pages`, `@assets`.
4. Component test dùng `@testing-library/react` + `user-event`.

### 10.3. E2E (Playwright)

1. Đặt theo nhóm: `accessibility/`, `game-flow/`, `layout/`, `visual/`.
2. Luôn dùng `waitForFunction` / `expect(...).toBeVisible({ timeout })` thay vì `waitForTimeout` cứng.
3. Test production-smoke **phải read-only** — không tạo/ghi Firestore.
4. Cập nhật `playwright.config.ts` nếu thêm project (hiện: chromium, workers=1, retries=1).

---

## 11. Checklist trước khi merge

- [ ] `dotnet test` — 170/170 xanh
- [ ] `npm run test` — 88/88 xanh
- [ ] `npm run lint` — 0 warning
- [ ] `npm run lint:e2e` — 0 warning (Playwright specs cũng được lint)
- [ ] `npm run build` — thành công
- [ ] `_check-syntax.ps1` — `ALL SYNTAX OK`
- [ ] `run-all.ps1` — 15/15 suite xanh (nếu thay đổi backend logic)
- [ ] `npm run e2e` — 52 pass / 4 skip (nếu thay đổi UI flow)
- [ ] Workflow YAML vẫn parse được
- [ ] Tài liệu trong `docs/testing/` đã cập nhật

> ⚠️ **Lưu ý về `dotnet format`:** job `backend-lint` trong `ci.yml` đang **fail sẵn từ 25/10** (trước các thay đổi hiện tại) vì `dotnet format --severity info` muốn chuyển hàng loạt class sang *primary constructor* style — kể cả những file không liên quan (`BotService.cs`, `ActiveTestRoom.cs`, `FirestoreRoomRepository.cs`…). Vấn đề này **không phải do code mới**. Cần một PR riêng để:
> 1. Thêm `.editorconfig` với `dotnet_diagnostic.IDE0290.severity = none` (tắt primary-constructor style), **hoặc**
> 2. Chạy `dotnet format` toàn repo một lần và commit kết quả.
>
> Deploy **không bị chặn** bởi job này: `deploy-backend.yml` chỉ cần job `validate` (build + validate `render.yaml`), còn `deploy-frontend.yml` kế thừa từ Netlify git integration.

---

## 12. Tài liệu liên quan

| File | Nội dung |
|------|----------|
| `docs/testing/TEST_LOBBY_TEST_CASES.md` | Đặc tả chi tiết 25+ test case của Test Lobby (bản gốc, ~3.700 dòng) |
| `docs/testing/TIMER_10S_SPEC.md` | Đặc tả luật timer 10 giây |
| `docs/testing/FRONTEND_TEST_CHECKLIST.md` | Checklist test frontend thủ công |
| `docs/testing/LOCAL_TEST_GUIDE.md` | Hướng dẫn chạy test local từng bước |
| `docs/testing/LOCAL_TEST_RUN.md` | Nhật ký test run gần nhất |
| `docs/testing/TEST-REPORT.md` | Báo cáo kết quả test |
| `docs/testing/FINAL_REPORT.md` | Báo cáo tổng hợp |
| `docs/testing/ANIMATION_ENHANCEMENTS.md` | Ghi chú về animation enhancement |
| `backend/tests/integration/README.md` | Hướng dẫn riêng cho backend integration suite |
| `docs/CHANGELOG.md` | Lịch sử thay đổi |
