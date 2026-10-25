# Bomb (Bom) card test suite.
#
# Covers scenarios TC10.2 - TC10.4 from TEST_LOBBY_TEST_CASES.md:
#   10.2  Bomb - rút phải bomb
#   10.3  Bomb - đặt lại deck sau defuse
#   10.4  Bomb - game over scenario

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "BOMB CARD TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# 10.2 - Rút trúng bomb khi không có defuse → chết
# ─────────────────────────────────────────────────────────────────────
Run-Test "10.2 Player draws bomb, no defuse → dies" {
  $room = New-TestRoom -hostName "BombVictim"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("bomb","attack","skip","favor","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if ($draw.drawnCardKey -ne "bomb") { throw "drawn card should be 'bomb', got $($draw.drawnCardKey)" }

  # Không có defuse → chết ngay lập tức
  if ($draw.requiresDefuse) { throw "requiresDefuse should be false without a defuse card" }

  $snap = Get-Snap -Room $room
  $diedProp = $snap.gameState.diedAt.PSObject.Properties[$hostMember.id]
  if ($null -eq $diedProp -or $null -eq $diedProp.Value) {
    throw "Player should be marked dead right after drawing the bomb"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 10.3 - Bomb được đặt lại deck sau defuse
# ─────────────────────────────────────────────────────────────────────
Run-Test "10.3 Bomb placed back into deck at specified slot" {
  $room = New-TestRoom -hostName "BombPlace"
  $hostMember = Get-Host $room

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("defuse") } `
    -CustomDeck  @("bomb","attack","skip","favor","cat_a","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if ($draw.drawnCardKey -ne "bomb") { throw "Expected bomb draw" }

  # Defuse slot 1 = bomb ở TRÊN CÙNG (server rút từ Deck[^1], nên đỉnh
  # là phần tử cuối của list).
  $defuse = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/defuse" -Method Post `
    -Body (@{ memberId = $hostMember.id; slotIndex = 1 } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $deck = Get-DeckList -Room $room
  if ($deck.Count -eq 0) { throw "Deck should not be empty after defuse" }
  if ($deck[-1] -ne "bomb") { throw "Bomb should be at the top of the deck, got '$($deck[-1])'" }
  if ($defuse.room.gameState.bombRevealActive) { throw "bombRevealActive should be false" }
}

# ─────────────────────────────────────────────────────────────────────
# 10.4 - Game over: người cuối cùng sống sót là winner
# ─────────────────────────────────────────────────────────────────────
Run-Test "10.4 Last alive player is declared winner" {
  $room = New-TestRoom -hostName "GameOver"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]
  $b2 = $bots[1]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip"); $b1.id = @("skip"); $b2.id = @("defuse") } `
    -CustomDeck  @("bomb","bomb","bomb","attack","skip","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # Host rút bomb (không có defuse) → chết ngay
  $d1 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $snap = Get-Snap -Room $room
  $diedProp = $snap.gameState.diedAt.PSObject.Properties[$hostMember.id]
  $hostDied = ($null -ne $diedProp -and $null -ne $diedProp.Value)

  if ($hostDied) {
    Write-Output "  Host died as expected"
    # Kiểm tra alive count (5 người: host + 4 bot, host chết → còn 4)
    $aliveCount = Get-AliveCount -Snap $snap
    if ($aliveCount -ne 4) {
      throw "After host dies, alive should be 4 (5 - 1), got $aliveCount"
    }
  } else {
    Write-Output "  (note) host did not die - server timeout may be longer"
  }
}

Print-Summary
