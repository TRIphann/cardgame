# Arcana — Card Battle

Dự án game thẻ bài trực tuyến nhiều người chơi.

- **Frontend**: HTML, CSS, JavaScript thuần (vanilla, không framework)
- **Backend**: C# .NET (ASP.NET Core), tổ chức theo Clean Architecture
- **Triển khai**: Docker, script vận hành nằm trong `infra/`
- **Tài liệu**: Thiết kế kiến trúc, API, luật chơi nằm trong `docs/`

---

## Cấu trúc thư mục tổng thể

```
.
├── frontend/    # Giao diện HTML / CSS / JavaScript thuần
├── backend/     # Máy chủ C# .NET (Clean Architecture)
├── infra/       # Docker, script triển khai
└── docs/        # Tài liệu kiến trúc, API, thiết kế game
```

---

## 1. Frontend — `frontend/`

Giao diện web cho game thẻ bài, viết bằng HTML / CSS / JavaScript thuần.

### Cấu trúc

```
frontend/
├── src/
│   ├── assets/         # Hình ảnh, font, âm thanh tĩnh
│   │   ├── images/
│   │   ├── fonts/
│   │   └── audio/
│   ├── styles/         # CSS tách theo tầng
│   │   ├── base/       # Reset & design tokens
│   │   ├── layout/     # Bố cục trang & responsive
│   │   ├── components/ # Thành phần UI (panel, card, button…)
│   │   └── main.css    # Entry — gộp tất cả partial theo thứ tự
│   ├── scripts/
│   │   ├── core/       # Khởi tạo, router, store
│   │   ├── ui/         # Logic tương tác từng màn hình
│   │   ├── network/    # Gọi REST / WebSocket đến backend
│   │   ├── game/       # Logic game phía client
│   │   └── utils/      # Hàm tiện ích dùng chung
│   └── pages/          # Mỗi màn hình là một thư mục con
│       ├── landing/    # Màn hình chào (đã có)
│       ├── lobby/      # Sảnh chờ
│       ├── room/       # Phòng chơi
│       └── game/       # Bàn đấu
├── public/             # Tài nguyên tĩnh phục vụ trực tiếp
│   └── static/
│       ├── css/
│       ├── js/
│       └── media/
├── config/             # Cấu hình môi trường, hằng số frontend
├── tests/
│   ├── unit/
│   └── e2e/
└── docs/               # Tài liệu riêng cho frontend
```

### Phân lớp trong `src/`

- **assets** — Hình ảnh, font, âm thanh.
- **styles** — CSS tách theo tầng: `base` (tokens, reset), `layout` (bố cục & responsive), `components` (UI độc lập), `main.css` là entry gộp tất cả.
- **scripts** — JavaScript: `core` (khởi tạo, router, store), `ui` (tương tác từng màn hình), `network` (giao tiếp backend), `game` (logic game client), `utils` (tiện ích chung).
- **pages** — Mỗi màn hình là một thư mục con chứa `index.html` riêng: `landing` (đã có), `lobby`, `room`, `game`.

### Quy tắc tổ chức

- Mỗi màn hình nằm trong `src/pages/<ten-man-hinh>/` chứa `index.html` và file JS riêng trong `src/scripts/ui/`.
- CSS tách theo tầng (`base`, `layout`, `components`) để dễ bảo trì; luôn import qua `main.css`.
- Không viết inline style hay inline script trong HTML — đặt vào file tương ứng trong `src/scripts/`.

### Khởi chạy nhanh

Tạo file `frontend/src/config/local.js` (đã đi kèm) trỏ tới backend, ví dụ `http://localhost:5080`. Sau đó mở file `src/pages/landing/index.html` trong trình duyệt, hoặc dùng một static server:

```bash
npx serve frontend/src
```

> Lưu ý: trang landing sẽ gọi REST đến backend, nên cần chạy backend song song (xem mục 2). Trang dùng đường dẫn tuyệt đối (`/frontend/src/pages/...`), nên nếu mở trực tiếp bằng `file://` cần khớp với cấu trúc thư mục. Khuyến nghị dùng static server.

---

## 2. Backend — `backend/`

Máy chủ C# .NET cho game thẻ bài, tổ chức theo Clean Architecture.

### Cấu trúc

