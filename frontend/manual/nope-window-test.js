// Verify ALL action cards trigger 5s Nope window, combos don't.
//
// Cards tested:
//   ✅ Attack, Skip, Favor, Future, Shuffle → 5s Nope window (pendingAction set)
//   ❌ Combo 2-same, 3-same, 5-any → No Nope window (pendingAction stays null)

const BACKEND = 'http://localhost:5000';

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  return r.json();
}
async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  console.log('━━━ NOPE WINDOW VERIFICATION ━━━\n');

  const results = [];

  // For each card test, create a fresh room + game, then play the card
  async function testCardPlay(cardKey, isCombo = false) {
    const r = await api('POST', '/api/test/room', { hostName: 'Tester' });
    const roomId = r.roomId;
    const members = r.members;
    const testerId = members.find(m => m.name === 'Tester').id;
    const botIds = members.filter(m => m.isBot).map(m => m.id);
    const targetId = botIds[0];

    // Big deck so we don't run out
    const fullDeck = [
      'attack', 'skip', 'favor', 'future', 'shuffle', 'nope',
      'attack', 'skip', 'favor', 'future', 'shuffle', 'nope',
      'attack', 'skip', 'favor', 'future', 'shuffle', 'nope',
      'attack', 'skip', 'favor', 'future', 'shuffle', 'nope',
      'attack', 'skip', 'favor', 'future', 'shuffle', 'nope',
      'attack', 'skip', 'favor', 'future', 'shuffle', 'nope',
    ];

    // Build hands: Tester gets action cards, bots get known hands for combo targets
    const hands = {};
    if (isCombo) {
      if (cardKey === 'combo2') {
        // Tester has 2 attacks; target bot has attack to steal
        hands[testerId] = ['defuse', 'attack', 'attack', 'skip', 'favor'];
        hands[targetId] = ['defuse', 'attack', 'skip', 'favor', 'future'];
      } else if (cardKey === 'combo3') {
        // Tester has 3 skips; target bot has skip to steal (named)
        hands[testerId] = ['defuse', 'skip', 'skip', 'skip', 'attack'];
        hands[targetId] = ['defuse', 'skip', 'attack', 'favor', 'future'];
      } else if (cardKey === 'combo5') {
        // Tester has 5 combo defuses; discard pile must contain a card
        hands[testerId] = ['defuse', 'ninja', 'superman', 'zombie', 'robot'];
        hands[targetId] = ['defuse', 'attack', 'skip', 'favor', 'future'];
      }
    } else if (cardKey === 'favor') {
      hands[testerId] = ['defuse', 'favor', 'skip', 'attack', 'nope'];
      hands[targetId] = ['defuse', 'attack', 'skip', 'favor', 'future'];
    } else {
      hands[testerId] = ['defuse', cardKey, 'skip', 'attack', 'nope'];
      hands[targetId] = ['defuse', 'attack', 'skip', 'favor', 'future'];
    }

    await api('POST', '/api/test/start', {
      roomId, botTurnSeconds: 0, drawOnlyBotIds: botIds,
      customDeck: fullDeck, customHands: hands,
    });

    await api('POST', `/api/rooms/${roomId}/members/${testerId}/ready`);

    // Wait for Tester to be current turn (after ClientReady sets up)
    await wait(2000);

    let playUrl, playBody;
    if (isCombo) {
      // Combos use combo defuse cardKey (e.g. "ninja")
      if (cardKey === 'combo2') {
        playUrl = `/api/rooms/${roomId}/game/play-card`;
        playBody = { memberId: testerId, cardKey: 'ninja', comboKind: 'twoSame', targetMemberId: targetId, discardPickKey: 'attack' };
      } else if (cardKey === 'combo3') {
        playUrl = `/api/rooms/${roomId}/game/play-card`;
        playBody = { memberId: testerId, cardKey: 'superman', comboKind: 'threeSame', targetMemberId: targetId, discardPickKey: 'skip' };
      } else if (cardKey === 'combo5') {
        playUrl = `/api/rooms/${roomId}/game/play-card`;
        playBody = { memberId: testerId, cardKey: 'zombie', comboKind: 'fiveAny', discardPickKey: 'attack' };
      }
    } else {
      playUrl = `/api/rooms/${roomId}/game/play-card`;
      playBody = { memberId: testerId, cardKey };
      if (cardKey === 'favor') {
        // Favor needs a target
        playBody.targetMemberId = targetId;
      }
    }

    const playRes = await api('POST', playUrl, playBody);

    // Check if pendingAction was set
    const gs = playRes.room?.gameState || playRes.gameState;
    const hasPendingAction = !!gs?.pendingAction;
    const pendingCardKey = gs?.pendingAction?.cardKey;

    return { cardKey, isCombo, hasPendingAction, pendingCardKey, error: playRes.error };
  }

  // Test action cards (should HAVE pendingAction)
  const actionCards = ['attack', 'skip', 'favor', 'future', 'shuffle'];
  for (const card of actionCards) {
    const r = await testCardPlay(card, false);
    const ok = r.hasPendingAction && r.pendingCardKey === card;
    results.push({ ...r, expected: 'pendingAction SET', ok });
    console.log(`${ok ? '✅' : '❌'} ${card.padEnd(8)} → pendingAction=${r.pendingCardKey || 'null'} (expected: ${card})`);
    await wait(500);
  }

  // Test combos (should NOT have pendingAction)
  console.log('');
  const combos = [
    { key: 'combo2', label: 'combo 2-same (steal)' },
    { key: 'combo3', label: 'combo 3-same (name)' },
    { key: 'combo5', label: 'combo 5-any (from discard)' },
  ];
  for (const c of combos) {
    const r = await testCardPlay(c.key, true);
    const ok = !r.hasPendingAction;
    results.push({ ...r, expected: 'pendingAction NULL', ok });
    console.log(`${ok ? '✅' : '❌'} ${c.label.padEnd(30)} → pendingAction=${r.pendingCardKey || 'null'} (expected: null)`);
    await wait(500);
  }

  // Summary
  console.log('\n━━━ SUMMARY ━━━');
  const pass = results.filter(r => r.ok).length;
  const total = results.length;
  console.log(`${pass}/${total} passed`);

  if (pass !== total) {
    console.log('\nFailed:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  ${r.cardKey}: ${r.expected} but got pendingAction=${r.pendingCardKey}`);
    });
  }

  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error('FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
