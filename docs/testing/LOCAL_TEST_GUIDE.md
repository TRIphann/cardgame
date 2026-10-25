# 🧪 Hướng dẫn Test Local

## 📋 Mục lục
1. [Khởi động nhanh](#khởi-động-nhanh)
2. [Test bằng script tự động](#test-bằng-script-tự-động)
3. [Test thủ công](#test-thủ-công)
4. [Kịch bản Timer 10s](#kịch-bản-timer-10s)
5. [Troubleshooting](#troubleshooting)

---

## 🚀 Khởi động nhanh

### Cách 1: Script tự động (khuyến nghị)

Mở **PowerShell (pwsh)** ở thư mục gốc `D:\gmae`:

```powershell
# Khởi động cả backend + frontend (đợi ~30s tới khi ready)
pwsh backend\tests\integration\_tools\start-dev.ps1
```

Output mẫu:
```
==> Khởi động backend tại http://localhost:5000
==> Khởi động frontend tại http://localhost:5173
==> Đợi server sẵn sàng...
═══════════════════════════════════════
Backend  → http://localhost:5000
          Health: http://localhost:5000/health
Frontend → http://localhost:5173
═══════════════════════════════════════
```

### Cách 2: Manual

```powershell
# Terminal 1 - Backend
cd D:\gmae\backend
dotnet run --project src/Arcana.Api --urls "http://localhost:5000"

# Terminal 2 - Frontend
cd D:\gmae\frontend
npm run dev   # mở http://localhost:5173
```

### Stop tất cả

```powershell
Get-Job | Stop-Job
Get-Job | Remove-Job
# Hoặc dừng cả ts:
Get-NetTCPConnection -LocalPort 5000,5173 -State Listen |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 🤖 Test bằng script tự động

Sau khi server đã chạy, mở terminal **mới**:

```powershell
# TẦNG 1 — Backend unit tests (không cần server)
cd backend
dotnet test tests\unit\Arcana.UnitTests\Arcana.UnitTests.csproj

# TẦNG 2 — Frontend unit/component tests (không cần server)
cd frontend
npm run test

# TẦNG 3 — Backend integration (cần server :5000)
cd backend\tests\integration
pwsh -NoProfile -File run-all.ps1                        # tuần tự, tất cả 15 suite
pwsh -NoProfile -File run-all-parallel.ps1 -Throttle 6   # song song

# Chỉ 1 suite
pwsh -NoProfile -File run-all.ps1 -Only card-future
pwsh -NoProfile -File run-all.ps1 -Skip card-bomb,game-flow

# TẦNG 4 — Frontend E2E (cần server :5000 + :5173)
cd frontend
npm run e2e              # headless
npm run e2e:headed       # có UI
```

> 📖 Xem [`TEST_SUITE_MATRIX.md`](TEST_SUITE_MATRIX.md) để biết chi tiết từng
> suite, mapping TC-ID ↔ file test, và cách chạy song song.

Output cuối cùng (khi pass hết):
```
==> 5. SUMMARY
  Backend suites:  15 / 15 pass
  Frontend suites: 1 / 1 pass
  ✓ ALL TESTS PASSED
```

---

## 🖱 Test thủ công

### Bước 1: Mở browser
Truy cập `http://localhost:5173`

### Bước 2: Vào Test Lobby (nhanh nhất)
- Click "Vào Test Lobby"
- Test Lobby: chọn **Bot Count = 3** (3 bots)
- Click **"Bắt đầu game"**
- Bot `botTurnSeconds = 1` → game chạy gần như instant

### Bước 3: Normal Lobby (test thật với timer 10s)
- Quay về Landing
- Tạo phòng với tên "Player1"
- Copy code 6 ký tự, mở tab/incognito thứ 2 → Join với tên "Player2"
- Tab thứ 3 → Join với tên "Player3"
- Cả 3 bấm Ready → Host bấm Start
- Game bắt đầu với timer 10s (hoặc 1s cho bot)

---

## ⏱ Kịch bản Timer 10s

### TC-T1: Lượt chơi tự động kết thúc sau 10s
1. Tạo phòng Test Lobby, 3 bots
2. Khi đến lượt bạn, **đừng làm gì** trong 10s
3. **Kỳ vọng**: Timer đếm ngược 10 → 0, sau đó auto-draw

### TC-T2: Mỗi action reset về 10s
1. Bắt đầu lượt với timer = 10s
2. Click một card (vd: đánh Skip)
3. Sau 5s, timer đang ở 5s
4. Action xong → **timer reset về 10s** mới

### TC-T3: Nope window = 10s (tăng từ 5s)
1. Đánh Skip (action card bất kỳ)
2. Nope chain mở
3. **Kỳ vọng**: Timer 10s (không phải 5s)
4. Sau 10s nếu không cản → turn advance

### TC-T4: Future peek = 10s
1. Đánh Future
2. Modal mở với 3 lá úp trong **10s** (không phải 5s)
3. Sau 10s tự đóng và **reset timer về 10s**

### TC-T5: Favor picker = 10s với auto-pick
1. Đánh Favor
2. Chọn target → picker card mở
3. **Đừng chọn** trong 10s
4. **Kỳ vọng**: Sau 10s hệ thống tự random 1 lá

### TC-T6: Combo picker = 10s với auto-cancel
1. Đánh Ninja (combo card)
2. Modal chọn loại combo (2/3/5) mở
3. **Đừng chọn** trong 10s
4. **Kỳ vọng**: Modal tự đóng, combo card vẫn trong tay

### TC-T7: Nope + Future + Picker tất cả dùng chung 10s
- Verify trên UI: 3 modal khác nhau đều hiển thị `⏱ Xs` count down từ 10

### TC-T8: AFK auto-play vẫn work với 10s
1. Đợi hết 10s không action
2. Modal "Bạn có đang chơi không?" xuất hiện
3. Bấm "Tôi đã quay lại" → trở lại game
4. KHÔNG bấm → AFK: auto-draw, timer reset 0s cho lượt sau (không phải 10s)

### TC-T9: Bot hành động trong 1s (test mode)
1. Test Lobby → `botTurnSeconds = 1`
2. Bot đánh Skip/Attack gần như ngay
3. **Kỳ vọng**: Bot KHÔNG đợi 10s, action sau 1s

### TC-T10: Mỗi commit action reset
- Test này verify giá trị `turnRemainingSec` được reset về **10s** sau mỗi action.
- Trong DevTools → Application → /api/test/room/{id}/snapshot, kiểm tra:
  ```json
  "turnTimeLimitSec": 10,
  "turnRemainingSec": 10
  ```
  (sau mỗi action committed, `turnStartedAt` reset về now → remaining ~10s)

---

## 🔧 Troubleshooting

### ❌ "Port 5000 already in use"
```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### ❌ "Port 5173 already in use"
```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### ❌ "pwsh not found"
PowerShell Core chưa cài. Tải tại: https://aka.ms/powershell

### ❌ Playwright fail "browser not found"
```bash
cd frontend
npx playwright install chromium
```

### ❌ Test fail với "Mất kết nối với máy chủ"
- Test 3.x (game page) **đã skip** vì SignalR không ổn định trong headless
- Đây là expected — kiểm tra 7/9 pass thay vì 9/9

### ❌ Backend không start (port 5000 bị lock)
```powershell
# Dừng tất cả process cũ
powershell -Command "Get-Process -Name Arcana.Api -ErrorAction SilentlyContinue | Stop-Process -Force"
# Sau đó chạy lại
```

### ❌ Cần reset game state
- Restart backend: `Get-Job -Name arcana-api | Stop-Job; Get-Job | Remove-Job`
- Hoặc kill process chiếm port 5000

---

## 📊 Kết quả mong đợi

### TẦNG 1 — Backend unit (xUnit)
```
Passed!  - Failed: 0, Passed: 164, Skipped: 0, Total: 164 - Arcana.UnitTests.dll (net8.0)
```

### TẦNG 2 — Frontend unit/component (Vitest)
```
 Test Files  5 passed (5)
      Tests  64 passed (64)
```

### TẦNG 3 — Backend integration (PowerShell)
```
=============================================
SUMMARY
=============================================
  card-future          PASS        18s
  card-shuffle         PASS        12s
  ...
  lobby-test-bot       PASS        65s
=============================================
Passed: 15  Failed: 0
```

### TẦNG 4 — Frontend E2E (Playwright)
```
49 passed (8 spec files)
```

### Build verification (đã chạy)
- ✅ `dotnet build` → SUCCESS
- ✅ `npm run build` → SUCCESS
- ✅ `npm run lint` → 0 warning
- ✅ `dotnet format --verify-no-changes` → sạch

---

*Updated: 2026-10-25*
