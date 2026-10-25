# Defuse (Cứu) card test suite.
#
# Covers scenarios TC8.2 - TC8.6 from TEST_LOBBY_TEST_CASES.md:
#   8.2  Defuse - cứu bomb thường
#   8.3  Defuse - đặt bomb lại deck
#   8.4  Defuse - variant cards (ninja, superman, zombie, robot, hải-tặc)
#   8.5  Defuse - không có defuse = chết
#   8.6  Defuse - bot sử dụng

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "DEFUSE CARD TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# 8.2 - User rút bomb, dùng defuse để cứu
# ─────────────────────────────────────────────────────────────────────
Run-Test "8.2 User draws bomb, defuses, places bomb back into deck" {
  $room = New-TestRoom -hostName "Defuser"
  $hostMember = Get-Host $room

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("defuse","defuse") } `
    -CustomDeck  @("bomb","defuse","attack","skip","favor","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # User rút bài - sẽ rút bomb (lá đầu tiên của deck)
  $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Server set requiresDefuse = true
  if (-not $draw.requiresDefuse) {
    $drawJson = $draw | ConvertTo-Json
    throw "requiresDefuse should be true after drawing bomb, got: $drawJson"
  }

  $bombRevealActive = $draw.room.gameState.bombRevealActive
  if (-not $bombRevealActive) {
    throw "bombRevealActive should be true"
  }

  # User defuse - đặt bomb ở slot index 3
  $defuse = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/defuse" -Method Post `
    -Body (@{ memberId = $hostMember.id; slotIndex = 3 } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # bombRevealActive phải false
  if ($defuse.room.gameState.bombRevealActive) {
    throw "bombRevealActive should be false after defuse"
  }

  # Bomb phải được đặt lại deck ở vị trí "3" (2 lá free phía trên bomb).
  #
  # Server rút TỪ CUỐI list (gs.Deck[^1] = đỉnh deck) và chèn bomb bằng
  # `gs.Deck.Insert(deckCount - (slotIndex - 1), bomb)` — xem
  # GameService.UseDefuseAsync. Sau khi chèn, list dài hơn 1, nên index của
  # bomb trong list mới = (preInsertCount - (slotIndex - 1)) = postCount - slotIndex.
  #   slotIndex 1 → bomb ở đỉnh (postCount - 1)
  #   slotIndex 3 → bomb cách đỉnh 2 lá (postCount - 3)
  $deck = Get-DeckList -Room $room
  $bombIdx = $deck.Count - 3
  if ($deck[$bombIdx] -ne "bomb") {
    throw "Bomb should be 2 cards below the top of the deck (index $bombIdx), got '$($deck[$bombIdx])' (deck: $($deck -join ','))"
  }

  # Defuse phải ở discard
  if (-not (Test-DiscardHas -Room $room -CardKey "defuse")) {
    throw "Defuse not in discard pile"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 8.3 - Đặt bomb ở các vị trí khác nhau
# ─────────────────────────────────────────────────────────────────────
Run-Test "8.3 Defuse placement at different slot indices" {
  foreach ($slot in @(0, 1, 5, -1)) {  # -1 = random / last
    $room = New-TestRoom -hostName "DefuseSlot$slot"
    $hostMember = Get-Host $room

    $start = Start-TestGame -Room $room `
      -CustomHands @{ $hostMember.id = @("defuse","defuse") } `
      -CustomDeck  @("bomb","defuse","attack","skip","favor","cat_a","cat_b","cat_c","cat_d","cat_e") `
      -FirstPlayerId $hostMember.id `
      -BotTurnSeconds 0 `
      -DisableBotService $true

    $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
      -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
      -ContentType "application/json" -TimeoutSec 5

    if (-not $draw.requiresDefuse) { throw "Slot $slot - requiresDefuse should be true" }

    $body = @{ memberId = $hostMember.id; slotIndex = $slot } | ConvertTo-Json
    $defuse = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/defuse" -Method Post `
      -Body $body -ContentType "application/json" -TimeoutSec 5

    if ($defuse.room.gameState.bombRevealActive) {
      throw "Slot $slot - bombRevealActive should be false"
    }
    if (-not (Test-DiscardHas -Room $room -CardKey "defuse")) {
      throw "Slot $slot - defuse not in discard"
    }
  }
}

# ─────────────────────────────────────────────────────────────────────
# 8.4 - Defuse variant (ninja, superman, ...) - đều có tác dụng cứu
# ─────────────────────────────────────────────────────────────────────
Run-Test "8.4 Defuse variants (ninja, superman, zombie, robot, hai-tac) all defuse" {
  $variants = @("ninja","superman","zombie","robot","hải-tặc")
  foreach ($v in $variants) {
    $room = New-TestRoom -hostName "Defuse_$v"
    $hostMember = Get-Host $room

    $start = Start-TestGame -Room $room `
      -CustomHands @{ $hostMember.id = @($v) } `
      -CustomDeck  @("bomb","defuse","attack","skip","favor","cat_a","cat_b","cat_c") `
      -FirstPlayerId $hostMember.id `
      -BotTurnSeconds 0 `
      -DisableBotService $true

    $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
      -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
      -ContentType "application/json" -TimeoutSec 5

    if (-not $draw.requiresDefuse) { throw "Variant $v - requiresDefuse should be true" }

    $defuse = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/defuse" -Method Post `
      -Body (@{ memberId = $hostMember.id; slotIndex = 2 } | ConvertTo-Json) `
      -ContentType "application/json" -TimeoutSec 5

    if ($defuse.room.gameState.bombRevealActive) {
      throw "Variant $v - bombRevealActive should be false"
    }
    if (-not (Test-DiscardHas -Room $room -CardKey $v)) {
      throw "Variant $v should be in discard"
    }
  }
}

# ─────────────────────────────────────────────────────────────────────
# 8.5 - Không có defuse → chết (winner có thể được set)
# ─────────────────────────────────────────────────────────────────────
Run-Test "8.5 User has no defuse, draws bomb - dies" {
  $room = New-TestRoom -hostName "DoomedPlayer"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room

  # customDeck[0] là LÁ ĐỈNH của deck (server rút từ cuối list đã reverse).
  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("bomb","attack","skip","favor","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $hostMember.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if ($draw.drawnCardKey -ne "bomb") { throw "Expected bomb draw, got '$($draw.drawnCardKey)'" }

  # Không có defuse → player CHẾT ngay lập tức (không mở cửa sổ cứu).
  if ($draw.requiresDefuse) {
    throw "requiresDefuse should be false when the player has no defuse"
  }

  $snap = Get-Snap -Room $room
  $diedProp = $snap.gameState.diedAt.PSObject.Properties[$hostMember.id]
  if ($null -eq $diedProp -or $null -eq $diedProp.Value) {
    throw "Host should have died immediately after drawing the bomb"
  }
  if ($snap.gameState.alive.PSObject.Properties[$hostMember.id].Value -ne $false) {
    throw "Host should be marked as not alive"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 8.6 - Bot dùng defuse
# ─────────────────────────────────────────────────────────────────────
Run-Test "8.6 Bot defuses bomb automatically (draw-only + defuse)" {
  $room = New-TestRoom -hostName "BotDefuse"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("defuse","defuse") } `
    -CustomDeck  @("bomb","attack","skip","favor","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -DrawOnlyBotIds @($b1.id)

  # Bot sẽ tự rút bomb, tự defuse, đặt lại deck
  $snap = Wait-Snap -Room $room -Predicate {
    param($s) @($s.discardPile | Where-Object { $_ -eq "defuse" }).Count -gt 0 -and -not $s.gameState.bombRevealActive
  } -TimeoutSec 25

  if (-not @($snap.discardPile | Where-Object { $_ -eq "defuse" }).Count) {
    $discards = $snap.discardPile -join ','
    throw "Bot did not defuse - discard: $discards"
  }
  if ($snap.gameState.bombRevealActive) {
    throw "bombRevealActive should be false after defuse"
  }
  $diedProp = $snap.gameState.diedAt.PSObject.Properties[$b1.id]
  if ($null -ne $diedProp -and $null -ne $diedProp.Value) {
    throw "Bot died - should have survived with defuse"
  }
}

Print-Summary
