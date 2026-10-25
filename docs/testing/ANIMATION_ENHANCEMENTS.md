# Animation Enhancement Implementation Plan

## Priority 1: Critical UX Improvements

### 1. Enhanced Draw Card Animation
**Status**: Implementing
**Goal**: Add depth and polish to the most frequent action

```javascript
// In DrawAnimation.jsx - add 3D wobble
const drawTimeline = anime.timeline({
  targets: cardEl,
  easing: 'cubicBezier(0.38, 0, 0.22, 1)',
})
.add({
  translateX: [startX, apexX, endX],
  translateY: [startY, apexY, endY],
  rotateY: [0, 15, 180],      // Y-axis flip
  rotateX: [0, -8, 0],         // NEW: subtle tilt during flight
  rotateZ: [-5, 3, 0],         // NEW: wobble rotation
  scale: [0.7, 1.1, 0.55],
  duration: 520
});

// Add trail particles that fade
for (let i = 0; i < 8; i++) {
  const particle = document.createElement('div');
  particle.className = 'draw-trail-particle';
  // Spawn along arc path with delay
  anime({
    targets: particle,
    translateX: [...positions],
    translateY: [...positions],
    scale: [1, 0],
    opacity: [0.8, 0],
    duration: 400,
    delay: i * 30
  });
}
```

### 2. Deck Pulse on Your Turn
**Status**: New feature
**Goal**: Visual cue to draw when it's your turn

```css
/* In game.css */
.deck-pile--my-turn {
  animation: deck-pulse-glow 1.2s ease-in-out infinite;
}

@keyframes deck-pulse-glow {
  0%, 100% {
    box-shadow: 0 8px 24px rgba(168, 124, 245, 0.4);
    transform: translateY(-10px) scale(1);
  }
  50% {
    box-shadow: 0 12px 40px rgba(168, 124, 245, 0.8),
                0 0 60px rgba(255, 215, 130, 0.5);
    transform: translateY(-10px) scale(1.05);
  }
}

.deck-pile--my-turn::after {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: inherit;
  border: 2px solid rgba(255, 215, 130, 0.6);
  animation: deck-ring-expand 1.2s ease-out infinite;
}

@keyframes deck-ring-expand {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.3); opacity: 0; }
}
```

### 3. Button Micro-interactions
**Status**: Implementing

```css
/* Enhanced button press feedback */
.btn-action {
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-action:active {
  transform: scale(0.95);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Ripple effect on click */
@keyframes btn-ripple {
  0% {
    transform: scale(0);
    opacity: 0.6;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
```

## Priority 2: Gameplay Enhancements

### 4. Turn Transition Spotlight
**Status**: Planning

```javascript
// In GamePage.jsx - when turn changes
useEffect(() => {
  if (!gameState?.currentTurnMemberId) return;
  
  const currentPlayerEl = document.querySelector(
    `[data-player-id="${gameState.currentTurnMemberId}"]`
  );
  
  if (currentPlayerEl) {
    // Add spotlight overlay
    const spotlight = document.createElement('div');
    spotlight.className = 'turn-spotlight';
    
    const rect = currentPlayerEl.getBoundingClientRect();
    spotlight.style.left = `${rect.left + rect.width/2}px`;
    spotlight.style.top = `${rect.top + rect.height/2}px`;
    
    document.body.appendChild(spotlight);
    
    anime({
      targets: spotlight,
      scale: [0, 1.2],
      opacity: [0.8, 0],
      duration: 800,
      easing: 'easeOutExpo',
      complete: () => spotlight.remove()
    });
  }
}, [gameState?.currentTurnMemberId]);
```

### 5. Combo Chain Reaction
**Status**: New feature

```javascript
// In ComboSelectionModal.jsx - when combo played
function playComboAnimation(comboCards) {
  const timeline = anime.timeline();
  
  comboCards.forEach((card, i) => {
    // Each card in combo flies to center with delay
    timeline.add({
      targets: `.combo-card-${i}`,
      translateX: [cardPos[i].x, centerX],
      translateY: [cardPos[i].y, centerY],
      scale: [1, 1.3, 1],
      rotate: [0, 360],
      duration: 400,
      delay: i * 100,
    }, i * 150);
  });
  
  // Explosion when all cards meet
  timeline.add({
    targets: '.combo-explosion',
    scale: [0, 2.5],
    opacity: [1, 0],
    duration: 600,
  });
  
  // Counter animates up
  timeline.add({
    targets: '.combo-counter',
    innerHTML: [0, comboCards.length],
    round: 1,
    duration: 300,
    easing: 'easeOutExpo'
  }, '-=400');
}
```

