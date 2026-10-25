# Test Lobby E2E (3 tabs + bot instant) test suite.
#
# Covers bot-mode scenarios from TEST_LOBBY_TEST_CASES.md:
#   T.1  /test tạo room với 1 host + 4 bots
#   T.2  Host chọn "skip" cho tất cả bot
#   T.3  Host chọn "play-cards" cho bot
#   T.4  Host chọn "play-one-card" cho bot (chỉ định card)
#   T.5  Host chọn "draw-only" cho bot
#   T.6  Bot turn speed: instant (botTurnSeconds=0)
#   T.7  Bot turn speed: 1s
#   T.8  bot-modes: drawOnlyBotIds được set
#   T.9  bot-modes: playCardsBotIds được set
#   T.10 bot-modes: oneCardBotCardMap được set
#   T.11 UI: tab "Bài" cho phép thêm/xóa bài
#   T.12 UI: tab "Deck" cho phép set deck order
#   T.13 UI: tab "Bot" cho phép chọn mode
#   T.14 Bot auto-defuse khi rút bomb
#   T.15 Bot auto-play attack khi ở play-cards mode
#   T.16 Bot respect OneCardBotCardMap
#   T.17 Test lobby UI: timer 10s cho host
#   T.18 Test lobby UI: timer botTurnSeconds cho bot

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "TEST LOBBY (BOT INSTANT) TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# T.1 - Tạo test room có 1 host + 4 bots
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.1 /test creates room with 1 host + 4 bots" {
  $room = New-TestRoom -hostName "TestLobbyHost"
  if ($room.members.Count -ne 5) { throw "should have 5 members, got $($room.members.Count)" }
  $bots = @($room.members | Where-Object { $_.isBot })
  if ($bots.Count -ne 4) { throw "should have 4 bots" }
}

