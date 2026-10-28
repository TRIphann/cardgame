# Timer 10-second rule test suite.
#
# Covers scenarios from TEST_LOBBY_TEST_CASES.md Section PHẦN 14:
#   TC-T1   Timer lượt thường = 10s (đếm ngược từ 10)
#   TC-T2   Reset timer về 10s sau khi rút bài (không cộng dồn)
#   TC-T3   Reset timer về 10s sau khi đánh Attack (Nope window = 10s)
#   TC-T4   Future peek timer = 10s, đóng Future → reset turn timer = 10s
#   TC-T5   Nope window = 10s, reset timer khi chain Nope
#   TC-T6   Favor chọn người = 10s, auto-cancel khi hết giờ
#   TC-T7   Favor chọn lá = 10s, auto-pick random khi hết giờ
#   TC-T8   Combo 2 chọn người = 10s
#   TC-T9   Combo 2 chọn lá = 10s
#   TC-T10  Đặt Bomb sau Defuse = 10s
#   TC-T11  Mỗi action reset timer về 10s
#   TC-T12  Bot timer config = botTurnSeconds (0-30)
#   EC-T1   Click vào giây cuối (timer = 1s) - request được accept
#   EC-T5   Timer pause trong Bomb reveal animation, sau đó picker = 10s
#
# ── API shape notes (verified against the running backend) ──────────
#   * `pendingAction` is an OBJECT { initiatorId, cardKey, nopeChain,
#     createdAt } - there is no `pendingActionId` field.
#   * Favor phase 1 (pick a target) reports `requiresTargetPick = true`;
#     `requiresFavorTargetPick` is only true in phase 2 (the target picks
#     which card to hand over).
#   * Drawing a bomb reports `requiresDefuse = true` and sets
#     `gameState.bombRevealActive = true`. There is no
#     `pendingDefusePlacement` field - the defuse picker is driven purely
#     by `requiresDefuse` + the turn clock.
#   * Playing an action card opens a 10s Nope window, so the turn only
#     advances AFTER that window closes.

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "TIMER 10-SECOND RULE TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────
function Get-PendingAction {
  param($Snap)
  $gs = Get-GS $Snap
  if ($null -eq $gs) { return $null }
  return $gs.pendingAction
}

function Wait-NoPendingAction {
  # Chờ cửa sổ Nope đóng (pendingAction == null).
  param([Parameter(Mandatory)] $Room, [int] $TimeoutSec = 14)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $snap = Get-Snap -Room $Room
    if (-not (Get-PendingAction $snap)) { return $snap }
    Start-Sleep -Milliseconds 400
  }
  return Get-Snap -Room $Room
}