### 6. Deck Depletion Warning
**Status**: Implementing

```css
.deck-pile--low {
  animation: deck-warning 0.8s ease-in-out infinite;
}

@keyframes deck-warning {
  0%, 100% {
    box-shadow: 0 8px 24px rgba(255, 60, 60, 0.4);
    filter: brightness(1);
  }
  50% {
    box-shadow: 0 12px 40px rgba(255, 60, 60, 0.8),
                0 0 60px rgba(255, 100, 60, 0.6);
    filter: brightness(1.2);
  }
}

.deck-count-badge--warning {
  background: rgba(255, 60, 60, 0.9);
  animation: badge-shake 0.5s ease-in-out infinite;
}

@keyframes badge-shake {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-3px) rotate(-5deg); }
  75% { transform: translateX(3px) rotate(5deg); }
}
```

## Priority 3: Victory/Polish

### 7. Victory Confetti
**Status**: New component

```javascript
// ConfettiExplosion.jsx
import anime from 'animejs';

export function ConfettiExplosion({ winner }) {
  useEffect(() => {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    
    // Create 50 confetti pieces
    for (let i = 0; i < 50; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.background = `hsl(${Math.random() * 360}, 70%, 60%)`;
      container.appendChild(piece);
      
      const angle = Math.random() * Math.PI * 2;
      const velocity = 200 + Math.random() * 300;
      const endX = Math.cos(angle) * velocity;
      const endY = Math.sin(angle) * velocity - 400; // Gravity
      
      anime({
        targets: piece,
        translateX: [0, endX],
        translateY: [0, endY, endY + 800],
        rotateZ: [0, Math.random() * 720],
        scale: [1, 0.5],
        opacity: [1, 1, 0],
        duration: 2000 + Math.random() * 1000,
        delay: i * 20,
        easing: 'easeOutCubic',
        complete: () => piece.remove()
      });
    }
    
    return () => container.remove();
  }, []);
  
  return null;
}
```

### 8. Card Hover Zoom
**Status**: Implementing

```css
.hand-card {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.hand-card:hover {
  transform: translateY(-20px) scale(1.15);
  z-index: 100;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6),
              0 0 40px rgba(168, 124, 245, 0.4);
}

.hand-card::after {
  content: attr(data-card-description);
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  background: rgba(20, 12, 40, 0.95);
  border: 1px solid rgba(168, 124, 245, 0.4);
  border-radius: 8px;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.hand-card:hover::after {
  opacity: 1;
  transition-delay: 0.3s;
}
```

### 9. Connection Status Indicator
**Status**: New component

```javascript
// ConnectionStatus.jsx
export function ConnectionStatus() {
  const [status, setStatus] = useState('connected');
  
  return (
    <div className={`connection-status connection-status--${status}`}>
      <div className="connection-dot" />
      <span className="connection-text">
        {status === 'connected' && 'Online'}
        {status === 'connecting' && 'Đang kết nối...'}
        {status === 'disconnected' && 'Mất kết nối'}
      </span>
    </div>
  );
}
```

```css
.connection-status {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(20, 12, 40, 0.9);
  border: 1px solid rgba(168, 124, 245, 0.3);
  border-radius: 999px;
  font-size: 11px;
  z-index: 300;
  backdrop-filter: blur(8px);
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 8px #4ade80;
}

.connection-status--connecting .connection-dot {
  background: #fbbf24;
  animation: connection-pulse 1s ease-in-out infinite;
}

.connection-status--disconnected .connection-dot {
  background: #ef4444;
  animation: none;
}

@keyframes connection-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}
```

## Implementation Timeline

**Phase 1 (Immediate)**: 
- ✅ Create test folder structure
- ✅ Write comprehensive test checklist
- ⏳ Deck pulse on turn
- ⏳ Button micro-interactions
- ⏳ Enhanced draw wobble

**Phase 2 (Today)**:
- Turn spotlight
- Deck depletion warning
- Connection status indicator
- Card hover zoom

**Phase 3 (Optional enhancements)**:
- Combo chain reaction
- Victory confetti
- Trophy/medal animation
- Haptic feedback (mobile)

## Testing After Implementation

```bash
# Manual test each animation
1. Draw card multiple times → check wobble, trail
2. Play action cards → check button feedback
3. Check turn transitions → spotlight moves
4. Reduce deck to < 5 → warning appears
5. Win game → confetti explodes
6. Hover over cards → zoom and tooltip
7. Disconnect network → status updates
```
