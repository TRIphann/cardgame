# ⏱️ LOGIC TIMER 10 GIÂY - SPEC CHI TIẾT

## Mục lục
1. [Tổng quan Timer 10s](#tổng-quan-timer-10s)
2. [Các trạng thái và hành động reset](#các-trạng-thái-và-hành-động-reset)
3. [Quy tắc chi tiết từng hành động](#quy-tắc-chi-tiết-từng-hành-động)
4. [Backend changes](#backend-changes)
5. [Frontend changes](#frontend-changes)
6. [Test scenarios](#test-scenarios)
7. [Edge cases](#edge-cases)

---

## Tổng quan Timer 10s

### Quy tắc chung:
```
Mỗi người chơi có 10 giây để hành động.
Sau 10 giây không hành động → auto-draw (hoặc kết thúc lượt).

Mỗi lần người chơi thực hiện một hành động:
→ Timer RESET về 10 giây.

Timer 10s áp dụng cho:
1. Lượt chơi thường (rút bài hoặc đánh lá chức năng)
2. Xem Future (10s để xem, tắt Future có 10s tiếp)
3. Nope window (10s cho mỗi lượt Nope)
4. Chọn người chơi (Favor phase 1)
5. Chọn lá bài (Favor phase 2)
6. Combo 2 - Chọn người
7. Combo 2 - Chọn lá của người đó
8. Đặt Bomb sau khi Defuse
```

### Timer độc lập hay chia sẻ?

```
┌──────────────────────────────────────────────┐
│ Timer CHIA SẺ cho mỗi player:                │
│ - Lượt chơi thường (10s)                     │
│ - Nope window (10s)                          │
│ - Sau mỗi action → reset về 10s              │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Timer RIÊNG cho từng picker:                  │
│ - Chọn người (Favor / Combo 2): 10s          │
│ - Chọn lá (Favor / Combo 2): 10s              │
│ - Đặt Bomb: 10s                              │
│ - Xem Future: 10s                            │
└──────────────────────────────────────────────┘
```

---

## Các trạng thái và hành động reset

### Bảng tổng hợp:

| Trạng thái hiện tại | Hành động | Timer Reset? | Timer mới |
|---------------------|-----------|--------------|-----------|
| Đang chờ (chưa làm gì) | Rút bài | ✅ | 10s |
| Đang chờ (chưa làm gì) | Đánh Future | ✅ | 10s |
| Đang chờ (chưa làm gì) | Đánh Shuffle | ✅ | 10s |
| Đang chờ (chưa làm gì) | Đánh Attack | ✅ | 10s |
| Đang chờ (chưa làm gì) | Đánh Skip | ✅ | 10s |
| Đang chờ (chưa làm gì) | Đánh Favor | ✅ | 10s (cho picker) |
| Đang chờ (chưa làm gì) | Đánh Combo 2/3 | ✅ | 10s (cho picker) |
| Đang chờ (chưa làm gì) | Đánh Nope | ✅ | 10s |
| Đang xem Future | Đóng Future | ✅ | 10s (cho lượt tiếp) |
| Đang đợi Nope | Đánh Nope | ✅ | 10s (reset Nope window) |
| Đang chọn người (Favor) | Chọn người | ✅ | 10s (cho picker lá) |
| Đang chọn lá (Favor) | Chọn lá | ✅ | 10s (cho lượt tiếp) |
| Đang chọn người (Combo 2) | Chọn người | ✅ | 10s (cho picker lá) |
| Đang chọn lá (Combo 2) | Chọn lá | ✅ | 10s (cho lượt tiếp) |
| Đang đặt Bomb | Đặt xong | ✅ | 10s (cho lượt tiếp) |

---

## Quy tắc chi tiết từng hành động

### 1. Lượt chơi thường (Normal Turn)

```
Trạng thái: Không có action pending
Timer: 10 giây
Countdown: Bắt đầu khi lượt bắt đầu

Nếu user không làm gì sau 10s:
→ Auto-draw (server)
→ Lượt kết thúc
→ Lượt tiếp theo được 10s mới

Nếu user làm gì:
→ Reset timer về 10s
→ Bắt đầu đếm lại
```

**Code thay đổi:**

Backend (`TurnTimeoutHandler.cs`):
```csharp
// Trước: 60s
public const int TurnTimeLimitSeconds = 60;
// Sau: 10s
public const int TurnTimeLimitSeconds = 10;
```

Frontend (`GamePage.jsx`):
```jsx
// Trước:
const TURN_INTRO_DISMISS_MS = 3000;
// Sau:
const TURN_TIME_LIMIT_MS = 10_000; // 10s

// Reset timer khi có action
useEffect(() => {
  if (lastAction === 'draw' || lastAction === 'playCard') {
    setTurnTimeLeft(10);
  }
}, [lastAction]);
```

### 2. Xem Future (Future Peek)

```
Trạng thái: Future modal đang mở
Timer: 10 giây để xem

Flow:
1. User đánh Future
2. Timer lượt thường được "pause"
3. Future modal mở, bắt đầu đếm 10s
4. Sau 10s:
   - Nếu chưa đóng: tự động đóng
   - Timer lượt tiếp tục với 10s mới

Nếu user đóng Future TRƯỚC 10s:
- Timer được reset về 10s
- User có 10s tiếp theo để hành động (rút bài hoặc đánh lá khác)
```

**Code thay đổi:**

Backend (`GameService.cs`):
```csharp
// Trước:
FuturePeekLifetime = TimeSpan.FromSeconds(13);
// Sau:
FuturePeekLifetime = TimeSpan.FromSeconds(10);
```

Frontend (`FuturePeekModal.jsx`):
```jsx
const FUTURE_PEEK_DURATION_MS = 10_000;

// Khi user đóng Future:
const handleCloseFuture = () => {
  setFuturePeek(null);
  setFutureDismissedAt(Date.now());
  // QUAN TRỌNG: Reset turn timer về 10s
  onClose?.(); // Triggers parent to reset timer
};
```

### 3. Nope Window

```
Trạng thái: Có PendingAction (sau khi đánh action)
Timer: 10 giây cho Nope window

Flow:
1. User đánh Action (Future/Shuffle/Attack/Skip/Favor)
2. Nope window mở với 10s
3. Người tiếp theo có 10s để Nope

Nếu ai đó đánh Nope:
- Nope window reset 10s
- Chuyển sang người tiếp theo

Nếu hết 10s không ai Nope:
- Action được thực hiện (hoặc bị hủy nếu số Nope lẻ)
```

**Code thay đổi:**

Backend (`NopeTimeoutHandler.cs`):
```csharp
// Trước: 5s
private const int NopeWindowTimeoutMs = 5_000;
// Sau: 10s
private const int NopeWindowTimeoutMs = 10_000;
```

### 4. Favor - Chọn người (Phase 1)

```
Trạng thái: User đánh Favor, chưa chọn target
Timer: 10 giây để chọn người

Flow:
1. User đánh Favor
2. Picker chọn người mở
3. Timer đếm 10s

Nếu user chọn người TRƯỚC 10s:
- Picker chọn người đóng
- Picker chọn lá mở (timer mới 10s)

Nếu hết 10s không chọn:
- Auto-cancel Favor
- Lượt kết thúc
- Lá Favor vào bài bỏ
```

### 5. Favor - Chọn lá (Phase 2)

```
Trạng thái: User đánh Favor, đã chọn target, target cần chọn lá
Timer: 10 giây để chọn lá

Flow:
1. User đánh Favor
2. User chọn target (Bot 1)
3. Picker chọn lá của Bot 1 mở
4. Timer đếm 10s

Nếu target chọn lá TRƯỚC 10s:
- Lá được chuyển
- Lượt kết thúc
- Timer reset 10s cho người tiếp theo

Nếu hết 10s không chọn:
- Auto-pick random
- Lượt kết thúc
```

### 6. Combo 2 (Combo 2-Same) - Chọn người

```
Trạng thái: User đánh Combo 2 (2 lá giống nhau)
Timer: 10 giây để chọn người

Flow:
1. User đánh Combo 2
2. Picker chọn người mở
3. Timer đếm 10s

Nếu user chọn người TRƯỚC 10s:
- Picker đóng
- Picker chọn lá mở (timer mới 10s)

Nếu hết 10s không chọn:
- Auto-cancel
- Lượt kết thúc
```

### 7. Combo 2 - Chọn lá

```
Trạng thái: User đánh Combo 2, đã chọn người
Timer: 10 giây để chọn lá của người đó

Flow:
1. User đánh Combo 2
2. User chọn target (Bot 1)
3. Picker chọn lá của Bot 1 mở (mặt sau)
4. Timer đếm 10s

Nếu user chọn lá TRƯỚC 10s:
- Lá được chuyển
- Lượt kết thúc
- Timer reset 10s cho người tiếp theo

Nếu hết 10s không chọn:
- Auto-pick random
- Lượt kết thúc
```

### 8. Đặt Bomb sau khi Defuse

```
Trạng thái: User cứu Bomb, cần đặt Bomb vào deck
Timer: 10 giây để đặt

Flow:
1. User rút trúng Bomb
2. Defuse tự động trigger
3. Picker chọn vị trí đặt Bomb mở
4. Timer đếm 10s

Nếu user đặt TRƯỚC 10s:
- Bomb được đặt
- Defuse vào bài bỏ
- Timer reset 10s cho lượt tiếp

Nếu hết 10s không đặt:
- Auto-đặt random
- Lượt tiếp tục
```

---

## Backend Changes

### File: `TurnClockService.cs`

```csharp
/// <summary>Thời gian tối đa cho mỗi lượt chơi - 10 giây.</summary>
public const int TurnTimeLimitSeconds = 10; // Đổi từ 60 → 10
```

### File: `BotService.cs`

```csharp
// Bot timer phải đồng bộ với turn timer
// Trước: Bot có timeout riêng
// Sau: Bot sử dụng chung 10s với user

// Logic: Bot hành động ngay khi đến lượt (nếu botTurnSeconds = 0)
// hoặc chờ tối đa 10s (nếu botTurnSeconds > 0)
```

### File: `GameService.cs`

```csharp
// Thêm các constant
public const int TurnTimeLimitSeconds = 10;
public const int NopeWindowSeconds = 10;
public const int PickerTimeoutSeconds = 10;
public const int FuturePeekSeconds = 10;
public const int BombPlaceTimeoutSeconds = 10;

// Helper method để reset timer
private void ResetTurnTimer(GameState gs, string roomId, int timeoutSeconds = 10)
{
    gs.TurnStartedAt = DateTime.UtcNow;
    if (gs.EndedAt is null)
    {
        _turnClock.Register(roomId, gs.TurnStartedAt.Value, timeoutSeconds);
    }
}
```

### File: `NopeTimeoutHandler.cs`

```csharp
/// <summary>Thời gian Nope window - 10 giây.</summary>
private const int NopeWindowTimeoutMs = 10_000; // Đổi từ 5_000 → 10_000
```

### File: `GameState.cs`

```csharp
// Thêm field để track picker timer
public DateTime? PickerStartedAt { get; set; }
public PickerKind? CurrentPicker { get; set; }

public enum PickerKind
{
    None,
    FavorTarget,
    FavorCard,
    Combo2Target,
    Combo2Card,
    Combo3Target,
    Combo3Card,
    BombPlacement,
}
```

---

## Frontend Changes

### File: `GamePage.jsx`

```jsx
// Constants
const TURN_TIME_LIMIT_MS = 10_000; // 10s cho mỗi lượt
const NOPE_WINDOW_MS = 10_000; // 10s cho Nope window
const PICKER_TIMEOUT_MS = 10_000; // 10s cho mỗi picker
const FUTURE_PEEK_MS = 10_000; // 10s cho Future peek
const BOMB_PLACE_MS = 10_000; // 10s cho đặt Bomb

// Timer state
const [turnTimeLeft, setTurnTimeLeft] = useState(10);
const [pickerTimeLeft, setPickerTimeLeft] = useState(null);

// Reset timer khi có action
useEffect(() => {
  if (lastActionRef.current) {
    setTurnTimeLeft(10);
  }
}, [lastActionRef.current]);

// Countdown timer
useEffect(() => {
  if (!isMyTurn || turnTimeLeft <= 0) return;
  
  const id = setInterval(() => {
    setTurnTimeLeft((t) => Math.max(0, t - 1));
  }, 1000);
  
  return () => clearInterval(id);
}, [isMyTurn, turnTimeLeft]);

// Reset picker timer
useEffect(() => {
  if (activePicker) {
    setPickerTimeLeft(10);
    const id = setInterval(() => {
      setPickerTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  } else {
    setPickerTimeLeft(null);
  }
}, [activePicker]);
```

### File: `FuturePeekModal.jsx`

```jsx
const FUTURE_PEEK_DURATION_MS = 10_000; // Đổi từ 13_000 → 10_000

const handleClose = () => {
  // Reset parent timer khi đóng Future
  onClose?.({ resetTurnTimer: true });
};
```

### File: `CardPickModal.jsx`

```jsx
const PICKER_TIMEOUT_MS = 10_000; // 10s cho picker

// Auto-cancel khi hết 10s
useEffect(() => {
  if (timeLeft <= 0) {
    onAutoCancel?.();
  }
}, [timeLeft]);
```

### File: `ComboSelectionModal.jsx`

```jsx
const COMBO_PICKER_TIMEOUT_MS = 10_000; // 10s

// Auto-pick random khi hết 10s
useEffect(() => {
  if (timeLeft <= 0) {
    const randomCard = candidates[Math.floor(Math.random() * candidates.length)];
    onSelect?.(randomCard);
  }
}, [timeLeft]);
```

### File: `ActionCardReveal.jsx`

```jsx
const NOPE_WINDOW_DURATION_MS = 10_000; // 10s Nope window

// Hiển thị timer đếm ngược
const [timeLeft, setTimeLeft] = useState(10);

useEffect(() => {
  const id = setInterval(() => {
    setTimeLeft((t) => Math.max(0, t - 1));
  }, 1000);
  return () => clearInterval(id);
}, []);
```

### File: `useGameChannel.js`

```jsx
// Reset timer khi nhận signal từ server
useEffect(() => {
  if (lastSignal?.type === 'turn_started' || lastSignal?.type === 'action_committed') {
    setTurnTimeLeft(10);
  }
}, [lastSignal]);
```

---

## Test Scenarios

### TC-T1: Timer lượt thường - 10s

**Mục tiêu:** Verify timer lượt chơi là 10s

**Steps:**
1. Vào Test Lobby
2. Bắt đầu game với User đi trước
3. Quan sát timer ở header

**Kiểm tra:**
- [ ] Timer bắt đầu ở 10 giây
- [ ] Đếm ngược mỗi giây: 10, 9, 8, 7...
- [ ] Sau 10s → auto-draw

### TC-T2: Timer reset sau khi rút bài

**Mục tiêu:** Verify timer reset khi user rút bài

**Steps:**
1. Đợi timer đếm 5s
2. User rút bài
3. Quan sát timer

**Kiểm tra:**
- [ ] Timer reset về 10 giây
- [ ] Bắt đầu đếm lại từ 10

### TC-T3: Timer reset sau khi đánh Attack

**Mục tiêu:** Verify timer reset khi đánh Attack

**Steps:**
1. Đợi timer 5s
2. User đánh Attack
3. Quan sát Nope window

**Kiểm tra:**
- [ ] Nope window: 10 giây
- [ ] Sau khi Nope resolve: timer turn mới 10s cho người bị Attack

### TC-T4: Future peek timer

**Mục tiêu:** Verify Future peek 10s, tắt Future có 10s tiếp

**Steps:**
1. User đánh Future (timer lượt đang 8s)
2. Future modal mở
3. Timer Future đếm 10s
4. User đóng Future SAU 5s
5. Quan sát timer turn

**Kiểm tra:**
- [ ] Future modal: 10s
- [ ] Khi đóng Future → timer turn = 10s
- [ ] KHÔNG tính thời gian đã trôi qua

### TC-T5: Nope window timer

**Mục tiêu:** Verify Nope window 10s

**Steps:**
1. User đánh Action
2. Nope window mở
3. Đợi 10s

**Kiểm tra:**
- [ ] Nope window: 10s đếm ngược
- [ ] Hết 10s → action resolve

### TC-T6: Favor chọn người timer

**Mục tiêu:** Verify Favor chọn người 10s

**Steps:**
1. User đánh Favor
2. Picker chọn người mở
3. Đợi 10s không chọn

**Kiểm tra:**
- [ ] Picker: 10s
- [ ] Hết 10s → auto-cancel Favor

### TC-T7: Favor chọn lá timer

**Mục tiêu:** Verify Favor chọn lá 10s

**Steps:**
1. User đánh Favor
2. User chọn target
3. Picker chọn lá mở
4. Đợi 10s

**Kiểm tra:**
- [ ] Picker: 10s
- [ ] Hết 10s → auto-pick random

### TC-T8: Combo 2 chọn người timer

**Mục tiêu:** Verify Combo 2 chọn người 10s

**Steps:**
1. User đánh Combo 2 (2 lá giống)
2. Picker chọn người mở
3. Đợi 10s

**Kiểm tra:**
- [ ] Picker: 10s
- [ ] Hết 10s → auto-cancel

### TC-T9: Combo 2 chọn lá timer

**Mục tiêu:** Verify Combo 2 chọn lá 10s

**Steps:**
1. User đánh Combo 2
2. User chọn target
3. Picker chọn lá mở
4. Đợi 10s

**Kiểm tra:**
- [ ] Picker: 10s
- [ ] Hết 10s → auto-pick random

### TC-T10: Đặt Bomb timer

**Mục tiêu:** Verify đặt Bomb 10s

**Steps:**
1. User rút trúng Bomb
2. Defuse trigger
3. Picker đặt Bomb mở
4. Đợi 10s

**Kiểm tra:**
- [ ] Picker: 10s
- [ ] Hết 10s → auto-đặt random

### TC-T11: Timer chain cho mỗi hành động

**Mục tiêu:** Verify mỗi action có 10s riêng

**Steps:**
1. User rút bài (timer reset 10s)
2. User đánh Attack (timer reset 10s)
3. Nope resolve (timer reset 10s)
4. User đánh Future (timer reset 10s)
5. Đóng Future (timer reset 10s)
6. User đánh Skip (timer reset 10s)

**Kiểm tra:**
- [ ] Mỗi action reset timer về 10s
- [ ] Timer không cộng dồn

### TC-T12: Bot timer

**Mục tiêu:** Verify Bot timer = 10s

**Steps:**
1. Set botTurnSeconds = 1
2. Đến lượt Bot
3. Quan sát

**Kiểm tra:**
- [ ] Bot chờ tối đa 10s (hoặc 1s nếu config)
- [ ] Sau timeout → Bot hành động

---

## Edge Cases

### EC-1: User rút bài vào giây thứ 9

```
Timer đang ở 9s
User rút bài
→ Timer reset về 10s
→ KHÔNG phải 9 + 10 = 19s
```

### EC-2: User đang xem Future hết 10s

```
Future modal mở 10s
Hết 10s → tự động đóng
→ Timer turn tiếp tục ở 10s (reset mới)
```

### EC-3: Nope chain nhiều lần

```
User A đánh Future
→ Nope window: 10s
User B đánh Nope → reset 10s
User C đánh Nope → reset 10s
User A đánh Nope → reset 10s
...
Mỗi lần Nope → reset 10s
```

### EC-4: User mất kết nối khi đang chọn

```
User mất kết nối
Server timeout 10s
→ Auto-pick random hoặc auto-cancel
```

### EC-5: User thoát game khi đang có picker

```
User thoát
→ Server timeout 10s
→ Auto-pick random
→ Lượt kết thúc
```

### EC-6: Timer hết khi user đang click

```
User click vào giây cuối cùng
Server đã ghi nhận timeout
→ Request bị reject (hoặc thực hiện nếu trước timeout)
```

### EC-7: Nhiều người cùng timeout

```
Bot 1 và Bot 2 cùng hết timer
→ Server xử lý tuần tự
→ Mỗi bot được 10s riêng sau khi lượt advance
```

---

## Luồng Timer chi tiết

### Luồng User rút bài:

```
T=0s:   Lượt bắt đầu, timer = 10s
T=3s:   User đang suy nghĩ
T=5s:   User quyết định rút bài
T=5s:   Timer RESET về 10s
T=6s:   Server nhận request DrawCardAsync
T=6.5s: Card rút xong, lượt advance
T=6.5s: Lượt tiếp theo bắt đầu, timer = 10s
```

### Luồng User đánh Future:

```
T=0s:   Lượt bắt đầu, timer = 10s
T=2s:   User đánh Future
T=2s:   Timer lượt PAUSE (vẫn ở 8s nhưng không đếm)
T=2s:   Future modal mở, future timer = 10s
T=4s:   User đóng Future (chưa hết 10s)
T=4s:   Timer lượt RESET về 10s (KHÔNG phải 8 + 10 = 18s)
T=5s:   User đánh Attack
T=5s:   Timer lượt PAUSE
T=5s:   Nope window = 10s
T=7s:   Nope resolve (Bot đánh Nope, đếm lẻ = hủy)
T=7s:   Timer lượt RESET về 10s
T=8s:   User quyết định rút bài
```

### Luồng User dùng Combo 2:

```
T=0s:   Lượt bắt đầu, timer = 10s
T=3s:   User đánh Combo 2
T=3s:   Timer lượt PAUSE
T=3s:   Picker chọn người mở, picker timer = 10s
T=5s:   User chọn Bot 1
T=5s:   Picker đóng
T=5s:   Picker chọn lá mở, picker timer = 10s (RESET)
T=8s:   User chọn 1 lá
T=8s:   Picker đóng
T=8s:   Timer lượt RESET về 10s
T=9s:   Lượt kết thúc (đã sử dụng combo)
T=9s:   Lượt tiếp theo, timer = 10s
```

---

## Implementation Plan

### Phase 1: Backend
1. Update `TurnClockService.cs` - TurnTimeLimitSeconds = 10
2. Update `NopeTimeoutHandler.cs` - NopeWindowTimeoutMs = 10_000
3. Update `GameService.cs` - Thêm ResetTurnTimer helper
4. Update `GameState.cs` - Thêm PickerStartedAt, CurrentPicker
5. Update `BotService.cs` - Bot timer = 10s
6. Update `TestController.cs` - Allow test override cho timer

### Phase 2: Frontend
1. Update `GamePage.jsx` - Timer countdown logic
2. Update `FuturePeekModal.jsx` - 10s timer, reset parent timer
3. Update `CardPickModal.jsx` - 10s picker timer
4. Update `ComboSelectionModal.jsx` - 10s picker timer
5. Update `ActionCardReveal.jsx` - 10s Nope window display
6. Update `useGameChannel.js` - Listen for timer reset signals

### Phase 3: Testing
1. Test tất cả 12 TC ở trên
2. Test edge cases EC-1 đến EC-7
3. Test với 3 Chrome tabs (Normal Lobby)
4. Test với bots

---

## Cập nhật Test Cases

Cần bổ sung các Test Case mới vào file `TEST_LOBBY_TEST_CASES.md`:

### Mục mới: PHẦN 14: TIMER 10 GIÂY TEST

#### TC-T1: Timer lượt thường - 10s
#### TC-T2: Timer reset sau khi rút bài
#### TC-T3: Timer reset sau khi đánh Attack
#### TC-T4: Future peek timer
#### TC-T5: Nope window timer
#### TC-T6: Favor chọn người timer
#### TC-T7: Favor chọn lá timer
#### TC-T8: Combo 2 chọn người timer
#### TC-T9: Combo 2 chọn lá timer
#### TC-T10: Đặt Bomb timer
#### TC-T11: Timer chain cho mỗi hành động
#### TC-T12: Bot timer

---

*Document version: 1.0*
*Last updated: 2026-09-21*
*Author: QA Team + Developer*
