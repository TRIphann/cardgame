// Bot timeout timeout test — reproduces Bug 2 with full game state.
//
// Scenario:
//   1. Tester joins room with 4 bots
//   2. Game starts, Tester is current player
//   3. Tester is HUMAN, so BotService doesn't handle Tester's turn
//   4. Tester's turn must rely on TurnTimeoutHandler to auto-advance
//   5. After auto-advance, Bot Alpha (in DrawOnlyBotIds, BotTurnSeconds=0) becomes current
//   6. Bot Alpha must auto-act within 1.5s (BotService poll interval)
//   7. Bot Beta → Bot Gamma → Bot Delta → Tester cycle
//
// If TurnTimeoutHandler doesn't fire, Tester's turn gets stuck.
// If BotService has a bug, bot turns get stuck.

const BACKEND = 'http://localhost:5000';

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  return r.json();
}

async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  console.log('━━━ BOT TIMEOUT FULL TEST ━━━\n');

  // Setup
  const r = await api('POST', '/api/test/room', { hostName: 'Tester' });
  const roomId = r.roomId;
  const members = r.members;
  const testerId = members.find(m => m.name === 'Tester').id;
  const botIds = members.filter(m => m.isBot).map(m => m.id);
  console.log(`Room: ${roomId}`);
  console.log(`Bots: ${botIds.length}`);

  // Start with all bots in drawOnly mode, fast
  await api('POST', '/api/test/start', { roomId, botTurnSeconds: 0, drawOnlyBotIds: botIds });
  console.log('Game started\n');

  // Mark Tester ready (this arms the turn clock)
  await api('POST', `/api/rooms/${roomId}/members/${testerId}/ready`);
  console.log('Tester ready\n');

  // Watch the game for 130 seconds
  // Tester's turn = 60s, then Bot Alpha (instant) → Bot Beta → Bot Gamma → Bot Delta → Tester (60s again)
  // Total: 60s + 4 bots * ~2s + 60s = ~128s
  console.log('Watching game state...\n');
  const start = Date.now();
  let lastTurn = '';
  let lastTimer = 60;
  let stuckLog = 0;

  while (Date.now() - start < 130000) {
    const state = await api('GET', `/api/test/room/${roomId}/snapshot`);
    const gs = state.gameState;
    if (!gs) { await wait(2000); continue; }

    const turnId = gs.currentTurnMemberId;
    const member = members.find(m => m.id === turnId);
    const turnName = member ? member.name : '?';
    const elapsed = Math.floor((Date.now() - new Date(gs.turnStartedAt).getTime()) / 1000);
    const remaining = Math.max(0, 60 - elapsed);

    if (turnName !== lastTurn) {
      console.log(`[${Math.floor((Date.now() - start) / 1000)}s] 🔄 Turn → ${turnName} (timer=${remaining}s, deck=${state.deck?.length || 0})`);
      lastTurn = turnName;
      lastTimer = remaining;
      stuckLog = 0;
    } else {
      // Same turn - log periodic changes
      if (remaining !== lastTimer && remaining % 10 === 0) {
        console.log(`[${Math.floor((Date.now() - start) / 1000)}s]   ${turnName} timer=${remaining}s`);
        lastTimer = remaining;
      }
      if (remaining === 0) {
        stuckLog++;
        if (stuckLog === 10) { // 10 polls × 2s = 20s stuck
          console.log(`[${Math.floor((Date.now() - start) / 1000)}s] ⚠️⚠️⚠️ STUCK: ${turnName} timer at 0s for 20s — BUG REPRODUCED`);
        }
      }
    }

    if (gs.endedAt) {
      console.log(`\nGame ended at ${Math.floor((Date.now() - start) / 1000)}s`);
      break;
    }

    await wait(2000);
  }

  console.log('\n━━━ DONE ━━━');
})().catch(err => {
  console.error('FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
