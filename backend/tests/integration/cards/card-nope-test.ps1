# Nope (Cản) card test suite.
#
# Covers scenarios TC6.2 - TC6.8 from TEST_LOBBY_TEST_CASES.md:
#   6.2  Nope - cản Future
#   6.3  Nope - cản Shuffle
#   6.4  Nope - cản Attack
#   6.5  Nope - cản Skip
#   6.6  Nope - cản Favor
#   6.7  Multi-nope chain (counter-nope)
#   6.8  Bot dùng Nope

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "NOPE CARD TEST SUITE"
Write-Output "=========================================="

# Helper: kiểm tra pending action tồn tại
function Assert-Pending {
    param($Snap, $CardKey)
  $gs = Get-GS $Snap
  if ($null -eq $gs -or $null -eq $gs.pendingAction) {
    throw "Expected pendingAction for $CardKey, got null"
  }
  if ($gs.pendingAction.cardKey -ne $CardKey) {
    throw "Expected pendingAction.cardKey=$CardKey, got $($gs.pendingAction.cardKey)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 6.2 - Nope cản Future
# ─────────────────────────────────────────────────────────────────────
Run-Test "6.2 Nope cancels Future peek" {
  $room = New-TestRoom -hostName "NopeFuture"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("future"); $b1.id = @("nope") } `
    -CustomDeck  @("attack","skip","defuse","favor","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "future" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  Assert-Pending -Snap $play -CardKey "future"

  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chain lẻ → action bị cancel KHI cửa sổ Nope đóng. Chờ đóng rồi assert.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  if ($null -ne $snap.gameState.futurePeek) {
    throw "futurePeek should be null after nope"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 6.3 - Nope cản Shuffle
# ─────────────────────────────────────────────────────────────────────
Run-Test "6.3 Nope cancels Shuffle (deck unchanged)" {
  $room = New-TestRoom -hostName "NopeShuffle"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $deck = @("attack","skip","defuse","favor","cat_a","cat_b","cat_c","cat_d")
  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("shuffle"); $b1.id = @("nope") } `
    -CustomDeck  $deck `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $beforeDeck = @($start.deck)

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chain lẻ → cancel khi cửa sổ đóng. Deck phải được khôi phục về trạng thái
  # trước khi shuffle.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  $afterDeck = Get-DeckList -Room $room
  if (($afterDeck -join ',') -ne ($beforeDeck -join ',')) {
    throw "Deck should be restored after nope (shuffle cancelled). before='$($beforeDeck -join ",")' after='$($afterDeck -join ",")'"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 6.4 - Nope cản Attack
# ─────────────────────────────────────────────────────────────────────
Run-Test "6.4 Nope cancels Attack (attackCounter = 0)" {
  $room = New-TestRoom -hostName "NopeAtk"
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

  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chain lẻ → cancel khi cửa sổ đóng. AttackCounter phải về 0 (trước đó còn
  # bị để lại 1 do PreAttackCounter tính sai — đã fix trong GameService).
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  if ($snap.gameState.attackCounter -gt 0) {
    throw "attackCounter should be 0 after the attack was noped, got $($snap.gameState.attackCounter)"
  }
  if ($snap.gameState.currentTurnMemberId -ne $hostMember.id) {
    throw "Turn should stay on the host after the attack was noped, got $($snap.gameState.currentTurnMemberId)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 6.5 - Nope cản Skip
# ─────────────────────────────────────────────────────────────────────
Run-Test "6.5 Nope cancels Skip (turn stays on initiator)" {
  $room = New-TestRoom -hostName "NopeSkip"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip"); $b1.id = @("nope") } `
    -CustomDeck  @("attack","defuse","favor","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chain lẻ → skip bị cancel khi cửa sổ đóng → lượt phải vẫn ở host.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  if ($snap.gameState.currentTurnMemberId -ne $hostMember.id) {
    throw "Turn should stay on the host after the skip was noped, got $($snap.gameState.currentTurnMemberId)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 6.6 - Nope cản Favor
# ─────────────────────────────────────────────────────────────────────
Run-Test "6.6 Nope cancels Favor (no target pick)" {
  $room = New-TestRoom -hostName "NopeFavor"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("favor"); $b1.id = @("nope","defuse") } `
    -CustomDeck  @("attack","defuse","nope","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # Favor phase 1: phải chọn target trước, mở cửa sổ Nope 10s.
  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "favor"; targetMemberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if ($null -eq $play.room.gameState.pendingAction) {
    throw "Expected pendingAction for favor, got null"
  }

  # Bot nope -> favor bị cancel
  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chain lẻ → cancel khi cửa sổ đóng.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  if ($null -ne $snap.gameState.pendingFavorPick) {
    throw "pendingFavorPick should be cleared after the favor was noped"
  }
  if ($null -ne $snap.gameState.pendingAction) {
    throw "pendingAction should be cleared after the favor was noped"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 6.7 - Multi-nope chain: A nopes B, B nopes lại → action đi qua
# ─────────────────────────────────────────────────────────────────────
Run-Test "6.7 Multi-nope chain - first nope, then counter-nope cancels" {
  $room = New-TestRoom -hostName "ChainNope"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]; $b2 = $bots[1]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("shuffle"); $b1.id = @("nope"); $b2.id = @("nope") } `
    -CustomDeck  @("attack","skip","defuse","favor","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $beforeDeck = @($start.deck)

  # Host plays Shuffle
  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # b1 nope
  $n1 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # b2 counter-nope
  $n2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b2.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chain CHẴN (2 nopes) → action ĐI QUA → shuffle giữ nguyên multiset.
  # Chờ cửa sổ đóng rồi assert.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  $afterDeck = Get-DeckList -Room $room
  if (($afterDeck -join ',') -eq ($beforeDeck -join ',')) {
    throw "Deck should have been shuffled after a double-nope (action stands)"
  }
  # Multiset phải giữ nguyên dù thứ tự đổi
  $beforeSorted = (@($beforeDeck) | Sort-Object) -join ','
  $afterSorted = (@($afterDeck) | Sort-Object) -join ','
  if ($beforeSorted -ne $afterSorted) {
    throw "Double-nope should keep the same card multiset"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 6.8 - Bot dùng Nope để cản action
# ─────────────────────────────────────────────────────────────────────
Run-Test "6.8 Bot nopes user's action" {
  $room = New-TestRoom -hostName "BotNopeUser"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("shuffle"); $b1.id = @("nope") } `
    -CustomDeck  @("attack","skip","defuse","favor","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Bot manual nope (vì disableBotService đang true)
  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if (-not (Test-DiscardHas -Room $room -CardKey "nope")) {
    throw "Nope should be in discard pile"
  }
}

Print-Summary