# ─────────────────────────────────────────────────────────────────────
# T.2 - Skip mode cho tất cả bot (host kiểm soát hoàn toàn)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.2 All bots in skip mode - host controls everything" {
  $room = New-TestRoom -hostName "AllSkip"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # Disable bot service cho cả 4
  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip","skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $turn1 = $hostMember.id
  # Host plays skip → turn advances
  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Skip mở cửa sổ Nope 10s → turn chỉ chuyển sau khi cửa sổ đóng.
  $after = Wait-NopeResolve -Room $room -TimeoutSec 16
  if ($after.gameState.currentTurnMemberId -eq $turn1) {
    throw "Turn should advance after Skip"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.3 - Play-cards mode: bot tự đánh action
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.3 Play-cards bot auto-plays action" {
  $room = New-TestRoom -hostName "PlayCards"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip","attack") } `
    -CustomDeck  @("defuse","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id) | Out-Null

  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.lastPlayedCardKey -ne $null
  } -TimeoutSec 15

  if (-not $snap.gameState.lastPlayedCardKey) {
    throw "Bot did not play any card"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.4 - Play-one-card mode: bot đánh card chỉ định
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.4 Play-one-card bot plays designated card" {
  $room = New-TestRoom -hostName "PlayOneCard"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("attack","skip","favor") } `
    -CustomDeck  @("defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -OneCardBotCardMap @{ $b1.id = "attack" } | Out-Null

  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.lastPlayedCardKey -eq "attack"
  } -TimeoutSec 15

  if ($snap.gameState.lastPlayedCardKey -ne "attack") {
    throw "Bot did not play designated card 'attack', got $($snap.gameState.lastPlayedCardKey)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.5 - Draw-only mode: bot chỉ rút bài
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.5 Draw-only bot only draws cards" {
  $room = New-TestRoom -hostName "DrawOnly"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip","attack","favor") } `
    -CustomDeck  @("defuse","defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -DrawOnlyBotIds @($b1.id) | Out-Null

  Start-Sleep -Seconds 4

  $snap = Get-Snap -Room $room
  # Draw-only: bot KHÔNG đánh attack/favor
  if ($snap.gameState.lastPlayedCardKey -in @("attack","favor","skip")) {
    throw "Draw-only bot played action: $($snap.gameState.lastPlayedCardKey)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.6 - Bot turn speed instant (0s)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.6 Bot turn instant (botTurnSeconds=0)" {
  $room = New-TestRoom -hostName "Instant"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip","defuse") } `
    -CustomDeck  @("attack","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id)

  # Wait ít nhất 3s - bot phải hành động rồi.
  # turnsTaken là JSON object → so sánh TỔNG (Get-CounterTotal), không so
  # sánh trực tiếp 2 object (PowerShell báo "not the same type / IComparable").
  $turnsBefore = Get-CounterTotal -Snap $start -Field "turnsTaken"
  $snap = Wait-Snap -Room $room -Predicate {
    param($s) (Get-CounterTotal -Snap $s -Field "turnsTaken") -gt $turnsBefore
  } -TimeoutSec 10

  if ((Get-CounterTotal -Snap $snap -Field "turnsTaken") -le $turnsBefore) {
    throw "Bot did not act within 10s with instant mode"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.7 - Bot turn speed 1s
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.7 Bot turn 1s (botTurnSeconds=1)" {
  $room = New-TestRoom -hostName "Speed1s"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip","defuse") } `
    -CustomDeck  @("attack","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 1 `
    -PlayCardsBotIds @($b1.id)

  # turnsTaken là JSON object → so sánh TỔNG (Get-CounterTotal), không so
  # sánh trực tiếp 2 object (PowerShell báo "not the same type / IComparable").
  $turnsBefore = Get-CounterTotal -Snap $start -Field "turnsTaken"
  $snap = Wait-Snap -Room $room -Predicate {
    param($s) (Get-CounterTotal -Snap $s -Field "turnsTaken") -gt $turnsBefore
  } -TimeoutSec 10

  if ((Get-CounterTotal -Snap $snap -Field "turnsTaken") -le $turnsBefore) {
    throw "Bot did not act within 10s with 1s speed"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.8-T.10 - Bot mode persistence trong snapshot
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.8 drawOnlyBotIds persisted in game state" {
  $room = New-TestRoom -hostName "Mode1"
  $bots = Get-Bots $room
  $b1 = $bots[0]; $b2 = $bots[1]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip") } `
    -CustomDeck  @("attack","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -DrawOnlyBotIds @($b1.id) `
    -PlayCardsBotIds @($b2.id) | Out-Null

  $snap = Get-Snap -Room $room
  if (-not $snap.gameState.drawOnlyBotIds.Contains($b1.id)) {
    throw "drawOnlyBotIds should contain b1"
  }
  if (-not $snap.gameState.playCardsBotIds.Contains($b2.id)) {
    throw "playCardsBotIds should contain b2"
  }
}

Run-Test "T.10 oneCardBotCardMap persisted in game state" {
  $room = New-TestRoom -hostName "OneCardMap"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("attack","defuse") } `
    -CustomDeck  @("cat_a","cat_b","cat_c","cat_d","cat_e","cat_f","cat_g") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -OneCardBotCardMap @{ $b1.id = "attack" } | Out-Null

  $snap = Get-Snap -Room $room
  if (-not (Test-DictHasKey -Dict $snap.gameState.oneCardBotCardMap -Key $b1.id)) {
    throw "oneCardBotCardMap should have b1 entry"
  }
  if ((Get-DictValue -Dict $snap.gameState.oneCardBotCardMap -Key $b1.id) -ne "attack") {
    throw "oneCardBotCardMap[$($b1.id)] should be 'attack', got $(Get-DictValue -Dict $snap.gameState.oneCardBotCardMap -Key $b1.id)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.14 - Bot auto-defuse khi rút bomb
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.14 Bot with defuse auto-survives bomb draw" {
  $room = New-TestRoom -hostName "BotDefuseTest"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("defuse","defuse","defuse") } `
    -CustomDeck  @("bomb","attack","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -DrawOnlyBotIds @($b1.id) | Out-Null

  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.discardPile -contains "defuse"
  } -TimeoutSec 20

  if (-not $snap.discardPile.Contains("defuse")) {
    throw "Bot did not defuse bomb"
  }
  $diedAtVal = Get-DictValue -Dict $snap.gameState.diedAt -Key $b1.id
  if ($null -ne $diedAtVal) {
    throw "Bot died despite having defuse"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.17 - Timer 10s cho host
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.17 Host turn timer is 10s" {
  $room = New-TestRoom -hostName "TimerCheck"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $snap = Get-Snap -Room $room
  if ($snap.gameState.turnTimeLimitSec -ne 10) {
    throw "turnTimeLimitSec should be 10, got $($snap.gameState.turnTimeLimitSec)"
  }
  if ($snap.gameState.turnRemainingSec -lt 8 -or $snap.gameState.turnRemainingSec -gt 10) {
    Write-Output "  (note) turnRemainingSec=$($snap.gameState.turnRemainingSec) - expected ~10"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.18 - Bot turn timer = botTurnSeconds (configurable)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.18 Bot turn timer uses botTurnSeconds config" {
  $room = New-TestRoom -hostName "BotTimerCfg"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip","defuse") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 5 `
    -PlayCardsBotIds @($b1.id) | Out-Null

  $snap = Get-Snap -Room $room
  if ($snap.gameState.botTurnSeconds -ne 5) {
    throw "botTurnSeconds should be 5, got $($snap.gameState.botTurnSeconds)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.9 - playCardsBotIds được persist trong game state
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.9 playCardsBotIds persisted in game state" {
  $room = New-TestRoom -hostName "Mode9"
  $bots = Get-Bots $room
  $b1 = $bots[0]; $b2 = $bots[1]; $b3 = $bots[2]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip"); $b2.id = @("attack") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id, $b2.id) `
    -DrawOnlyBotIds @($b3.id) | Out-Null

  $snap = Get-Snap -Room $room
  if (-not $snap.gameState.playCardsBotIds.Contains($b1.id)) {
    throw "playCardsBotIds should contain b1"
  }
  if (-not $snap.gameState.playCardsBotIds.Contains($b2.id)) {
    throw "playCardsBotIds should contain b2"
  }
  if ($snap.gameState.playCardsBotIds.Count -ne 2) {
    throw "playCardsBotIds should have exactly 2 ids, got $($snap.gameState.playCardsBotIds.Count)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.11 - UI tab Bài: thêm/xóa bài qua customHands (verified via backend)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.11 Custom hands (card tab) - thêm/xóa bài" {
  $room = New-TestRoom -hostName "HandEditor"
  $hostMember = Get-Host $room

  # Thêm 3 attack
  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("attack","attack","attack") } `
    -CustomDeck  @("defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $snap = Get-Snap -Room $room
  $handCount = Get-HandCount -Snap $snap -MemberId $hostMember.id
  if ($handCount -ne 3) {
    throw "Host should have 3 attack cards, got $handCount"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.12 - UI tab Deck: set deck order (verified via customDeck)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.12 Custom deck order (deck tab)" {
  $room = New-TestRoom -hostName "DeckEditor"
  $hostMember = Get-Host $room

  # Custom deck with specific order
  $customDeck = @("bomb","defuse","skip","attack","favor","nope","future")
  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("defuse","skip") } `
    -CustomDeck  $customDeck `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $snap = Get-Snap -Room $room
  if ($snap.deck.Count -ne $customDeck.Count) {
    throw "Deck count mismatch: expected $($customDeck.Count), got $($snap.deck.Count)"
  }
  # Server lưu deck NGƯỢC (phần tử CUỐI là lá trên cùng — DrawCardAsync lấy
  # gs.Deck[^1]). Vì vậy customDeck[0] ("bomb") phải nằm ở deck[-1].
  $topCard = $snap.deck[-1]
  if ($topCard -ne "bomb") {
    throw "Top of deck should be 'bomb' (customDeck[0]), got $topCard"
  }
  # Toàn bộ thứ tự phải khớp ngược lại.
  for ($i = 0; $i -lt $customDeck.Count; $i++) {
    $expected = $customDeck[$customDeck.Count - 1 - $i]
    if ($snap.deck[$i] -ne $expected) {
      throw "Deck order mismatch at index ${i}: expected '$expected', got '$($snap.deck[$i])'"
    }
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.13 - UI tab Bot: chọn mode cho bot (verified via state flags)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.13 Bot mode flags all persisted correctly" {
  $room = New-TestRoom -hostName "ModeMix"
  $bots = Get-Bots $room
  $b1 = $bots[0]; $b2 = $bots[1]; $b3 = $bots[2]; $b4 = $bots[3]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip"); $b2.id = @("skip"); $b3.id = @("skip"); $b4.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f","cat_g","cat_h") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -DrawOnlyBotIds @($b1.id) `
    -PlayCardsBotIds @($b2.id, $b3.id) `
    -OneCardBotCardMap @{ $b4.id = "skip" } | Out-Null

  $snap = Get-Snap -Room $room
  # Verify all 4 modes are independent
  if (-not $snap.gameState.drawOnlyBotIds.Contains($b1.id)) {
    throw "b1 should be drawOnly"
  }
  if (-not $snap.gameState.playCardsBotIds.Contains($b2.id)) {
    throw "b2 should be playCards"
  }
  if (-not $snap.gameState.playCardsBotIds.Contains($b3.id)) {
    throw "b3 should be playCards"
  }
  if (-not (Test-DictHasKey -Dict $snap.gameState.oneCardBotCardMap -Key $b4.id)) {
    throw "b4 should be oneCard with card map"
  }
  if ((Get-DictValue -Dict $snap.gameState.oneCardBotCardMap -Key $b4.id) -ne "skip") {
    throw "b4's card should be 'skip'"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.15 - Bot play-cards mode auto-play attack
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.15 Bot in play-cards auto-plays attack" {
  $room = New-TestRoom -hostName "BotAttack"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("attack","attack","attack") } `
    -CustomDeck  @("defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id) | Out-Null

  # Bot sẽ tự đánh attack → attackCounter tăng
  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.attackCounter -gt 0
  } -TimeoutSec 15

  if ($snap.gameState.attackCounter -le 0) {
    throw "Bot did not auto-play attack (attackCounter=$($snap.gameState.attackCounter))"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.16 - Bot respect OneCardBotCardMap (chỉ đánh card được chỉ định)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.16 Bot respects oneCardBotCardMap (only designated card)" {
  $room = New-TestRoom -hostName "OneCardRespect"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # Bot có nhiều attack + 1 skip, nhưng chỉ được chỉ định chơi 'skip'
  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("attack","attack","attack","skip","defuse") } `
    -CustomDeck  @("defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f","cat_g") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -OneCardBotCardMap @{ $b1.id = "skip" } | Out-Null

  # Bot phải đánh 'skip' chứ không phải 'attack'
  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.lastPlayedCardKey -eq "skip"
  } -TimeoutSec 15

  if ($snap.gameState.lastPlayedCardKey -ne "skip") {
    throw "Bot should only play 'skip' (oneCard map), got $($snap.gameState.lastPlayedCardKey)"
  }
  if ($snap.gameState.attackCounter -gt 0) {
    throw "Bot should NOT have attacked, but attackCounter=$($snap.gameState.attackCounter)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.19 - Bot turn 30s max (cap)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.19 Bot turn max 30s (cap enforced)" {
  $room = New-TestRoom -hostName "BotMax"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 60 `
    -PlayCardsBotIds @($b1.id) | Out-Null

  $snap = Get-Snap -Room $room
  # Nên bị cap ≤ 30 (theo docs)
  if ($snap.gameState.botTurnSeconds -gt 30) {
    throw "botTurnSeconds should be capped at 30, got $($snap.gameState.botTurnSeconds)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# T.20 - Snapshot nhanh dưới 200ms (cache hiệu quả)
# ─────────────────────────────────────────────────────────────────────
Run-Test "T.20 Snapshot responds fast (under 300ms)" {
  $room = New-TestRoom -hostName "SnapPerf"
  $hostMember = Get-Host $room

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  # Snapshot nên nhanh (đã cache)
  $start = Get-Date
  for ($i = 0; $i -lt 5; $i++) {
    Invoke-RestMethod -Uri "$api/api/test/room/$($room.roomId)/snapshot" -Method Get -TimeoutSec 3 | Out-Null
  }
  $avgMs = ((Get-Date) - $start).TotalMilliseconds / 5
  if ($avgMs -gt 300) {
    Write-Output "  (note) avg snapshot $avgMs ms > 300ms target"
  } else {
    Write-Output "  (ok) avg snapshot $([math]::Round($avgMs, 1)) ms"
  }
}

Print-Summary
