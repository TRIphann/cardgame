# Arcana UI/Animation/Responsive Test Report

## Test Summary

**Total screenshots captured: 217**
- Motion Effects: 124 (`screenshots-motion/`)
- TestLobby Deep: 51 (`screenshots-testlobby/`)
- Comprehensive Game: 30 (`screenshots/`)
- Responsive: 12 (`screenshots-responsive/`)

**Gallery**: `GALLERY.html` — interactive HTML with all key screenshots

## ✅ PASSED — All Viewports

### Landing Page
- No horizontal overflow (mobile 375, tablet 768, desktop 1440) ✅
- Floating card animations (SOL/LUNA/ORACLE/ASTRA/IGNIS) ✅
- Panel entry animation ✅
- Create/Join forms functional ✅

### Lobby
- Seats: 2 visible at all sizes ✅
- Deck area: visible ✅
- Start button: visible ✅

### Game Page (mobile 375×667, tablet 768×1024, desktop 1440×900)
- Header: visible ✅
- Seats: 2 visible ✅
- Hand arc: present ✅
- Deck pile: visible ✅
- Action button "Rút bài": visible ✅
- Timer: counting down ✅
- Background animations ✅
- **handCounts bug FIXED** ✅

### Test Lobby
- Tabs: 3 visible (Bài / Deck / Bot) ✅

## 🐛 Bug Fixes Applied (Session 2)

### Nope Window Verification — All Cards

**Rule**: ALL action cards (Attack, Skip, Favor, Future, Shuffle) MUST trigger 5s Nope window. Combos (2-same, 3-same, 5-any) MUST NOT trigger Nope window.

**Verified by `frontend\manual\nope-window-test.js`** (8/8 PASS):

```
✅ attack           → pendingAction=attack (5s Nope window opens)
✅ skip             → pendingAction=skip (5s Nope window opens)
✅ favor            → pendingAction=favor (5s Nope window opens)
✅ future           → pendingAction=future (5s Nope window opens)
✅ shuffle          → pendingAction=shuffle (5s Nope window opens)

✅ combo 2-same     → pendingAction=null (no Nope window)
✅ combo 3-same     → pendingAction=null (no Nope window)
✅ combo 5-any      → pendingAction=null (no Nope window)
```

**Backend source** (`GameService.cs`):
| Card | Nope? | Code path |
|------|-------|-----------|
| Attack | ✅ 5s | `case CardCatalog.Attack` → `QueueNopeWindow` |
| Skip | ✅ 5s | `case CardCatalog.Skip` → `QueueNopeWindow` |
| Favor | ✅ 5s | `case CardCatalog.Favor` (phase 1) → `QueueNopeWindow` |
| Future | ✅ 5s | `case CardCatalog.Future` → `QueueNopeWindow(skipTurnAdvance: true)` |
| Shuffle | ✅ 5s | `case CardCatalog.Shuffle` → `QueueNopeWindow` |
| Combo 2-same | ❌ no | `ResolveComboAsync → TwoSame` → `AdvanceTurn` direct |
| Combo 3-same | ❌ no | `ResolveComboAsync → ThreeSame` → `AdvanceTurn` direct |
| Combo 5-any | ❌ no | `ResolveComboAsync → FiveAny` → `AdvanceTurn` direct |

**Frontend** (`GamePage.jsx`):
```javascript
const nopeWindowOpen =
    pendingAction &&              // ← false for combos
    pendingAction.initiatorId !== myId &&
    nopeRemaining > 0 &&
    !pendingAction.nopeChain.includes(myId);
```
Button "Cản! (5.0s)" only renders when `nopeWindowOpen` is true. Combos skip → no button. ✅

### Bug 1: FuturePeek không block hành động + flip ngay lập tức ✅

**Triệu chứng**: Future card được peek nhưng player có thể click cards ngay lập tức, lật bài trước 5s mandatory wait.

**Root cause**:
1. `.future-peek-scene` có `pointer-events: none` → clicks đi xuyên qua modal
2. Modal mở với cards face-up luôn (không có mandatory wait)

**Fix** (FuturePeekModal.jsx + game.css):
```jsx
// 1. Thêm MANDATORY_VIEW_MS = 5000 (5s lock phase)
const MANDATORY_VIEW_MS = 5000;
const [isLocked, setIsLocked] = useState(true);

useEffect(() => {
  if (!peek) return;
  setIsLocked(true);
  setRevealedCount(0);
  const unlockT = setTimeout(() => {
    setIsLocked(false);
    // Start flipping cards one by one
    const timers = peek.map((_, idx) =>
      setTimeout(() => setRevealedCount(idx + 1), idx * FLIP_STAGGER_MS)
    );
  }, MANDATORY_VIEW_MS);
  return () => clearTimeout(unlockT);
}, [peek]);
```

