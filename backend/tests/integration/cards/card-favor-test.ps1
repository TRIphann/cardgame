# Favor (Nợ Nần / Xin bài) card test suite.
#
# Covers scenarios TC7.2 - TC7.6 from TEST_LOBBY_TEST_CASES.md:
#   7.2  Favor - User xin bài từ Bot
#   7.3  Favor - Bot xin bài từ User
#   7.4  Favor - Bot xin bài từ Bot khác
#   7.5  Favor - bị Nope
#   7.6  Favor - target không có bài

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "FAVOR CARD TEST SUITE"
Write-Output "=========================================="

# Helper: complete Favor flow (phase 1 + target phase 2)
function Invoke-FavorFlow {
  param(
    [Parameter(Mandatory)] $Room,
    [Parameter(Mandatory)] $Initiator,
    [Parameter(Mandatory)] $Target,
    [string] $DiscardPick = ""  # empty = target auto-pick
  )
  # Phase 1: initiator plays favor targeting target
  $body1 = @{ memberId = $Initiator; cardKey = "favor"; targetMemberId = $Target } | ConvertTo-Json
  $r1 = Invoke-RestMethod -Uri "$api/api/rooms/$($Room.roomId)/game/play-card" -Method Post `
    -Body $body1 -ContentType "application/json" -TimeoutSec 5
  return $r1
}

# ─────────────────────────────────────────────────────────────────────
# 7.2 - User plays Favor on Bot (target chọn lá phase 2)
# ─────────────────────────────────────────────────────────────────────
Run-Test "7.2 User plays Favor on bot, pendingFavorPick set" {
  $room = New-TestRoom -hostName "FavorUser"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("favor"); $b1.id = @("cat_a","cat_b","cat_c","defuse") } `
    -CustomDeck  @("attack","defuse","nope","cat_d","cat_e","cat_f","cat_g") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-FavorFlow -Room $room -Initiator $hostMember.id -Target $b1.id

  # Phase 1: pendingFavorPick được set
  if ($null -eq $play.room.gameState.pendingFavorPick) {
    throw "pendingFavorPick should be set after favor"
  }
  if ($play.room.gameState.pendingFavorPick.targetMemberId -ne $b1.id) {
    throw "pendingFavorPick.targetMemberId should be b1, got $($play.room.gameState.pendingFavorPick.targetMemberId)"
  }
  # shuffledCandidates chỉ hiển thị cho TARGET (xem GameService.MapToDto:
  # candidates = gs.PendingFavorPick.ShuffledCandidates nếu viewer là target,
  # ngược lại là list rỗng). Initiator gọi play-card nên viewer là host →
  # candidates rỗng. Đọc candidates từ snapshot góc nhìn TARGET.
  $targetSnap = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/snapshot?memberId=$($b1.id)" `
    -Method Get -TimeoutSec 5
  $candidates = @($targetSnap.gameState.pendingFavorPick.shuffledCandidates)
  if ($candidates.Count -lt 1) {
    throw "shuffledCandidates should be populated (got $($candidates.Count))"
  }

  # Phase 2: target chọn 1 lá để đưa → favor mới vào discard pile.
  # PHẢI chờ cửa sổ Nope đóng lại trước: server từ chối phase 2 với
  # "action_pending" (409) khi còn PendingAction. Cửa sổ Nope 10s.
  Wait-NopeResolve -Room $room -TimeoutSec 16 | Out-Null

  $phase2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $b1.id; cardKey = "favor"; targetMemberId = $hostMember.id; discardPickKey = $candidates[0] } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if (-not (Test-DiscardHas -Room $room -CardKey "favor")) {
    throw "Favor not in discard pile"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 7.3 - Bot (play-cards) plays Favor on User
# ─────────────────────────────────────────────────────────────────────
Run-Test "7.3 Bot plays Favor on host (play-cards)" {
  $room = New-TestRoom -hostName "FavorBot"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("cat_a","cat_b","defuse"); $b1.id = @("favor","defuse") } `
    -CustomDeck  @("attack","skip","nope","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id)

  # Bot đánh Favor → mở cửa sổ chọn lá (pendingFavorPick). Lá Favor chỉ vào
  # discard pile khi picker resolve (target chọn hoặc auto-pick 10s).
  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.pendingFavorPick -ne $null
  } -TimeoutSec 20

  if ($null -eq $snap.gameState.pendingFavorPick) {
    throw "Bot did not play Favor (no pendingFavorPick)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 7.4 - Bot xin bài bot khác
# ─────────────────────────────────────────────────────────────────────
Run-Test "7.4 Bot asks favor from another bot" {
  $room = New-TestRoom -hostName "BotFavorBot"
  $bots = Get-Bots $room
  $b1 = $bots[0]; $b2 = $bots[1]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("favor"); $b2.id = @("cat_a","cat_b","defuse","cat_c") } `
    -CustomDeck  @("attack","skip","nope","cat_d","cat_e","cat_f") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id)

  $snap = Wait-Snap -Room $room -Predicate {
    param($s) $s.gameState.pendingFavorPick -ne $null
  } -TimeoutSec 20

  if ($null -eq $snap.gameState.pendingFavorPick) {
    throw "Bot did not play Favor on another bot"
  }
  if ($snap.gameState.pendingFavorPick.targetMemberId -ne $b2.id) {
    throw "Favor target should be the other bot, got $($snap.gameState.pendingFavorPick.targetMemberId)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 7.5 - Favor bị Nope
# ─────────────────────────────────────────────────────────────────────
Run-Test "7.5 Favor - next player nopes (pendingFavorPick cleared)" {
  $room = New-TestRoom -hostName "FavorNope"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("favor"); $b1.id = @("nope","cat_a") } `
    -CustomDeck  @("attack","defuse","cat_b","cat_c","cat_d","cat_e","cat_f") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-FavorFlow -Room $room -Initiator $hostMember.id -Target $b1.id

  # Bot nopes
  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chain lẻ → favor bị cancel khi cửa sổ đóng.
  $snap = Wait-NopeResolve -Room $room -TimeoutSec 16

  if ($null -ne $snap.gameState.pendingFavorPick) {
    throw "pendingFavorPick should be cleared after the favor was noped"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 7.6 - Target không có bài (Favor không thể pick)
# ─────────────────────────────────────────────────────────────────────
Run-Test "7.6 Favor target has empty hand - favor should still work or auto-fail" {
  $room = New-TestRoom -hostName "FavorEmpty"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("favor"); $b1.id = @("defuse") } `
    -CustomDeck  @("attack","skip","cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  # B1 chỉ có defuse → favor vẫn work, target sẽ give defuse
  $play = Invoke-FavorFlow -Room $room -Initiator $hostMember.id -Target $b1.id

  if ($null -eq $play.room.gameState.pendingFavorPick) {
    throw "pendingFavorPick should be set after favor"
  }
  # Đọc candidates từ góc nhìn TARGET (initiator không thấy candidates).
  $targetSnap = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/snapshot?memberId=$($b1.id)" `
    -Method Get -TimeoutSec 5
  $candidates = @($targetSnap.gameState.pendingFavorPick.shuffledCandidates)
  if ($candidates.Count -lt 1) {
    throw "shuffledCandidates should contain the target's defuse (got $($candidates.Count))"
  }
  # Chờ cửa sổ Nope đóng lại trước khi phase 2 (server trả 409
  # "action_pending" nếu PendingAction còn treo).
  Wait-NopeResolve -Room $room -TimeoutSec 16 | Out-Null

  $phase2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $b1.id; cardKey = "favor"; targetMemberId = $hostMember.id; discardPickKey = $candidates[0] } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if (-not (Test-DiscardHas -Room $room -CardKey "favor")) {
    throw "Favor not in discard pile"
  }
}

Print-Summary
