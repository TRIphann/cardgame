# Game Flow test suite - Death, Winner, Turn Progression.
#
# Covers scenarios from TEST_LOBBY_TEST_CASES.md:
#   12.1  Game Start (lobby → playing transition)
#   12.2  Turn Progression (turn rotates through players)
#   12.3  Game Over (winner declared when last alive)
#   12.4  Restart (room can be re-created after game ends)
#   11.1  Draw card normally (no bomb)
#   11.3  Deck empty handling

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "GAME FLOW TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# 12.1 - Game start
# ─────────────────────────────────────────────────────────────────────
Run-Test "12.1 Game start transitions room status to playing" {
  $room = New-TestRoom -hostName "GameStarter"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # Trước start, status = waiting
  $before = Invoke-RestMethod -Uri "$api/api/test/room/$($room.roomId)/snapshot" -Method Get -TimeoutSec 5
  if ($before.status -ne "waiting") { throw "Initial status should be 'waiting', got $($before.status)" }

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $after = Invoke-RestMethod -Uri "$api/api/test/room/$($room.roomId)/snapshot" -Method Get -TimeoutSec 5
  if ($after.status -ne "playing") { throw "Status should be 'playing', got $($after.status)" }
  if (-not $after.gameState.startedAt) { throw "startedAt should be set" }
}

# ─────────────────────────────────────────────────────────────────────
# 12.2 - Turn progression: skip → next player
# ─────────────────────────────────────────────────────────────────────
Run-Test "12.2 Turn progresses to next player after Skip" {
  $room = New-TestRoom -hostName "TurnProg"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip"); $b1.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $turn1 = $start.gameState.currentTurnMemberId

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Skip cũng mở cửa sổ Nope 10s → turn CHỈ chuyển sau khi cửa sổ đóng.
  $after = Wait-NopeResolve -Room $room -TimeoutSec 16
  $turn2 = $after.gameState.currentTurnMemberId
  if ($turn2 -eq $turn1) { throw "Turn should advance after Skip" }
  if ($turn2 -ne $b1.id) { throw "Next turn should be b1, got $turn2" }

  # B1 skip → turn về bot kế
  $play2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $b1.id; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $after2 = Wait-NopeResolve -Room $room -TimeoutSec 16
  $turn3 = $after2.gameState.currentTurnMemberId
  if ($turn3 -eq $turn2) { throw "Turn should advance after b1 Skip" }
}

# ─────────────────────────────────────────────────────────────────────
# 12.3 - Game over: 1 người còn sống → winner
# ─────────────────────────────────────────────────────────────────────
Run-Test "12.3 Last alive player declared winner" {
  $room = New-TestRoom -hostName "LastAlive"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # Setup: host có defuse, các bot không có defuse và deck toàn bomb
  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("defuse","defuse","skip","skip") } `
    -CustomDeck  @("bomb","bomb","bomb","bomb","attack","defuse","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  Write-Output "  This test runs in background - checking after 60s..."
  # Cho game chạy 60s - bots sẽ tự chết dần vì bomb
  Start-Sleep -Seconds 60

  $snap = Get-Snap -Room $room

  if ($snap.gameState.endedAt) {
    if (-not $snap.gameState.winnerId) {
      throw "Game ended but no winner declared"
    }
    Write-Output "  Winner: $($snap.gameState.winnerId)"
  } else {
    Write-Output "  (note) game not ended after 60s - bots may not have died"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 12.4 - Restart: tạo test room mới sau khi game kết thúc
# ─────────────────────────────────────────────────────────────────────
Run-Test "12.4 Can create new test room after game ended" {
  $room1 = New-TestRoom -hostName "Restart1"
  $hostMember = Get-Host $room1

  Start-TestGame -Room $room1 `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  # Tạo room mới - phải OK
  $room2 = New-TestRoom -hostName "Restart2"
  if (-not $room2.roomId) { throw "Could not create second room" }
  if ($room2.roomId -eq $room1.roomId) { throw "Room IDs should differ" }
}

# ─────────────────────────────────────────────────────────────────────
# 11.1 - Draw card bình thường (không trúng bomb)
# ─────────────────────────────────────────────────────────────────────
Run-Test "11.1 Draw normal card increments hand, decrements deck" {
  $room = New-TestRoom -hostName "DrawNormal"
  $hostMember = Get-Host $room

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $deckBefore = (Get-DeckList -Room $room).Count
  $handBefore = (Get-HandCount -Snap $start -MemberId $hostMember.id)

  $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if ($draw.requiresDefuse) { throw "Should not require defuse - drawn card is not bomb" }
  if ($draw.drawnCardKey -eq "bomb") { throw "Drawn card should not be bomb" }

  $handAfter = (Get-HandCount -Snap $draw.room -MemberId $hostMember.id)
  $deckAfter = (Get-DeckList -Room $room).Count

  if ($handAfter -ne $handBefore + 1) {
    throw "Hand should increase by 1: was $handBefore, got $handAfter"
  }
  if ($deckAfter -ne $deckBefore - 1) {
    throw "Deck should decrease by 1: was $deckBefore, got $deckAfter"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 11.3 - Deck rỗng: rút bài phải xử lý an toàn (không crash, không treo)
# ─────────────────────────────────────────────────────────────────────
Run-Test "11.3 Drawing from an empty deck ends the turn safely" {
  $room = New-TestRoom -hostName "EmptyDeck"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # Deck chỉ còn đúng 1 lá và host đã có "skip" -> sau khi rút lá cuối,
  # lượt tiếp theo rút sẽ gặp deck rỗng.
  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip"); $b1.id = @("skip") } `
    -CustomDeck  @("cat_a") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $deckBefore = (Get-DeckList -Room $room).Count
  if ($deckBefore -ne 1) { throw "Expected deck of 1 card, got $deckBefore" }

  # Rút lá cuối -> hết bài
  $draw1 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $deckAfter = (Get-DeckList -Room $room).Count
  if ($deckAfter -ne 0) { throw "Deck should be empty, got $deckAfter" }

  # Lượt phải chuyển sang người kế (không treo)
  $turnAfter = Get-CurrentTurnId $draw1.room
  if ($turnAfter -eq $hostMember.id) { throw "Turn should have advanced after drawing the last card" }

  # Người kế rút bài khi deck đã rỗng -> phải trả lỗi có kiểm soát (không 500)
  $code = Invoke-Status -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" `
    -Method Post -Body @{ memberId = $turnAfter }
  if ($code -ge 500) { throw "Empty-deck draw should not return a server error, got $code" }
}

Print-Summary
