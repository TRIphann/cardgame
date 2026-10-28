# Arcana — Card Battle Arena

Game thẻ bài trực tuyến nhiều người chơi (hiện tại: Mèo Nổ / Exploding Kittens).
Tạo phòng → chia sẻ mã 6 ký tự → chơi realtime qua SignalR + REST fallback.

- **Frontend**: React 18 + Vite (SPA) → deploy Netlify
- **Backend**: ASP.NET Core 8, Clean Architecture → deploy Render (Docker)
- **Realtime**: SignalR (`/hubs/game`) + polling fallback
- **Dữ liệu**: Firestore (prod) / InMemory (dev-test), Redis (giữ mã phòng)

---

## Chạy local

```bash
# Backend — http://localhost:5000
cd backend
dotnet run --project src/Arcana.Api

# Frontend — http://localhost:5173 (proxy /api → :5000 qua vite.config.js)
cd frontend
npm install
npm run dev
```

Chạy cả hai cùng lúc (PowerShell):

```powershell
pwsh -NoProfile -File backend/tests/integration/_tools/start-dev.ps1
```

Backend local dùng `backend/src/Arcana.Api/appsettings.json` (CORS đã gồm
`localhost:5173`, Firestore/InMemory theo cấu hình).

---

## Cấu trúc

```
backend/
  src/
    Arcana.Domain/          Entities, value objects, enums
    Arcana.Application/     Use cases, services, abstractions
    Arcana.Infrastructure/  Firestore / Redis / repositories / bot
    Arcana.Api/             Controllers, SignalR hub, hosted services
    Arcana.Shared/          Contracts, errors, constants
  tests/
    unit/                   xUnit unit tests
    integration/            PowerShell REST suites (cards / flow / lobby / timer)

frontend/
  src/
    app/                    Bootstrap, router
    pages/                  landing / lobby / game / test (Test Lobby, DEV only)
    games/exploding-cats/   Luật + UI riêng của game Mèo Nổ
    components/             UI dùng chung
    shared/                 api, audio, i18n, realtime, ui
    hooks/                  useOptimisticRoom, useRoomPolling, useDeckAnimation…
    __tests__/              Vitest unit + component tests
  e2e/                      Playwright specs
  manual/                   Script test trình duyệt thủ công

docs/                       Kiến trúc, API, luật chơi, báo cáo test
```

Thêm game mới: copy `frontend/src/games/exploding-cats/` thành
`frontend/src/games/<ten-game>/` rồi đăng ký vào landing hub.

---

## Kiểm thử

Chi tiết 4 tầng: [`docs/testing/TEST_SUITE_MATRIX.md`](docs/testing/TEST_SUITE_MATRIX.md).

| Tầng | Lệnh | Ghi chú |
|------|------|---------|
| Backend unit (xUnit) | `cd backend && dotnet test tests/unit/Arcana.UnitTests/` | Không cần server |
| Backend integration (REST) | `cd backend/tests/integration && pwsh -File run-all.ps1` | Cần API ở `:5000` |
| Frontend unit (Vitest) | `cd frontend && npm test` | 7 files, 77 tests |
| Lint | `cd frontend && npm run lint` | ESLint, zero-warning |
| E2E (Playwright) | `cd frontend && npm run e2e` | Cần `:5000` + `:5173` |
| Smoke production | `cd frontend && npm run e2e:smoke` | Chạy với site live |

CI (`.github/workflows/`): `ci.yml` (unit + lint + build),
`integration.yml` (integration + E2E + smoke).

---

## Deploy

- **Backend (Render)**: blueprint `render.yaml` — Docker build từ
  `backend/Dockerfile`, health check `/health`. Biến môi trường quan trọng:
  `Cors__AllowedOrigins__*`, `Firebase__ProjectId`, `Firebase__CredentialsBase64`.
- **Frontend (Netlify)**: config `netlify.toml` — build `frontend/`,
  publish `dist`. `VITE_API_BASE_URL` / `VITE_API_HUB_URL` trỏ về
  `https://cardgame-lwsk.onrender.com`.

> Lưu ý cold-start: Render free-tier sleep sau ~15 phút idle nên request đầu
> có thể mất 30–60s. Frontend tự race 1.5s rồi hiện trạng thái
> "Đang khởi tạo phòng…", patch mã phòng thật khi response về — không bao giờ
> hiển thị/copy mã giả (regression test: `coldStartCode.test.js`).

---

## Trạng thái

| Module | Trạng thái |
|---|---|
| Backend + Firestore trên Render | ✅ |
| Landing / tạo-vào phòng | ✅ |
| Lobby 8 người + Test Lobby (DEV) | ✅ |
| Game Mèo Nổ (bài, combo, Nope, bot) | ✅ |
| Âm thanh + i18n (VI) + avatar | ✅ |