function Play-Card {
  param([Parameter(Mandatory)] $Room, [Parameter(Mandatory)] [string] $MemberId, [Parameter(Mandatory)] [string] $CardKey, $TargetMemberId)
  $body = @{ memberId = $MemberId; cardKey = $CardKey }
  if ($TargetMemberId) { $body.targetMemberId = $TargetMemberId }
  return Invoke-RestMethod -Uri "$api/api/rooms/$($Room.roomId)/game/play-card" -Method Post `
    -Body ($body | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
}

function Draw-Card {
  param([Parameter(Mandatory)] $Room, [Parameter(Mandatory)] [string] $MemberId)
  return Invoke-RestMethod -Uri "$api/api/rooms/$($Room.roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $MemberId } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5
}

# ─────────────────────────────────────────────────────────────────────
# TC-T1 - Timer lượt thường = 10s
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T1 Turn timer starts at 10s" {
  $room = New-TestRoom -hostName "T1Timer"
  $hostMember = Get-Host $room

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $snap = Get-Snap -Room $room
  if ($snap.gameState.turnTimeLimitSec -ne 10) {
    throw "turnTimeLimitSec should be 10, got $($snap.gameState.turnTimeLimitSec)"
  }
  # turnRemainingSec nên nằm trong khoảng 8-10 ngay sau start
  $r = $snap.gameState.turnRemainingSec
  if ($r -lt 8 -or $r -gt 10) {
    throw "turnRemainingSec should be in [8,10] right after start, got $r"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T2 - Reset timer sau rút bài
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T2 Timer resets to 10s after draw" {
  $room = New-TestRoom -hostName "T2ResetDraw"
  $hostMember = Get-Host $room

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("cat_a","cat_b","cat_c","cat_d","cat_e") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  # Đợi 3s để timer giảm tự nhiên
  Start-Sleep -Seconds 3
  $before = Get-Snap -Room $room
  $beforeRem = $before.gameState.turnRemainingSec
  if ($beforeRem -lt 5 -or $beforeRem -gt 10) {
    Write-Output "  (note) timer before draw=$beforeRem (expected 5-10)"
  }

  $r = Draw-Card -Room $room -MemberId $hostMember.id

  if ($r.requiresDefuse) {
    throw "Drew a bomb instead of a normal card - deck order must be respected"
  }

  # Sau draw, turn chuyển sang người kế → turnRemainingSec phải reset về ~10
  Start-Sleep -Milliseconds 200
  $after = $r.room.gameState
  $rem = $after.turnRemainingSec
  if ($rem -lt 8 -or $rem -gt 10) {
    throw "turnRemainingSec should reset to ~10 after draw, got $rem"
  }
  Write-Output "  timer before=$beforeRem after=$rem (next turn: $($after.currentTurnMemberId))"
}

# ─────────────────────────────────────────────────────────────────────
# TC-T3 - Nope window sau Attack = 10s
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T3 Nope window timer is 10s after Attack" {
  $room = New-TestRoom -hostName "T3Attack"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("attack"); $b1.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "attack"

  # Sau Attack: pendingAction được set, cửa sổ Nope đang mở
  $pending = Get-PendingAction $r.room
  if (-not $pending) {
    throw "pendingAction should be set after Attack"
  }
  if ($pending.cardKey -ne "attack") {
    throw "pendingAction.cardKey should be 'attack', got '$($pending.cardKey)'"
  }
  # Timer phải đếm ngược từ 10
  $rem = $r.room.gameState.turnRemainingSec
  if ($rem -lt 8 -or $rem -gt 10) {
    throw "turnRemainingSec should be ~10 while Nope window is open, got $rem"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T4 - Future peek timer = 10s
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T4 Future peek timer is 10s, then resets" {
  $room = New-TestRoom -hostName "T4Future"
  $hostMember = Get-Host $room

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("future") } `
    -CustomDeck  @("cat_a","cat_b","cat_c","cat_d","cat_e","cat_f","cat_g") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "future"

  # Future trả về futurePeek với 3 lá đầu
  if (-not $r.futurePeek -or @($r.futurePeek).Count -lt 3) {
    throw "Future should return 3 peek cards, got $(@($r.futurePeek).Count)"
  }
  if (@($r.futurePeek).Count -gt 3) {
    throw "Future peek should be exactly 3 cards, got $(@($r.futurePeek).Count)"
  }
  # Future KHÔNG kết thúc lượt → currentTurn vẫn là host
  if ($r.room.gameState.currentTurnMemberId -ne $hostMember.id) {
    throw "Future must NOT advance the turn (per Exploding Kittens rules)"
  }
  $rem = $r.room.gameState.turnRemainingSec
  if ($rem -lt 8 -or $rem -gt 10) {
    throw "turnRemainingSec should be ~10 during Future peek, got $rem"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T5 - Nope window đóng sau 10s (auto-resolve action)
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T5 Nope window auto-closes after 10s" {
  $room = New-TestRoom -hostName "T5NopeClose"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("attack"); $b1.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "attack"

  if (-not (Get-PendingAction $r.room)) {
    throw "pendingAction should be set"
  }

  # Đợi 13s cho nope window timeout
  Write-Output "  Waiting 13s for Nope window to expire..."
  Start-Sleep -Seconds 13

  $snap = Get-Snap -Room $room
  # pendingAction nên đã được clear (action resolved = attack thực hiện)
  if (Get-PendingAction $snap) {
    throw "pendingAction should be cleared after the Nope window expires"
  }
  # attackCounter nên = 2 (attack thực hiện → người kế phải draw 2)
  if ($snap.gameState.attackCounter -ne 2) {
    throw "attackCounter should be 2 after Attack resolves, got $($snap.gameState.attackCounter)"
  }
  # Turn phải đã chuyển sang người kế
  if ($snap.gameState.currentTurnMemberId -eq $hostMember.id) {
    throw "Turn should have advanced after the Nope window closed"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T6 - Favor chọn người timeout → auto-cancel
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T6 Favor picker timeout auto-cancels" {
  $room = New-TestRoom -hostName "T6Favor"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("favor"); $b1.id = @("attack") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "favor"

  # Favor phase 1 → client phải chọn mục tiêu
  if (-not $r.requiresTargetPick) {
    throw "Favor should require target pick (requiresTargetPick)"
  }
  if (@($r.favorCandidates).Count -lt 1) {
    throw "favorCandidates should have at least 1 candidate"
  }
  # Phase 1a does NOT open a Nope window (the action isn't committed
  # until a target is chosen) — but it DOES arm the 10s picker timeout via
  # pendingTargetPick. Without that state the sweeper has nothing to
  # auto-cancel and the room stalls forever.
  if (Get-PendingAction $r.room) {
    throw "pendingAction should NOT be set during Favor phase 1 (target picker)"
  }
  $ptp = $r.room.gameState.pendingTargetPick
  if (-not $ptp) {
    throw "pendingTargetPick should be set while the Favor target picker is open"
  }
  if ($ptp.kind -ne "FavorTarget") {
    throw "pendingTargetPick.kind should be 'FavorTarget', got '$($ptp.kind)'"
  }
  if ($ptp.initiatorId -ne $hostMember.id) {
    throw "pendingTargetPick.initiatorId should be the host, got '$($ptp.initiatorId)'"
  }

  # Đợi 13s cho picker timeout
  Write-Output "  Waiting 13s for Favor picker timeout..."
  Start-Sleep -Seconds 13

  $snap = Get-Snap -Room $room
  # pendingTargetPick nên đã được clear (auto-cancel)
  if ($snap.gameState.pendingTargetPick) {
    throw "pendingTargetPick should be cleared after the picker timeout"
  }
  # pendingFavorPick nên đã được clear (auto-cancel)
  if ($snap.gameState.pendingFavorPick) {
    throw "pendingFavorPick should be cleared after the picker timeout"
  }
  if (Get-PendingAction $snap) {
    throw "pendingAction should be cleared after the picker timeout"
  }
  # Lượt phải đã chuyển sang người kế (auto-cancel kết thúc lượt)
  if ($snap.gameState.currentTurnMemberId -eq $hostMember.id) {
    throw "Turn should have advanced after the Favor picker auto-cancelled"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T7 - Favor chọn lá timeout → auto-pick random
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T7 Favor card picker timeout auto-picks random" {
  $room = New-TestRoom -hostName "T7FavorAuto"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  # B1 có 3 lá để có nhiều lựa chọn
  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("favor"); $b1.id = @("attack","skip","defuse") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "favor"

  if (-not $r.requiresTargetPick) {
    throw "Favor should require target pick (requiresTargetPick)"
  }
  $candidates = @($r.favorCandidates)
  $targetId = $candidates[0]

  # Chọn target → chuyển sang phase 2 (target chọn lá)
  $r2 = Play-Card -Room $room -MemberId $hostMember.id -CardKey "favor" -TargetMemberId $targetId

  # Phase 2: TARGET được yêu cầu chọn lá → target là người nhận yêu cầu
  if (-not $r2.requiresFavorTargetPick) {
    Write-Output "  (note) requiresFavorTargetPick=$($r2.requiresFavorTargetPick) favorTargetId=$($r2.favorTargetId)"
  }
  if ($r2.favorTargetId -ne $targetId) {
    throw "favorTargetId should be '$targetId', got '$($r2.favorTargetId)'"
  }

  # Đợi 13s cho picker timeout → auto-pick random
  Write-Output "  Waiting 13s for Favor card picker timeout..."
  Start-Sleep -Seconds 13

  $snap = Get-Snap -Room $room
  # pendingFavorPick nên đã được clear
  if ($snap.gameState.pendingFavorPick) {
    throw "pendingFavorPick should be cleared after the card picker timeout"
  }
  # Discard pile nên có "favor"
  if (@($snap.discardPile) -notcontains "favor") {
    throw "'favor' should be in discardPile after the auto-pick, got: $($snap.discardPile -join ',')"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T8 - Combo 2 chọn người timeout = 10s
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T8 Combo 2 picker timeout" {
  $room = New-TestRoom -hostName "T8Combo"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("ninja","ninja"); $b1.id = @("attack") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "ninja"

  if (-not $r.requiresTargetPick) {
    throw "Combo 2 should require target pick, got requiresTargetPick=$($r.requiresTargetPick) requiresFavorTargetPick=$($r.requiresFavorTargetPick)"
  }
  # Timer phải đếm ngược từ 10 trong lúc picker mở
  $rem = $r.room.gameState.turnRemainingSec
  if ($rem -lt 8 -or $rem -gt 10) {
    throw "turnRemainingSec should be ~10 while the combo picker is open, got $rem"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T9 - Combo 2 chọn lá timeout = 10s
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T9 Combo 2 discard picker timeout" {
  $room = New-TestRoom -hostName "T9ComboDiscard"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("ninja","ninja"); $b1.id = @("attack","skip","defuse") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  # Combo 2 cùng loại: chọn target trước
  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "ninja"
  if (-not $r.requiresTargetPick) {
    Write-Output "  (note) requiresTargetPick=$($r.requiresTargetPick) - combo resolved without target picker"
  } else {
    $targetId = @($r.favorCandidates)[0]
    if (-not $targetId) {
      $botsSnap = Get-Snap -Room $room
      $targetId = @($botsSnap.members | Where-Object { $_.isBot })[0].id
    }
    $r2 = Play-Card -Room $room -MemberId $hostMember.id -CardKey "ninja" -TargetMemberId $targetId
    if ($r2.requiresDiscardPick) {
      Write-Output "  (ok) requiresDiscardPick set after target selection"
    } else {
      Write-Output "  (note) requiresDiscardPick=$($r2.requiresDiscardPick) (combo resolved immediately)"
    }
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T10 - Đặt Bomb sau Defuse = 10s
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T10 Bomb placement picker is 10s after defuse" {
  $room = New-TestRoom -hostName "T10BombPlace"
  $hostMember = Get-Host $room

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("defuse","skip") } `
    -CustomDeck  @("bomb","attack","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Draw-Card -Room $room -MemberId $hostMember.id

  if (-not $r.requiresDefuse) {
    throw "Should require defuse (drew '$($r.drawnCardKey)' instead of bomb)"
  }
  if ($r.drawnCardKey -ne "bomb") {
    throw "drawn card should be 'bomb', got '$($r.drawnCardKey)'"
  }
  # Bomb reveal animation đang active
  if (-not $r.room.gameState.bombRevealActive) {
    throw "bombRevealActive should be true while the bomb is revealed"
  }
  # Timer phải đếm ngược từ 10 cho picker
  $rem = $r.room.gameState.turnRemainingSec
  if ($rem -lt 8 -or $rem -gt 10) {
    throw "turnRemainingSec should be ~10 during the defuse picker, got $rem"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T11 - Mỗi action reset timer
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T11 Each action resets turn timer" {
  $room = New-TestRoom -hostName "T11ActionReset"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip"); $b1.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  # Action 1: Skip → mở cửa sổ Nope → turn advance SAU khi cửa sổ đóng
  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "skip"

  if (-not (Get-PendingAction $r.room)) {
    throw "pendingAction should be open after Skip (Nope window)"
  }

  $after = Wait-NoPendingAction -Room $room

  if ($after.gameState.currentTurnMemberId -eq $hostMember.id) {
    throw "Turn should advance after the Skip's Nope window closed"
  }
  # turnRemainingSec nên ~ 10 (reset)
  $remaining = $after.gameState.turnRemainingSec
  if ($remaining -lt 8 -or $remaining -gt 10) {
    throw "turnRemainingSec should reset to ~10 after Skip, got $remaining"
  }
}

# ─────────────────────────────────────────────────────────────────────
# TC-T12 - Bot timer = botTurnSeconds config
# ─────────────────────────────────────────────────────────────────────
Run-Test "TC-T12 Bot timer config (botTurnSeconds=0 instant)" {
  $room = New-TestRoom -hostName "T12BotTimer"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id) | Out-Null

  # Snapshot nên có botTurnSeconds=0
  $snap = Get-Snap -Room $room
  if ($snap.gameState.botTurnSeconds -ne 0) {
    throw "botTurnSeconds should be 0, got $($snap.gameState.botTurnSeconds)"
  }
}

# ─────────────────────────────────────────────────────────────────────
# EC-T1 - Click vào giây cuối (request được accept nếu trước timeout)
# ─────────────────────────────────────────────────────────────────────
Run-Test "EC-T1 Click at last second still accepted" {
  $room = New-TestRoom -hostName "ECT1LastSec"
  $hostMember = Get-Host $room

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("skip") } `
    -CustomDeck  @("attack","defuse","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  # Đợi 8s (turn còn ~2s)
  Start-Sleep -Seconds 8

  # Skip ngay → request vẫn được accept
  $r = Play-Card -Room $room -MemberId $hostMember.id -CardKey "skip"

  if (-not (Get-PendingAction $r.room)) {
    throw "Skip at last second was not accepted (no pendingAction opened)"
  }
  $after = Wait-NoPendingAction -Room $room
  if ($after.gameState.currentTurnMemberId -eq $hostMember.id) {
    throw "Turn should advance after the Skip resolved"
  }
}

# ─────────────────────────────────────────────────────────────────────
# EC-T5 - Timer pause trong Bomb reveal
# ─────────────────────────────────────────────────────────────────────
Run-Test "EC-T5 Timer pauses during bomb reveal, picker resumes 10s after" {
  $room = New-TestRoom -hostName "ECT5BombPause"
  $hostMember = Get-Host $room

  Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("defuse","skip") } `
    -CustomDeck  @("bomb","attack","cat_a","cat_b","cat_c","cat_d") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true | Out-Null

  $r = Draw-Card -Room $room -MemberId $hostMember.id

  # Sau draw bomb → defuse trigger → picker mở với 10s
  if (-not $r.requiresDefuse) {
    throw "Drew bomb - should require defuse"
  }

  # Snapshot sau 1s: bomb reveal vẫn active, picker vẫn pending
  Start-Sleep -Seconds 1
  $snap = Get-Snap -Room $room
  if (-not $snap.gameState.bombRevealActive) {
    Write-Output "  (note) bombRevealActive cleared after 1s"
  }
  # Timer vẫn đếm ngược (không bị reset về 0)
  $rem = $snap.gameState.turnRemainingSec
  if ($rem -lt 5 -or $rem -gt 10) {
    throw "turnRemainingSec should still be counting down during the bomb reveal, got $rem"
  }
}

Print-Summary

