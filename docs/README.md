# docs

Tài liệu sống của dự án Arcana.

## Mục lục

- [`api/`](./api/) — REST endpoints, SignalR hub, contracts (`Arcana.Shared`).
  Hiện **đang được viết**. Tạm thời tham khảo trực tiếp các file:
  - `backend/src/Arcana.Api/Controllers/RoomsController.cs`
  - `backend/src/Arcana.Api/Hubs/GameHub.cs`
  - `backend/src/Arcana.Shared/RoomContracts.cs`
- [`architecture/`](./architecture/) — Clean Architecture, dependency rules, data flow.
  Hiện **đang được viết**. Tạm thời xem commit history (`git log --oneline`).
- [`game-design/`](./game-design/) — Card catalog, combo rules, turn clock,
  nope window, win condition. Hiện **đang được viết**. Tạm thời xem:
  - `backend/src/Arcana.Application/Game/CardCatalog.cs`
  - `backend/src/Arcana.Application/Services/GameService.cs`

## Nguyên tắc

1. Ưu tiên viết code rồi suy ra docs — **đừng ngược lại**.
2. Mỗi khi API contract đổi, cập nhật `api/` trong cùng PR.
3. Khi một file ở đây đầy đủ, bỏ dòng "đang được viết" tương ứng.
