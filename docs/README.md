# docs

Tài liệu sống của dự án Arcana.

## Mục lục

- [`testing/`](./testing/) — Hướng dẫn chạy test, checklist, báo cáo test.
  - [`testing/README.md`](./testing/README.md) — tổng quan các suite
  - [`testing/LOCAL_TEST_GUIDE.md`](./testing/LOCAL_TEST_GUIDE.md) — chạy test local
- [`CHANGELOG.md`](./CHANGELOG.md) — lịch sử thay đổi của dự án
- [`SECURITY.md`](./SECURITY.md) — chính sách bảo mật & báo cáo lỗ hổng

## API, kiến trúc & luật chơi

Tài liệu chi tiết đang được viết. Tạm thời tham khảo trực tiếp các file:

- **API / contracts**
  - `backend/src/Arcana.Api/Controllers/RoomsController.cs`
  - `backend/src/Arcana.Api/Hubs/GameHub.cs`
  - `backend/src/Arcana.Shared/Contracts/RoomContracts.cs`
- **Kiến trúc** — xem commit history (`git log --oneline`)
- **Luật chơi**
  - `backend/src/Arcana.Application/Game/CardCatalog.cs`
  - `backend/src/Arcana.Application/Services/GameService.cs`

## Nguyên tắc

1. Ưu tiên viết code rồi suy ra docs — **đừng ngược lại**.
2. Mỗi khi API contract đổi, cập nhật tài liệu trong cùng PR.
3. Khi một file ở đây đầy đủ, bỏ dòng "đang được viết" tương ứng.
