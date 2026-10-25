# Frontend Manual Testing Checklist

## Prerequisites
- ✅ Backend API running on `http://localhost:5000`
- ✅ Frontend dev server running on `http://localhost:5173`

---

## 🎨 Visual & Layout Testing

### Landing Page (`/`)
- [ ] Title animation plays smoothly (gradient shine effect)
- [ ] Background gradients render without banding
- [ ] CTA buttons are clearly visible
- [ ] Hover states work on interactive elements
- [ ] Text is readable with good contrast

### Test Lobby Page (`/test-lobby`)
- [ ] Room creation form displays properly
- [ ] Bot count slider works smoothly
- [ ] Member list updates in real-time
- [ ] Ready/Unready button states are clear
- [ ] Start game button appears for host

### Game Page (`/game/:roomId`)
- [ ] All UI sections fit on screen (no scrolling needed except player list)
- [ ] Header shows game info clearly
- [ ] Deck pile and discard pile positioned correctly
- [ ] Hand cards display in arc formation at bottom
- [ ] Action buttons are clearly labeled and accessible
- [ ] Turn indicator is visible

---

## 📱 Responsive Testing

### Desktop (1920x1080)
- [ ] All elements scale properly
- [ ] No wasted space
- [ ] Animations are smooth
- [ ] Text is not too small

### Tablet (768x1024)
- [ ] Layout adapts without breaking
- [ ] Touch targets are large enough (min 44x44px)
- [ ] Cards remain readable
- [ ] No horizontal scrolling

### Mobile Portrait (375x667 - iPhone SE)
- [ ] All critical UI visible without scrolling game area
- [ ] Hand cards don't overflow
- [ ] Buttons stack properly
- [ ] Font sizes remain readable
- [ ] Turn info doesn't overlap other elements

### Mobile Landscape (667x375)
- [ ] Short height handled gracefully
- [ ] Vertical space optimized
- [ ] Cards scaled appropriately

### Small Mobile (360x640)
- [ ] UI doesn't break
- [ ] Text doesn't overflow
- [ ] Buttons remain tappable

### Large Desktop (2560x1440)
- [ ] Elements don't become too large
- [ ] Layout remains centered/balanced
- [ ] Animations scale properly

---

## ✨ Animation Testing

### Draw Card Animation
- [ ] **Glow effect** appears at deck pile
- [ ] **Trail sparks** follow card path
- [ ] **Card flies** in smooth arc from deck to hand
- [ ] **Card flips** mid-flight (back → front)
- [ ] **Landing burst** appears when card reaches hand
- [ ] **Timing**: ~520ms total duration
- [ ] No jank or frame drops
- [ ] Works on mobile (touch devices)

### Play Card Animation
- [ ] Card flies from hand to discard pile
- [ ] Halo effect surrounds card
- [ ] Arc trajectory feels natural
- [ ] Timing: ~500ms
- [ ] Works for all card types

### Action Card Reveal (center flip)
- [ ] Card appears in center of screen
- [ ] **Halo pulse** effect behind card
- [ ] Card flips dramatically (Y-axis rotation)
- [ ] Label appears below card
- [ ] Timing: ~720ms
- [ ] "In-flight" variant works when card travels first

### Future Peek Modal
- [ ] 3 cards fly in from deck
- [ ] Each card positioned correctly
- [ ] Cards flip to reveal front
- [ ] Halo breathe effect on each card
- [ ] Info panel rises from bottom
- [ ] Close button works
- [ ] Cards fly out on close

### Bomb Reveal Sequence
1. **Pre-reveal (3s)**
   - [ ] Sparks orbit around card
   - [ ] Countdown circle animates
   - [ ] Scrim darkens background
   - [ ] Shockwave rings pulse
   
2. **Flip reveal**
   - [ ] Card flips to show bomb
   - [ ] Camera flash effect
   - [ ] Outer glow intensifies
   - [ ] Label appears below

3. **If defused**
   - [ ] Card fades out safely
   - [ ] Green tint on scrim
   - [ ] Timing: ~450ms fadeout

4. **If exploded**
   - [ ] **Flash** - white screen burst
   - [ ] **Vignette** - red edges
   - [ ] **Fireball** - orange core expands
   - [ ] **Shockwave rings** - 3 concentric rings
   - [ ] **Shards** - pieces fly outward
   - [ ] **Sparks** - colorful particles
   - [ ] **Smoke puffs** - rise upward
   - [ ] **Label** rises with emoji and text
   - [ ] Total duration: ~2.4s
   - [ ] Feels impactful but not overwhelming

### FX Burst (combo/special actions)
- [ ] Flash circle expands
- [ ] Glyph/emoji rises and spins
- [ ] Concentric rings expand
- [ ] Beam cross effect (horizontal + vertical)
- [ ] Particles scatter in all directions
- [ ] Streak lines trail outward
- [ ] Color customization works (different card types)

### Screen Shake
- [ ] Small shake (--sm): subtle, ~400ms
- [ ] Medium shake (--md): noticeable, ~600ms
- [ ] Large shake (--lg): intense, ~900ms
- [ ] Doesn't cause motion sickness
- [ ] Works with `prefers-reduced-motion`

---

## 🎮 Interaction Testing

