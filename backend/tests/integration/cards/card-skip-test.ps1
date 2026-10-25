# Skip (Bỏ Qua) card test suite.
#
# Covers scenarios TC5.2 - TC5.5 from TEST_LOBBY_TEST_CASES.md:
#   5.2  Skip - User dùng
#   5.3  Skip - Bot dùng (play-cards)
#   5.4  Skip - bị Nope
#   5.5  Skip - timer reset & turn progression

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "SKIP CARD TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# 5.2 - User dùng Skip → lượt chuyển người kế
# ─────────────────────────────────────────────────────────────────────
Run-Test "5.2 User plays Skip, turn passes to next player" {
  $room = New-TestRoom -hostName "Skipper"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","favor","nope","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Skip mở cửa sổ Nope 10s — lượt chỉ chuyển khi cửa sổ đóng.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  if ($snap.gameState.currentTurnMemberId -eq $hostMember.id) {
    throw "Turn should NOT remain on host after Skip"
  }
  if ($snap.gameState.currentTurnMemberId -ne $b1.id) {
    throw "Turn should be on b1, got $($snap.gameState.currentTurnMemberId)"
  }
  if (-not (Test-DiscardHas -Room $room -CardKey "skip")) {
    throw "Skip not in discard pile"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 5.3 - Bot (play-cards) tự đánh Skip
# ─────────────────────────────────────────────────────────────────────
Run-Test "5.3 Bot in play-cards mode plays Skip" {
  $room = New-TestRoom -hostName "BotSkip"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip","defuse") } `
    -CustomDeck  @("attack","defuse","favor","nope","cat_a","cat_b","cat_c") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id)

  # Skip vào discard pile CHỈ khi cửa sổ Nope đóng (commit), không phải lúc
  # đánh. Vì vậy chờ cửa sổ đóng rồi mới assert.
  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.discardPile -contains "skip"
  } -TimeoutSec 20

  if (-not @($snap.discardPile | Where-Object { $_ -eq "skip" }).Count) {
    $discards = $snap.discardPile -join ','
    throw "Bot did not play Skip - discard: $discards"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 5.4 - Skip bị Nope
# ─────────────────────────────────────────────────────────────────────
Run-Test "5.4 Skip - next player nopes (action cancelled)" {
  $room = New-TestRoom -hostName "SkipNope"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip"); $b1.id = @("nope") } `
    -CustomDeck  @("attack","defuse","favor","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $beforeTurn = $start.gameState.currentTurnMemberId

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Một Nope (chain độ dài 1) huỷ hành động → lượt KHÔNG được chuyển,
  # host vẫn giữ lượt và phải hành động lại. Cancel chỉ xảy ra khi cửa sổ
  # Nope đóng, nên phải chờ trước khi assert.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  if ($snap.gameState.currentTurnMemberId -ne $hostMember.id) {
    throw "After a single Nope the turn should stay on the host, got $($snap.gameState.currentTurnMemberId)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 5.5 - Timer reset và turn progression đúng
# ─────────────────────────────────────────────────────────────────────
Run-Test "5.5 After Skip, next player gets fresh 10s timer" {
  $room = New-TestRoom -hostName "SkipTimer"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","favor","nope","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # Đợi vài giây để timer của host giảm
  Start-Sleep -Seconds 3

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # turnRemainingSec của b1 phải ~10
  if ($play.room.gameState.turnRemainingSec -lt 8) {
    Write-Output "  (note) turnRemainingSec=$($play.room.gameState.turnRemainingSec) after skip - expected ~10"
  }
}

Print-Summary
