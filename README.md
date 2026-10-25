# Arcana — Card Battle Arena

Nền tảng game thẻ bài trực tuyến nhiều người chơi. Mỗi game là một module độc lập,
chia sẻ chung hạ tầng backend, giao diện phòng chờ, hệ thống âm thanh và cài đặt.

- **Frontend**: React 18 + Vite (SPA)
- **Backend**: C# .NET 8 (ASP.NET Core), tổ chức theo Clean Architecture
- **Triển khai**: Docker → Render (backend), Netlify (frontend)
- **Tài liệu**: Thiết kế kiến trúc, API, luật chơi nằm trong `docs/`

---

## Cấu trúc thư mục

```
.
├── backend/                  ← ASP.NET Core 8 (Clean Architecture)
│   ├── src/
│   │   ├── Arcana.Domain/          ← Entities, value objects, enums
│   │   ├── Arcana.Application/     ← Use cases, services, abstractions
│   │   ├── Arcana.Infrastructure/  ← Firestore, Redis, repositories
│   │   ├── Arcana.Api/             ← Controllers, hubs, hosted services
│   │   └── Arcana.Shared/          ← Contracts, errors, constants
│   ├── tests/
│   │   ├── unit/Arcana.UnitTests/  ← xUnit unit tests (164 test)
│   │   └── integration/            ← PowerShell REST integration suites (117 test)
│   ├── Dockerfile
│   └── Arcana.sln
│
├── frontend/                 ← React SPA (Vite)
│   ├── src/
│   │   ├── app/                     ← Bootstrap, router
│   │   ├── pages/                   ← landing / lobby / game / test
│   │   ├── components/              ← Shared UI components
│   │   ├── shared/                  ← api, audio, i18n, realtime, ui
│   │   ├── games/                   ← Mỗi game là một module riêng
│   │   ├── assets/                  ← Card art, FX, glyphs
│   │   ├── hooks/                   ← Custom hooks
│   │   ├── styles/                  ← Global CSS tokens
│   │   └── __tests__/               ← Vitest unit + component tests (64 test)
│   ├── e2e/                        ← Playwright E2E specs (49 test)
│   ├── manual/                     ← Manual browser test scripts
│   └── package.json
│
├── docs/                     ← Tài liệu (API, kiến trúc, testing)
├── img/                      ← Card artwork + tooling (gitignored, upload lên Cloudinary)
├── .github/                  ← CI/CD workflows, templates
│
├── .gitignore
├── .dockerignore
├── netlify.toml              ← Netlify build config (frontend)
├── render.yaml               ← Render blueprint (backend + Redis)
└── README.md
```

Để thêm một game mới, copy `frontend/src/games/exploding-cats/` thành
`frontend/src/games/<tên-game>/` và đăng ký vào landing hub.

---

## Trạng thái hiện tại

| Module | Trạng thái |
|---|---|
| Backend ASP.NET Core + Firestore | ✅ Triển khai trên Render |
| Frontend Landing hub | ✅ |
| Frontend Room Entry (tạo/vào phòng) | ✅ |
| Frontend Lobby 8 người | ✅ |
| Audio system (nhạc nền + SFX) | ✅ |
| Settings (volume, ngôn ngữ) | ✅ (chỉ Tiếng Việt) |
| Game logic Mèo Nổ | 🚧 Sắp tới |
| Avatar chọn hình | 🚧 Sắp tới |

---

## Phát triển local

```bash
# Backend — http://localhost:5000
cd backend
dotnet run --project src/Arcana.Api

# Frontend — http://localhost:5173
cd frontend
npm install
npm run dev
```

Hoặc chạy cả hai cùng lúc:

```powershell
pwsh -NoProfile -File backend/tests/integration/_tools/start-dev.ps1
```

---

## Kiểm thử

Toàn bộ kiến trúc kiểm thử (4 tầng) được mô tả chi tiết tại
[`docs/testing/TEST_SUITE_MATRIX.md`](docs/testing/TEST_SUITE_MATRIX.md).

| Tầng | Công cụ | Lệnh | Số test |
|------|---------|------|---------|
| Unit — Backend | xUnit | `cd backend && dotnet test tests/unit/Arcana.UnitTests/Arcana.UnitTests.csproj` | 164 |
| Unit / Component — Frontend | Vitest + RTL | `cd frontend && npm run test` | 64 |
| Integration — Backend REST | PowerShell 7 | `cd backend/tests/integration && pwsh -File run-all.ps1` | 117 |
| E2E / Automation — Browser | Playwright | `cd frontend && npm run e2e` | 49 |

```powershell
# Backend integration (REST, PowerShell) — cần server :5000 đang chạy
cd backend/tests/integration
pwsh -NoProfile -File run-all.ps1
pwsh -NoProfile -File run-all-parallel.ps1 -Throttle 6   # chạy song song

# Frontend E2E (Playwright) — cần server :5000 + :5173
cd frontend
npm run e2e
```

CI/CD (`.github/workflows/`) tự động chạy tất cả 4 tầng:

- `ci.yml` → backend unit + lint, frontend unit + lint + build
- `integration.yml` → backend integration (ephemeral server) + Playwright E2E + production smoke

---

## Triển khai

- **Backend**: Render → dùng `render.yaml`, đặt biến môi trường `Firebase__CredentialsBase64`
- **Frontend**: Netlify → dùng `netlify.toml`, publish root = `frontend/dist`