```
backend/
├── src/
│   ├── Arcana.Api/             # Tầng trình bày: Controllers, Hubs, Middlewares
│   │   ├── Controllers/
│   │   ├── Middlewares/
│   │   ├── Filters/
│   │   ├── Hubs/               # SignalR hub cho multiplayer realtime
│   │   └── Configuration/
│   │
│   ├── Arcana.Application/     # Tầng ứng dụng: use-case, dịch vụ nghiệp vụ
│   │   ├── Abstractions/
│   │   ├── Rooms/              # Use-case liên quan phòng
│   │   ├── Players/            # Use-case liên quan người chơi
│   │   ├── Games/              # Use-case liên quan ván đấu
│   │   └── Common/
│   │
│   ├── Arcana.Domain/          # Tầng miền: entity, enum, value object, sự kiện
│   │   ├── Entities/
│   │   ├── Enums/
│   │   ├── ValueObjects/
│   │   └── Events/
│   │
│   ├── Arcana.Infrastructure/  # Tầng hạ tầng: EF Core, repo, cache, realtime
│   │   ├── Persistence/
│   │   │   └── Configurations/
│   │   ├── Repositories/
│   │   ├── RealTime/
│   │   ├── Identity/
│   │   └── Caching/
│   │
│   └── Arcana.Shared/          # Hợp đồng chia sẻ giữa client và server
│       ├── Contracts/          # DTO / event payload
│       ├── Constants/
│       └── Errors/
│
├── tests/
│   ├── Arcana.Tests.Unit/
│   │   ├── Application/
│   │   └── Domain/
│   └── Arcana.Tests.Integration/
│       ├── Api/
│       └── Infrastructure/
│
├── scripts/                    # Script vận hành (seed DB, migration…)
├── docs/                       # Tài liệu backend
└── .github/workflows/          # CI/CD
```

### Phân lớp trong `src/`

- **Arcana.Api** — Controllers, SignalR Hubs, Middlewares, Filters, Configuration.
- **Arcana.Application** — Use-case, dịch vụ nghiệp vụ: `Abstractions`, `Rooms`, `Players`, `Games`, `Common`.
- **Arcana.Domain** — Entity, enum, value object, sự kiện miền.
- **Arcana.Infrastructure** — EF Core (`Persistence` + `Configurations`), `Repositories`, `RealTime`, `Identity`, `Caching`.
- **Arcana.Shared** — Hợp đồng dùng chung client/server: `Contracts`, `Constants`, `Errors`.

### Quy tắc phụ thuộc

- `Domain` không phụ thuộc tầng nào khác.
- `Application` chỉ phụ thuộc `Domain`.
- `Infrastructure` triển khai các abstraction của `Application`.
- `Api` là điểm vào, gọi xuống `Application`.
- `Shared` chứa hợp đồng dùng chung cho cả client.

### Build & chạy

```bash
cd backend
dotnet restore
dotnet build
dotnet run --project src/Arcana.Api
```

API mặc định chạy ở `http://localhost:5080`, Swagger UI: `http://localhost:5080/swagger`.

#### Cấu hình Firebase

Backend dùng Firestore làm nơi lưu phòng. File cấu hình nằm ở `src/Arcana.Api/appsettings.json`:

```json
"Firebase": {
  "ProjectId": "cardgame-594f0",
  "CredentialsFilePath": "Secrets/cardgame-594f0-firebase-adminsdk-fbsvc-fcafb48fff.json"
}
```

Service account JSON đặt tại `src/Arcana.Api/Secrets/`. Thư mục này đã có `.gitignore` để không commit nhầm khóa.

#### Endpoint hiện có

| Method | Path | Mô tả |
| --- | --- | --- |
| `POST` | `/api/rooms` | Tạo phòng mới, trả về mã mời 6 ký tự |
| `POST` | `/api/rooms/join` | Vào phòng bằng mã mời, từ chối nếu đủ 8 người |
| `GET`  | `/api/rooms/{id}` | Lấy thông tin phòng + danh sách thành viên |

---

## 3. Infrastructure — `infra/`

Cấu hình & script phục vụ triển khai.

- `docker/` — Dockerfile, compose cho frontend / backend / database
- `scripts/` — Script shell / PowerShell dùng chung

---

## 4. Tài liệu — `docs/`

- `architecture/` — Sơ đồ kiến trúc, quyết định kỹ thuật
- `api/` — Đặc tả REST / WebSocket
- `game-design/` — Luật chơi, cơ chế thẻ bài
