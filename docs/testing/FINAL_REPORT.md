# Final Test Report

## 📊 Tổng quan

| Hạng mục | Pass | Fail | Skip | Tổng |
|----------|------|------|------|------|
| Backend integration (production) | 18 | 0 | 0 | 18 |
| Backend integration (bot modes) | 7 | 0 | 0 | 7 |
| Frontend e2e (Playwright) | 7 | 0 | 2 | 9 |
| UI/Animation manual screenshots | - | - | - | 217 |
| Manual test cases defined | - | - | - | 60+ |
| **Tổng tests thực thi được** | **32** | **0** | **2** | **34** |

## 🎯 Tính năng đã verify

### ✅ Normal Lobby Flow
- Tạo phòng (POST /api/rooms)
- Join qua code 6 ký tự
- Ready / Unready
- Kick (host only)
- Start (≥3 players, host only)
- Draw card (đúng lượt)
- Heartbeat (204)
- Concede mid-game
- Leave (non-host)
- Snapshot reflects state

### ✅ Bot Modes (Test Lobby)
- Draw-only bot (chỉ rút bài)
- Play-cards bot (attack / favor ưu tiên)
- One-card bot (`oneCardBotCardMap` điều khiển)
- Mixed mode trong cùng phòng

### ✅ Timer 10s Rule (MỚI)
| Hành động | Timer cũ | Timer mới |
|-----------|---------|-----------|
| Lượt chơi | 60s | **10s** |
| Nope window | 5s | **10s** |
| Future peek | 13s | **10s** |
| Favor picker | - | **10s + auto-pick** |
| Combo picker | - | **10s + auto-cancel** |
| Bomb placement | - | **10s** |

**Single source of truth**: `GameService.cs` 5 hằng số:
```csharp
public const int TurnTimeLimitSeconds = 10;
public const int NopeWindowSeconds = 10;
public const int FuturePeekSeconds = 10;
public const int PickerTimeoutSeconds = 10;
public const int BombPlacementTimeoutSeconds = 10;
```

### ✅ UI/UX
- 3 viewports responsive (375, 768, 1440): no overflow
- Animations: Landing panel, Floating cards, HandArc fan-in, Draw, Play, Future Peek, Bomb Reveal, Turn Timer
- 4 bugs đã fix: handCounts=0, FuturePeek lock, Turn timer stuck, gameState drop

## 🔧 Bug Fixes Đã Áp Dụng

### Trong quá trình viết test:
1. `GameState` thiếu `OneCardBotCardMap`
2. `GameService.StartGameAsync` thiếu param
3. `GameService.PrimaryRepository` ưu tiên test repo sai
4. `CachedRoomRepository` cache stale pre-write state
5. `FirestoreRoomRepository.RemoveMemberAsync` không filter deleted

### Sau đợt test:
6. FuturePeek không block hành động → `MANDATORY_VIEW_MS = 10s` + `pointer-events: auto`
7. Turn timer stuck ở 0s → recompute client-side từ `turnStartedAt`
8. handCounts = 0 → fix `normalizeRoom()` + `safeSetRoom()`
9. gameState dropped on member remap → re-inject `prev.gameState`
10. Responsive mobile/tablet fixes

## 📁 Artifacts

- `TEST-REPORT.md` — UI/Animation report (217 screenshots, GALLERY.html)
- `TEST_LOBBY_TEST_CASES.md` — 60+ manual test cases (4572 dòng)
- `TIMER_10S_SPEC.md` — Spec Timer 10s (824 dòng)
- `docs/FRONTEND_TEST_CHECKLIST.md` — Manual checklist
- `docs/ANIMATION_ENHANCEMENTS.md` — Animation plan
- `backend/README.md` — Backend test suites
- `frontend/README.md` — Frontend e2e test

## 🚀 Còn lại / Next Steps

- [ ] Convert timer manual test cases TC-T1 → TC-T12 thành automated scripts
- [ ] Thêm CI/CD pipeline (GitHub Actions / GitLab CI)
- [ ] Thêm code coverage report
- [ ] Mock data cho CI environment
- [ ] Visual regression testing cho animation timing

---

*Last updated: 2026-09-27*
*Test framework: pwsh + Playwright*
*Project: Arcana — Card Battle*