### Card Hover/Selection
- [ ] Hover lifts card slightly
- [ ] Selected card has clear indicator
- [ ] Smooth transitions

### Button States
- [ ] Normal, hover, active, disabled all distinct
- [ ] Transitions are smooth
- [ ] Disabled buttons clearly not clickable

### Modal/Overlay
- [ ] Backdrop blur works
- [ ] Modal centers on screen
- [ ] ESC key closes modal
- [ ] Click outside closes modal (if applicable)

### Real-time Updates
- [ ] Hand updates instantly when drawing
- [ ] Discard pile updates after playing card
- [ ] Opponent actions show immediately
- [ ] Turn indicator switches smoothly

---

## ♿ Accessibility Testing

### Keyboard Navigation
- [ ] Tab order is logical
- [ ] Focus indicators are visible
- [ ] Can play game with keyboard only
- [ ] ESC closes modals

### Color Contrast
- [ ] Text readable against backgrounds (WCAG AA minimum)
- [ ] Card details visible
- [ ] Status indicators clear

### Reduced Motion
- [ ] `prefers-reduced-motion` respected
- [ ] Essential animations still work
- [ ] No flashing/strobing effects

### Touch Targets
- [ ] All buttons min 44x44px
- [ ] Cards easy to tap on mobile
- [ ] No accidental taps

---

## 🚀 Performance Testing

### Animation Performance
- [ ] 60fps during animations (check DevTools Performance)
- [ ] No layout thrashing
- [ ] GPU acceleration used where appropriate
- [ ] No memory leaks after repeated animations

### Load Time
- [ ] Initial page load < 3s
- [ ] Assets lazy-loaded
- [ ] Fonts don't cause FOUT/FOIT

### Network
- [ ] Works on slow 3G
- [ ] Polling doesn't hammer server
- [ ] Graceful fallback if connection drops

---

## 🐛 Edge Cases

### Multiple Players
- [ ] 5 players fit on screen
- [ ] Layout doesn't break with max players
- [ ] Names don't overflow

### Long Names
- [ ] Player names truncate gracefully
- [ ] Room names don't break layout

### Rapid Actions
- [ ] Multiple cards played quickly don't break animation queue
- [ ] Animations don't overlap incorrectly

### Browser Compatibility
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)
- [ ] Mobile browsers (Chrome Mobile, Safari iOS)

---

## 🎨 Proposed Animation Enhancements

### 1. **Enhanced Draw Card Animation**
**Current**: Simple arc with sparks
**Upgrade**:
- Add **card wobble** during flight (3D rotation on X/Z axis)
- **Trail particles** that fade out (not just sparks)
- **Sound cue** when card lands (if audio enabled)
- **Haptic feedback** on mobile

### 2. **Micro-interactions**
**Add**:
- **Button press** animation (scale down slightly)
- **Card shuffle** animation when deck is created
- **Deck pulse** when it's your turn to draw
- **Hand reorder** animation when sorting cards

### 3. **Combo Animation Upgrade**
**Current**: FX burst with rings
**Upgrade**:
- **Chain reaction** effect for combo cards played together
- **Number counter** that animates up (e.g., "×3 COMBO")
- **Color trail** that connects cards in combo
- **Screen tint** that matches combo type (warm for cats, cool for special)

### 4. **Turn Transition**
**Add**:
- **Smooth spotlight** that moves to current player
- **Arrow or indicator** pointing to active player
- **Ambient glow** around active player avatar

### 5. **Deck Depletion Warning**
**Add**:
- **Warning animation** when deck < 5 cards
- **Pulsing red glow** around deck pile
- **Card count badge** that shakes

### 6. **Victory/Defeat Screen**
**Current**: Summary screen
**Upgrade**:
- **Confetti explosion** for winner
- **Trophy/medal** that animates in
- **Player stats** that count up
- **Podium animation** for top 3 players

### 7. **Card Hover Preview**
**Add**:
- **Magnified preview** when hovering over small cards
- **Tooltip** with card description
- **Smooth zoom** transition

### 8. **Connection Status**
**Add**:
- **Indicator** in corner (green dot = connected)
- **Reconnecting animation** if connection drops
- **Toast notification** with slide-in animation

---

## Testing Commands

```bash
# Run backend
cd D:\gmae\backend\src\Arcana.Api
dotnet run

# Run frontend dev server
cd D:\gmae\frontend
npm run dev

# Run backend unit tests
cd D:\gmae\backend
dotnet test tests\unit\Arcana.UnitTests\Arcana.UnitTests.csproj

# Run frontend unit tests
cd D:\gmae\frontend
npm run test

# Run backend integration tests (cần server :5000 đang chạy)
cd D:\gmae\backend\tests\integration
pwsh -NoProfile -File run-all.ps1
pwsh -NoProfile -File run-all.ps1 -Only bot-modes

# Run playwright tests
cd D:\gmae\frontend
npm run e2e -- --headed
```

> 📖 Xem [`TEST_SUITE_MATRIX.md`](TEST_SUITE_MATRIX.md) cho ma trận coverage đầy đủ.

---

## Sign-off

- [ ] All critical tests pass
- [ ] No visual regressions
- [ ] Animations perform well
- [ ] Responsive across all breakpoints
- [ ] Ready for production
