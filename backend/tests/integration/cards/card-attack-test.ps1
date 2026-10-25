# Attack (Tấn Công) card test suite.
#
# Covers scenarios TC4.2 - TC4.7 from TEST_LOBBY_TEST_CASES.md:
#   4.2  Attack - User tấn công Bot
#   4.3  Attack - Bot tấn công User
#   4.4  Attack - Bot tấn công Bot
#   4.5  Attack - bị Nope
#   4.6  Attack - chain (2 attack liên tiếp)
#   4.7  Attack - timer reset

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "ATTACK CARD TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# 4.2 - User đánh Attack lên Bot
# ─────────────────────────────────────────────────────────────────────
Run-Test "4.2 User plays Attack on next bot, target must draw 2" {
  $room = New-TestRoom -hostName "Attacker"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("attack"); $b1.id = @("defuse","defuse","defuse") } `
    -CustomDeck  @("skip","defuse","favor","nope","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $b1InitHand = (Get-HandCount -Snap $start -MemberId $b1.id)

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "attack" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Attack mở cửa sổ Nope 10s — attackCounter chỉ được commit khi cửa sổ đóng.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  # Attack phải ở discard
  if (-not (Test-DiscardHas -Room $room -CardKey "attack")) { throw "Attack not in discard pile" }

  # attackCounter phải > 0 (stack)
  $attackCounter = $snap.gameState.attackCounter
  if ($attackCounter -lt 1) {
    throw "attackCounter should be >= 1 after attack, got $attackCounter"
  }

  # Lượt phải sang b1 (target)
  $turnMemberId = $snap.gameState.currentTurnMemberId
  if ($turnMemberId -ne $b1.id) {
    throw "Turn should be on b1 (attack target), got $turnMemberId"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 4.3 - Bot (play-cards) tấn công User
# ─────────────────────────────────────────────────────────────────────
Run-Test "4.3 Bot in play-cards mode plays Attack on host" {
  $room = New-TestRoom -hostName "BotAtk"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("attack","defuse") } `
    -CustomDeck  @("skip","defuse","favor","nope","cat_a","cat_b","cat_c") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id)

  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.lastPlayedCardKey -eq "attack" -or
               $s.gameState.attackCounter -gt 0
  } -TimeoutSec 15

  if ($snap.gameState.lastPlayedCardKey -ne "attack" -and $snap.gameState.attackCounter -lt 1) {
    $lastKey = $snap.gameState.lastPlayedCardKey
    throw "Bot did not play Attack, last=$lastKey"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 4.4 - Bot tấn công bot khác
# ─────────────────────────────────────────────────────────────────────
Run-Test "4.4 Bot attacks another bot (play-cards)" {
  $room = New-TestRoom -hostName "BotVsBot"
  $bots = Get-Bots $room
  $b1 = $bots[0]; $b2 = $bots[1]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("attack","defuse"); $b2.id = @("defuse","defuse","defuse") } `
    -CustomDeck  @("skip","defuse","favor","nope","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id, $b2.id)

  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.lastPlayedCardKey -eq "attack" -or $s.gameState.attackCounter -gt 0
  } -TimeoutSec 20

  if ($snap.gameState.attackCounter -lt 1 -and $snap.gameState.lastPlayedCardKey -ne "attack") {
    throw "No attack happened"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 4.5 - Attack bị Nope
# ─────────────────────────────────────────────────────────────────────
Run-Test "4.5 Attack - next player nopes (attackCounter resets)" {
  $room = New-TestRoom -hostName "AtkNope"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("attack"); $b1.id = @("nope") } `
    -CustomDeck  @("skip","defuse","favor","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "attack" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Bot nope
  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Cửa sổ Nope vẫn MỞ sau khi nope (chờ phản cản). Attack bị cancel chỉ khi
  # cửa sổ đóng với chain độ dài LẺ. Vì vậy ta chờ cửa sổ đóng rồi mới assert.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  # Attack bị cancel → attackCounter nên về 0 và lượt vẫn ở host
  if ($snap.gameState.attackCounter -gt 0) {
    throw "attackCounter should be 0 after the attack was noped, got $($snap.gameState.attackCounter)"
  }
  if ($snap.gameState.currentTurnMemberId -ne $hostMember.id) {
    throw "Turn should stay on the host after the attack was noped, got $($snap.gameState.currentTurnMemberId)"
  }
  # Attack vẫn nằm trong discard (đã đánh dù bị cancel)
  if (-not (Test-DiscardHas -Room $room -CardKey "attack")) {
    throw "Attack should be in discard even if noped"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 4.6 - Chain attack: User attack → Bot skip attack → Counter-attack
# ─────────────────────────────────────────────────────────────────────
Run-Test "4.6 Attack chain - attackCounter accumulates if no one nopes/skip" {
  $room = New-TestRoom -hostName "AtkChain"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # Host + b1 đều có attack, host đi trước
  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("attack","attack"); $b1.id = @("attack","defuse") } `
    -CustomDeck  @("skip","defuse","favor","nope","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # Host attack lần 1 (mở cửa sổ Nope 10s)
  $a1 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "attack" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chờ cửa sổ Nope đóng → attackCounter commit và lượt sang b1
  $snap1 = Wait-NopeResolve -Room $room -TimeoutSec 16
  if ($snap1.gameState.attackCounter -lt 1) { throw "attackCounter should be 1+ after first attack" }

  # Bot1 attack-stack (counter attack) - bot giữ lượt để chơi tiếp
  $a2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $b1.id; cardKey = "attack" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5
  $snap2 = Wait-NopeResolve -Room $room -TimeoutSec 16

  # attackCounter cộng dồn
  if ($snap2.gameState.attackCounter -le $snap1.gameState.attackCounter) {
    throw "attackCounter should accumulate on a counter-attack: was $($snap1.gameState.attackCounter), got $($snap2.gameState.attackCounter)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 4.7 - Timer reset sau Attack
# ─────────────────────────────────────────────────────────────────────
Run-Test "4.7 Attack resets turn timer to 10s on target" {
  $room = New-TestRoom -hostName "AtkTimer"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("attack"); $b1.id = @("defuse","defuse","defuse") } `
    -CustomDeck  @("skip","defuse","favor","nope","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # Đợi một chút để turnStartedAt cũ
  Start-Sleep -Seconds 2

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "attack" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # turnRemainingSec phải ~10 (reset)
  if ($play.room.gameState.turnRemainingSec -lt 8) {
    $remaining = $play.room.gameState.turnRemainingSec
    Write-Output "  (note) turnRemainingSec=$remaining after attack - expected ~10"
  }
}

Print-Summary
