# Arcana — Card Battle Arena

Nền tảng game thẻ bài trực tuyến nhiều người chơi. Mỗi game là một module độc lập,
chia sẻ chung hạ tầng backend, giao diện phòng chờ, hệ thống âm thanh và cài đặt.

- **Frontend**: HTML, CSS, JavaScript thuần (vanilla, không framework)
- **Backend**: C# .NET (ASP.NET Core), tổ chức theo Clean Architecture
- **Triển khai**: Docker → Render (backend), Netlify (frontend)
- **Tài liệu**: Thiết kế kiến trúc, API, luật chơi nằm trong `docs/`

---

## Cấu trúc thư mục

```
.
├── frontend/
│   └── src/
│       ├── games/                  ← Mỗi game là một module riêng
│       │   └── exploding-cats/     ← Mèo Nổ
│       │       ├── pages/          (landing / room-entry / lobby)
│       │       ├── scripts/        (JS cho từng trang)
│       │       ├── styles/         (CSS cho từng trang)
│       │       └── assets/         (music / sfx / manifest.js)
│       ├── shared/                 ← Code dùng chung giữa các game
│       │   ├── api/                (HTTP client)
│       │   ├── audio/              (AudioManager: music + sfx)
│       │   ├── components/         (SettingsModal, ...)
│       │   ├── i18n/               (đa ngôn ngữ)
│       │   └── styles/             (global tokens, reset)
│       └── config/                 (env.js, local.js, production.js)
├── backend/     # C# .NET (Clean Architecture)
├── infra/       # Dockerfile, scripts
└── docs/        # Tài liệu
```

Để thêm một game mới, copy `games/exploding-cats/` thành `games/<tên-game>/` và đăng ký vào landing hub.

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
# Backend
cd backend
dotnet run --project src/Arcana.Api

# Frontend — serve frontend/src với bất kỳ static server nào
# Ví dụ:
npx serve frontend/src
```

Mở `http://localhost:3000` (hoặc port tùy serve). `env.js` sẽ tự chuyển sang dev mode.

---

## Triển khai

- **Backend**: Render → dùng `render.yaml`, đặt biến môi trường `Firebase__CredentialsBase64`
- **Frontend**: Netlify → dùng `netlify.toml`, publish root = `frontend/src/`