```jsx
// 2. Cards show face-down during lock phase
{peek.map((key, i) => {
  const revealed = !isLocked && i < revealedCount;
  return (
    <div className={`fp-card${revealed ? " fp-card--revealed" : ""}${isLocked ? " fp-card--locked" : ""}`}>
      ...
    </div>
  );
})}
```

```css
/* 3. Block all clicks during modal */
.future-peek-scene {
  pointer-events: auto;  /* was: none */
  cursor: default;
}
```

**Verified**: Cards stay face-down for 5s, then flip with stagger. Modal blocks all underlying clicks.

### Bug 2: Turn timer stuck ở 0s ✅

**Triệu chứng**: Timer về 0s nhưng không update nữa, bot đứng im.

**Root cause**: Frontend tin tưởng server snapshot value `gs.turnRemainingSec` cho đến khi có snapshot mới. Khi server gửi `turnRemainingSec=0`, frontend giữ 0s không recompute. Bot thực ra backend vẫn advance bình thường nhưng frontend hiển thị sai.

**Fix** (GamePage.jsx):
```jsx
// Always compute client-side using turnStartedAt (recomputes every second via `now`)
const turnRemainingSec = (() => {
  if (gameEnded) return null;
  if (gs?.turnStartedAt) {
    const start = new Date(gs.turnStartedAt).getTime();
    if (Number.isFinite(start)) {
      const remainingMs = turnLimitSec * 1000 - (now - start);
      const clientSec = remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 1000);
      // Take max(client, server) — server snapshot may be fresher
      if (typeof gs?.turnRemainingSec === "number" && gs.turnRemainingSec > 0) {
        return Math.max(clientSec, gs.turnRemainingSec);
      }
      return clientSec;
    }
  }
  return gs?.turnRemainingSec ?? null;
})();
```

**Verified**: Timer giờ tick đúng mỗi giây dựa trên `turnStartedAt` local time. Server snapshot chỉ dùng làm fallback hint.

## ✅ Responsive Bugs FIXED

### Fix 1: Landing Page Mobile ✅
Added extra small breakpoint (≤400px) and improved ≤480px breakpoint:
- `clamp(28px, 8vw, 38px)` title scaling at very small
- `clamp(30px, 9vw, 44px)` at small screens
- Full-width buttons, reduced padding
- Removed `min-height` from welcome-panel/landing-page

### Fix 2: Lobby Mobile ✅
Stacked layout at ≤480px:
- `grid-template-columns: 1fr` (single column)
- Deck-area first (order: 1), then seats (order: 2, 3)
- Seats wrap horizontally below deck
- `deck-area { min-height: 160px }` ensures visibility

### Fix 3: Game Mobile ✅
- `.game-action-btn` at 480px: padding `10px 18px`, font 13px (was 8px 12px, 11px)
- `.game-action-btn { flex-shrink: 0 }` prevents button shrinking
- Hand-arc height: `clamp(140px, 22vh, 200px)` (was 120px fixed)

## 🎬 Animation Status

| Animation | Type | Status |
|---|---|---|
| Landing panel entry | CSS keyframe | ✅ |
| Floating cards (all pages) | CSS float | ✅ |
| Avatar deck carousel | CSS/JS | ✅ |
| Avatar modal fade-in | CSS keyframe | ✅ |
| Seat fade-in (join) | CSS keyframe | ✅ |
| Deck wiggle (3-phase) | CSS keyframe | ✅ |
| Ready checkmark pop | CSS keyframe | ✅ |
| Code copy ripple | CSS keyframe | ✅ |
| Test lobby tab switch | CSS transition | ✅ |
| Test lobby modal pop-in | CSS keyframe | ✅ |
| Game backdrop (stars + float) | CSS keyframe | ✅ |
| HandArc fan-in stagger | anime.js | ✅ |
| Seat turn pulse | anime.js | ✅ |
| Draw animation | anime.js | ✅ |
| Turn timer | JS interval | ✅ |

## 🔧 Bugs Fixed During Testing

### handCounts = 0 (Critical)
**Root cause**: SignalR broadcasts `Room` entity (no `Members`) → `normalizeRoom` early-return → `handCounts` not computed → `Seat` shows 0.

**Fixes**:
1. `useGameChannel.js normalizeRoom()`: Compute `handCounts` from `Hands` dictionary
2. `GamePage.jsx safeSetRoom()`: Preserve `gameState` when member remap drops it

### gameState Dropped on Member Remap
**Root cause**: `next = { ...next, members: next.members.map(...) }` loses `gameState`.

**Fix**: Re-inject `prev.gameState` when `next.gameState` is undefined after remap.

## 📁 Test Files

- `TEST-REPORT.md` — This report
- `GALLERY.html` — Interactive screenshot gallery
- `manual/comprehensive-ui-test.js` — 3-player game flow
- `manual/motion-effects-test.js` — Animation capture
- `manual/testlobby-deep-test.js` — Test lobby interactions
- `manual/responsive-test.js` — 3-viewport responsive test
