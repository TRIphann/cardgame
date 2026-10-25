# Combo Cards test suite.
#
# Covers scenarios TC9.2 - TC9.7 from TEST_LOBBY_TEST_CASES.md:
#   9.2  Combo Ninja Card
#   9.3  Combo Superman Card
#   9.4  Combo Zombie Card
#   9.5  Combo Robot Card
#   9.6  Combo Hải Tặc (Pirate) Card
#   9.7  Combo 5-any (5 cards bất kỳ)
#
# Mechanics:
#   - 2 same defuse (2 ninja, 2 superman, etc.) → steal 1 random card from target
#   - 3 same defuse → steal specific card from target
#   - 5 any defuse → take any card from discard pile

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "COMBO CARD TEST SUITE"
Write-Output "=========================================="

# Combo defuse cards (per CardCatalog.ComboDefuses)
$comboCards = @("ninja","superman","zombie","robot","hải-tặc")

# ─────────────────────────────────────────────────────────────────────
# 9.2-9.6 - Combo 2 same: steal 1 random from target
# ─────────────────────────────────────────────────────────────────────
foreach ($card in $comboCards) {
  Run-Test "9.$card Combo 2-same $card - steal random card from target" {
    $room = New-TestRoom -hostName "Combo2_$card"
    $hostMember = Get-Host $room
    $bots = Get-Bots $room
    $b1 = $bots[0]

    $start = Start-TestGame -Room $room `
      -CustomHands @{ $hostMember.id = @($card,$card); $b1.id = @("cat_a","cat_b","cat_c","defuse") } `
      -CustomDeck  @("attack","skip","nope","cat_d","cat_e","cat_f","cat_g") `
      -FirstPlayerId $hostMember.id `
      -BotTurnSeconds 0 `
      -DisableBotService $true

    # Phase 1: combo 2 same, cần target pick
    $body = @{
      memberId = $hostMember.id
      cardKey  = $card
      comboKind = "TwoSame"
      targetMemberId = $b1.id
    } | ConvertTo-Json
    $r1 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
      -Body $body -ContentType "application/json" -TimeoutSec 5

    # Phase 1 trả về requiresFavorPick (target's shuffled hand) → phase 2
    # chọn 1 lá để lấy.
    if ($r1.requiresFavorPick) {
      $candidate = @($r1.favorCandidates)[0]
      $body2 = @{
        memberId = $hostMember.id
        cardKey  = $card
        comboKind = "TwoSame"
        targetMemberId = $b1.id
        discardPickKey = $candidate
      } | ConvertTo-Json
      $r2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
        -Body $body2 -ContentType "application/json" -TimeoutSec 5
    }

    # Combo card phải vào discard pile
    if (-not (Test-DiscardHas -Room $room -CardKey $card)) {
      throw "Combo 2-same $card - card not in discard after both phases"
    }

    # Host phải có thêm 1 lá (lá lấy được từ target)
    $hostHand = @(Get-HandOf -Room $room -MemberId $hostMember.id)
    if ($hostHand.Count -lt 1) {
      throw "Combo 2-same $card - initiator should hold the stolen card"
    }
  }
}

# ─────────────────────────────────────────────────────────────────────
# 9.7 - Combo 5 any: take from discard pile
# ─────────────────────────────────────────────────────────────────────
Run-Test "9.7 Combo 5-any - take a card from discard pile" {
  $room = New-TestRoom -hostName "Combo5"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # 5 combo cards khác nhau + 1 lá "future".
  # Dùng "future" (KHÔNG kết thúc lượt) để dựng discard pile trước —
  # nếu dùng "attack" thì turn sẽ chuyển sang người kế sau khi cửa sổ
  # Nope đóng, và host không còn quyền đánh combo (server trả not_your_turn).
  # (Host phải CẦM lá thì mới đánh được — không có trong tay thì server
  #  trả card_not_in_hand và test fail sai nguyên nhân.)
  $hand = @("ninja","superman","zombie","robot","hải-tặc","future")

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = $hand } `
    -CustomDeck  @("attack","skip","nope","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # Pre-populate discard pile: chơi 1 "future" trước (future vào discard
  # ngay khi đánh, và KHÔNG kết thúc lượt của người chơi).
  $playAttack = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "future" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5
  Wait-NopeResolve -Room $room -TimeoutSec 16 | Out-Null

  $discardBefore = Get-DiscardPile -Room $room
  if (-not @($discardBefore | Where-Object { $_ -eq "future" }).Count) {
    throw "Setup failed - discard pile should contain 'future', got: $($discardBefore -join ',')"
  }

  # Combo 5-any: phase 1 → chọn 1 lá trong chồng bỏ
  $body = @{
    memberId = $hostMember.id
    cardKey  = "ninja"
    comboKind = "FiveAny"
  } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  if (-not $r.requiresDiscardPick) {
    throw "Combo 5-any should ask the player to pick a card from the discard pile"
  }

  # Phase 2: chọn "future" từ chồng bỏ
  $body2 = @{
    memberId = $hostMember.id
    cardKey  = "ninja"
    comboKind = "FiveAny"
    discardPickKey = "future"
  } | ConvertTo-Json
  $r2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body $body2 -ContentType "application/json" -TimeoutSec 5

  # "future" phải được lấy lại (không còn trong chồng bỏ) và nằm trong tay host
  $discardAfter = Get-DiscardPile -Room $room
  if (@($discardAfter | Where-Object { $_ -eq "future" }).Count -ne 0) {
    throw "Combo 5-any should have taken 'future' out of the discard pile"
  }
  $hostHand = @(Get-HandOf -Room $room -MemberId $hostMember.id)
  if ($hostHand -notcontains "future") {
    throw "Combo 5-any should put 'future' back into the initiator's hand"
  }
}

# ─────────────────────────────────────────────────────────────────────
# Combo - cancel pending action
# ─────────────────────────────────────────────────────────────────────
Run-Test "Combo cancel-pending works" {
  $room = New-TestRoom -hostName "ComboCancel"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("ninja","ninja"); $b1.id = @("cat_a","cat_b","defuse") } `
    -CustomDeck  @("attack","skip","cat_c","cat_d","cat_e","cat_f","cat_g") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # Phase 1: combo 2 same, không target
  $body = @{ memberId = $hostMember.id; cardKey = "ninja"; comboKind = "TwoSame" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  # Cancel pending
  $cancel = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/cancel-pending" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "ninja"; comboKind = "TwoSame" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Sau cancel, lượt phải kết thúc (không kẹt ở host)
  $turnAfter = Get-CurrentTurnId $cancel.room
  if ($turnAfter -eq $hostMember.id) {
    throw "After cancel the turn should have advanced, but it is still on the host"
  }
}

Print-Summary
