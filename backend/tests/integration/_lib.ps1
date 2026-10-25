# Shared helper functions for the per-card PowerShell test suites.
#
# Source this file at the top of each suite with:
#   . "$PSScriptRoot\_lib.ps1"
#
# All suites target the local backend at http://localhost:5000 unless the
# caller overrides $api before sourcing.

$api = if ($api) { $api } else { "http://localhost:5000" }
$script:passed = 0
$script:failed = 0
$script:failures = @()

function Run-Test {
  param([string]$name, [scriptblock]$testScript)
  Write-Output ""
  Write-Output "== $name =="
  try {
    & $testScript
    $script:passed++
    Write-Output "  PASS"
  } catch {
    $script:failed++
    $msg = $_.Exception.Message
    $script:failures += "$name :: $msg"
    Write-Output "  FAIL: $_"
    if ($_.Exception) { Write-Output "    $msg" }
  }
}

function Reset-TestRoom {
  # Always clear any previous test room so we get a deterministic member set
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
}

function New-TestRoom {
  param([string]$hostName = "Tester")
  Reset-TestRoom
  $r = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post `
    -Body (@{ hostName = $hostName } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5
  return $r
}

function Start-TestGame {
  param(
    [Parameter(Mandatory)] $Room,
    [hashtable] $CustomHands = @{},
    [string[]] $CustomDeck = @(),
    [string] $FirstPlayerId = "",
    [int] $BotTurnSeconds = 0,
    [string[]] $DrawOnlyBotIds = @(),
    [string[]] $PlayCardsBotIds = @(),
    [hashtable] $OneCardBotCardMap = @{},
    [bool] $DealCards = $false,
    [bool] $DisableBotService = $false
  )
  $payload = @{
    roomId           = $Room.roomId
    dealCards        = $DealCards
    customHands      = $CustomHands
    customDeck       = $CustomDeck
    botTurnSeconds   = $BotTurnSeconds
    drawOnlyBotIds   = $DrawOnlyBotIds
    playCardsBotIds  = $PlayCardsBotIds
    oneCardBotCardMap = $OneCardBotCardMap
    disableBotService = $DisableBotService
  }
  if ($FirstPlayerId) { $payload.firstPlayerId = $FirstPlayerId }

  return Invoke-RestMethod -Uri "$api/api/test/start" -Method Post `
    -Body ($payload | ConvertTo-Json -Depth 8) `
    -ContentType "application/json" -TimeoutSec 10
}

function Get-Snap {
  param([Parameter(Mandatory)] $Room)
  return Invoke-RestMethod -Uri "$api/api/test/room/$($Room.roomId)/snapshot" -Method Get -TimeoutSec 5
}

function Get-GS {
  # Lấy gameState từ BẤT KỲ response nào (play-card / snapshot / start).
  #
  # Có 3 shape khác nhau trong API:
  #   1. /api/test/start              → { gameState: {...} }
  #   2. /api/test/room/{id}/snapshot → { gameState: {...} }  (có thêm deck/discardPile)
  #   3. /api/rooms/{id}/game/*       → { room: { gameState: {...} } }
  #   4. /api/rooms/{id}/snapshot     → { gameState: {...} }  (RoomDto, không có deck)
  param($Snap)
  if ($null -eq $Snap) { return $null }
  if ($null -ne $Snap.gameState) { return $Snap.gameState }
  if ($null -ne $Snap.room -and $null -ne $Snap.room.gameState) { return $Snap.room.gameState }
  return $null
}

function Wait-Snap {
  param(
    [Parameter(Mandatory)] $Room,
    [Parameter(Mandatory)] [scriptblock] $Predicate,
    [int] $TimeoutSec = 12,
    [int] $IntervalMs = 250
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $snap = $null
  while ((Get-Date) -lt $deadline) {
    $snap = Get-Snap -Room $Room
    if (& $Predicate $snap) { return $snap }
    Start-Sleep -Milliseconds $IntervalMs
  }
  return $snap
}

function Get-Bots {
  param($Room)
  return @($Room.members | Where-Object { $_.isBot })
}

function Get-Host {
  param($Room)
  return @($Room.members | Where-Object { $_.isHost })[0]
}

function Get-HandCount {
  # handCounts trả về từ API là JSON object -> PowerShell parse thành PSCustomObject,
  # không có .ContainsKey. Dùng .PSObject.Properties để tra cứu an toàn.
  param($Snap, [string] $MemberId)
  $gs = Get-GS $Snap
  if ($null -eq $gs) { return 0 }
  $hc = $gs.handCounts
  if ($null -eq $hc) { return 0 }
  $prop = $hc.PSObject.Properties[$MemberId]
  if ($null -eq $prop) { return 0 }
  return [int]$prop.Value
}

# ─────────────────────────────────────────────────────────────────────
# Test-snapshot helpers
#
# The production RoomDto (returned by /api/rooms/* endpoints) intentionally
# HIDES the deck contents and the discard pile — it only exposes
# `discardCount`. Only the test endpoint
#   GET /api/test/room/{roomId}/snapshot
# exposes `deck` + `discardPile`. Suites that need to assert on those must
# therefore re-read the TEST snapshot instead of looking at
# $response.room.deck / $response.room.discardPile.
# ─────────────────────────────────────────────────────────────────────

function Get-TestSnap {
  # Full test snapshot (includes deck, discardPile, every member's hand).
  param([Parameter(Mandatory)] $Room)
  return Invoke-RestMethod -Uri "$api/api/test/room/$($Room.roomId)/snapshot" `
    -Method Get -TimeoutSec 5
}

function Get-RoomSnap {
  # Snapshot for ANY room, whichever family it belongs to.
  #
  # Two room families coexist in this suite:
  #   * "test"   — created via POST /api/test/room, lives in the in-memory
  #                test repository. GET /api/test/room/{id}/snapshot exposes
  #                deck + discardPile + every member's hand.
  #   * "normal" — created via POST /api/rooms, lives in the production
  #                repository. GET /api/rooms/{id}/snapshot hides the deck
  #                and only exposes discardCount.
  #
  # The wait helpers (Wait-NopeResolve / Wait-Idle) previously hardcoded the
  # TEST endpoint, so every "normal"-family suite (lobby-normal,
  # normal-game-flow) got a 404 "Test room not found" the moment it waited
  # for a Nope window to close. This helper probes the test endpoint first
  # and falls back to the production endpoint, so both families work.
  param([Parameter(Mandatory)] $Room, [string] $MemberId = "")
  $suffix = if ($MemberId) { "?memberId=$MemberId" } else { "" }

  try {
    return Invoke-RestMethod -Uri "$api/api/test/room/$($Room.roomId)/snapshot$suffix" `
      -Method Get -TimeoutSec 5 -ErrorAction Stop
  } catch {
    # Not a test room (or it was evicted) — fall through to the production
    # endpoint. Any other error (network, 500) still surfaces below.
    try {
      return Invoke-RestMethod -Uri "$api/api/rooms/$($Room.roomId)/snapshot$suffix" `
        -Method Get -TimeoutSec 5 -ErrorAction Stop
    } catch {
      throw $_
    }
  }
}

function Get-DiscardPile {
  # List of card keys currently in the discard pile.
  param([Parameter(Mandatory)] $Room)
  return @(Get-TestSnap -Room $Room).discardPile
}

function Get-DeckList {
  # Full deck, top of the deck LAST (the server draws from gs.Deck[^1]).
  param([Parameter(Mandatory)] $Room)
  return @(Get-TestSnap -Room $Room).deck
}

function Get-DeckTop {
  # The 3 cards a Future card would reveal, in reveal order.
  #
  # The server draws from gs.Deck[^1] (the LAST element is the top of the
  # deck) and computes the peek as `gs.Deck.TakeLast(3).Reverse()`, i.e.
  # top-of-deck first. We mirror that here exactly.
  param([Parameter(Mandatory)] $Room, [int] $Count = 3)
  $deck = Get-DeckList -Room $Room
  if ($deck.Count -eq 0) { return @() }
  $take = [Math]::Min($Count, $deck.Count)
  $tail = @($deck[($deck.Count - $take)..($deck.Count - 1)])
  return @($tail[($tail.Count - 1)..0])
}

function Test-DiscardHas {
  # True when the discard pile contains the given card key.
  param([Parameter(Mandatory)] $Room, [Parameter(Mandatory)] [string] $CardKey)
  return @((Get-DiscardPile -Room $Room) | Where-Object { $_ -eq $CardKey }).Count -gt 0
}

function Get-HandCountMap {
  # Trả về hashtable { memberId -> count } cho snapshot bất kỳ.
  param($Snap)
  $map = @{}
  $gs = Get-GS $Snap
  if ($null -eq $gs) { return $map }
  $hc = $gs.handCounts
  if ($null -eq $hc) { return $map }
  foreach ($p in $hc.PSObject.Properties) {
    $map[$p.Name] = [int]$p.Value
  }
  return $map
}

function Get-DictValue {
  # Tra cứu an toàn trong 1 JSON object (PowerShell parse thành PSCustomObject).
  # JSON object KHÔNG có .ContainsKey / không index bằng [key] như hashtable.
  # Helper này dùng .PSObject.Properties nên hoạt động với mọi response.
  #
  #   Get-DictValue $snap.gameState.oneCardBotCardMap $b1.id
  #   Get-DictValue $snap.gameState.diedAt $b1.id
  param($Dict, [string] $Key, $Default = $null)
  if ($null -eq $Dict) { return $Default }
  $prop = $Dict.PSObject.Properties[$Key]
  if ($null -eq $prop) { return $Default }
  return $prop.Value
}

function Test-DictHasKey {
  # True nếu JSON object có key (tương đương ContainsKey nhưng an toàn).
  param($Dict, [string] $Key)
  if ($null -eq $Dict) { return $false }
  return ($null -ne $Dict.PSObject.Properties[$Key])
}

function Get-AliveMap {
  # Trả về hashtable { memberId -> alive(bool) } từ gameState.alive.
  # `alive` là JSON object → PowerShell parse thành PSCustomObject; phải duyệt
  # .PSObject.Properties chứ không pipe trực tiếp (pipe sẽ chỉ yield 1 object).
  param($Snap)
  $map = @{}
  $gs = Get-GS $Snap
  if ($null -eq $gs) { return $map }
  $alive = $gs.alive
  if ($null -eq $alive) { return $map }
  foreach ($p in $alive.PSObject.Properties) {
    $map[$p.Name] = [bool]$p.Value
  }
  return $map
}

function Get-AliveCount {
  # Số người còn sống trong game.
  param($Snap)
  $map = Get-AliveMap -Snap $Snap
  $n = 0
  foreach ($k in $map.Keys) { if ($map[$k]) { $n++ } }
  return $n
}

function Get-MyHand {
  # myHand chỉ có khi snapshot được gọi kèm ?memberId=
  param($Snap)
  $gs = Get-GS $Snap
  if ($null -ne $gs -and $gs.myHand) { return @($gs.myHand) }
  if ($Snap -and $Snap.myHand) { return @($Snap.myHand) }
  return @()
}

function Invoke-Status {
  # Gọi API và trả về status code (kể cả 204 No Content mà
  # Invoke-RestMethod sẽ trả $null).
  param(
    [Parameter(Mandatory)] [string] $Uri,
    [string] $Method = "Post",
    $Body = $null,
    [int] $TimeoutSec = 5
  )
  $params = @{ Uri = $Uri; Method = $Method; TimeoutSec = $TimeoutSec }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 8)
    $params.ContentType = "application/json"
  }
  $resp = Invoke-WebRequest @params -SkipHttpErrorCheck
  return [int]$resp.StatusCode
}

function Get-CurrentTurnId {
  # Trả về memberId đang đến lượt (đọc từ snapshot).
  param($Snap)
  $gs = Get-GS $Snap
  if ($null -eq $gs) { return $null }
  return $gs.currentTurnMemberId
}

function Get-CounterTotal {
  # Tổng giá trị của một dictionary-counter trong gameState
  # (turnsTaken / cardsPlayed). API trả JSON object -> PSCustomObject.
  param($Snap, [string] $Field = "cardsPlayed")
  $gs = Get-GS $Snap
  if ($null -eq $gs) { return 0 }
  $counter = $gs.$Field
  if ($null -eq $counter) { return 0 }
  $total = 0
  foreach ($p in $counter.PSObject.Properties) { $total += [int]$p.Value }
  return $total
}

function Get-HandOf {
  # Đọc myHand của 1 member (cần ?memberId= trong snapshot).
  param([Parameter(Mandatory)] $Room, [Parameter(Mandatory)] [string] $MemberId)
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($Room.roomId)/snapshot?memberId=$MemberId" `
    -Method Get -TimeoutSec 5
  return Get-MyHand $snap
}

function Wait-NopeResolve {
  # Chờ cửa sổ Nope đóng (pendingAction == null). Trả về snapshot mới nhất.
  #
  # Dùng Get-RoomSnap (tự dò test / production endpoint) vì suite thuộc
  # family "normal" tạo phòng qua /api/rooms — nếu hardcode endpoint test
  # thì mọi normal suite đều nhận 404 "Test room not found".
  param(
    [Parameter(Mandatory)] $Room,
    [int] $TimeoutSec = 14
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $s = Get-RoomSnap -Room $Room
    if (-not $s.gameState.pendingAction) { return $s }
    Start-Sleep -Milliseconds 400
  }
  return Get-RoomSnap -Room $Room
}

function Wait-Idle {
  # Chờ game về trạng thái "rảnh": không còn pendingAction (cửa sổ Nope)
  # và không còn pendingFavorPick (cửa sổ chọn lá). Dùng sau khi đánh 1
  # action card để chuẩn bị cho action tiếp theo.
  param(
    [Parameter(Mandatory)] $Room,
    [int] $TimeoutSec = 16
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $s = Get-RoomSnap -Room $Room
    $gs = $s.gameState
    if (-not $gs.pendingAction -and -not $gs.pendingFavorPick) { return $s }
    Start-Sleep -Milliseconds 400
  }
  return Get-RoomSnap -Room $Room
}

function Find-PlayerWithCard {
  # Tìm member có card cụ thể trong tay (dùng myHand qua ?memberId=).
  param([Parameter(Mandatory)] $Room, [Parameter(Mandatory)] [string] $CardKey)
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($Room.roomId)/snapshot" -Method Get -TimeoutSec 5
  foreach ($m in $snap.members) {
    if (-not $m.isOnline) { continue }
    $hand = @(Get-HandOf -Room $Room -MemberId $m.id)
    if ($hand -contains $CardKey) { return $m.id }
  }
  return $null
}

function Advance-Turn {
  # Đảm bảo lượt hiện tại được chơi xong để turn chuyển sang người kế.
  #
  # Lưu ý quan trọng: mọi action card (kể cả Skip) đều mở cửa sổ Nope 10s.
  # Turn CHỈ chuyển khi cửa sổ Nope đóng lại (qua NopeTimeoutService hoặc
  # khi không ai cản). Vì vậy helper này phải:
  #   1. chơi action của người đang đến lượt
  #   2. chờ cửa sổ Nope đóng (poll snapshot tới khi pendingAction == null)
  #   3. nếu action bị cản (Nope) -> hoàn tác, chơi lại
  #
  # Trả về @{ TurnBefore; TurnAfter; Action; Ok }.
  param(
    [Parameter(Mandatory)] $Room,
    [int] $MaxActions = 5,
    [int] $NopeWaitSec = 14
  )

  function Get-SnapFast { param($rid)
    Invoke-RestMethod -Uri "$api/api/rooms/$rid/snapshot" -Method Get -TimeoutSec 5
  }

  $roomId = $Room.roomId
  $snap = Get-SnapFast $roomId
  $turnBefore = Get-CurrentTurnId $snap
  if (-not $turnBefore) { return @{ Ok = $false; Reason = "no current turn" } }

  $action = "none"

  for ($i = 0; $i -lt $MaxActions; $i++) {
    $hand = @(Get-HandOf -Room $Room -MemberId $turnBefore)

    if ($hand -contains "skip") {
      $r = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/game/play-card" -Method Post `
        -Body (@{ memberId = $turnBefore; cardKey = "skip" } | ConvertTo-Json) `
        -ContentType "application/json" -TimeoutSec 5
      $action = "skip"
    } else {
      # Không có skip -> rút bài
      $r = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/game/draw-card" -Method Post `
        -Body (@{ memberId = $turnBefore } | ConvertTo-Json) `
        -ContentType "application/json" -TimeoutSec 5
      $action = "draw"

      if ($r.requiresDefuse) {
        # Rút bomb: dùng defuse nếu có
        $hand2 = @(Get-HandOf -Room $Room -MemberId $turnBefore)
        $defuseIdx = -1
        for ($k = 0; $k -lt $hand2.Count; $k++) {
          if ($hand2[$k] -eq "defuse") { $defuseIdx = $k; break }
        }
        if ($defuseIdx -ge 0) {
          $d = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/game/defuse" -Method Post `
            -Body (@{ memberId = $turnBefore; slotIndex = $defuseIdx } | ConvertTo-Json) `
            -ContentType "application/json" -TimeoutSec 5
          $r = $d
          $action = "defuse"
        } else {
          # Không có defuse -> chết, turn vẫn chuyển sang người khác
          $snapNow = Get-SnapFast $roomId
          $turnNow = Get-CurrentTurnId $snapNow
          if ($turnNow -and $turnNow -ne $turnBefore) {
            return @{ Ok = $true; TurnBefore = $turnBefore; TurnAfter = $turnNow; Action = "bomb-death" }
          }
          continue
        }
      }

      if ($r.requiresMoreDraws) {
        # Attack chain: phải rút tiếp (giữ nguyên turn)
        continue
      }
    }

    # ── Chờ cửa sổ Nope đóng ──
    $deadline = (Get-Date).AddSeconds($NopeWaitSec)
    $resolved = $false
    while ((Get-Date) -lt $deadline) {
      $s = Get-SnapFast $roomId
      if (-not $s.gameState.pendingAction) {
        $resolved = $true
        $turnAfter = Get-CurrentTurnId $s
        break
      }
      Start-Sleep -Milliseconds 400
    }

    if (-not $resolved) {
      # Vẫn còn pendingAction -> thử chơi lại (có thể bị cản)
      continue
    }

    if ($turnAfter -and $turnAfter -ne $turnBefore) {
      return @{ Ok = $true; TurnBefore = $turnBefore; TurnAfter = $turnAfter; Action = $action }
    }
  }

  $snap2 = Get-SnapFast $roomId
  return @{
    Ok        = ((Get-CurrentTurnId $snap2) -ne $turnBefore)
    TurnBefore = $turnBefore
    TurnAfter = (Get-CurrentTurnId $snap2)
    Action    = $action
    Reason    = "exhausted $MaxActions actions"
  }
}

function Print-Summary {
  Write-Output ""
  Write-Output "=========================================="
  Write-Output "PASSED: $script:passed   FAILED: $script:failed"
  if ($script:failed -gt 0) {
    Write-Output ""
    Write-Output "Failures:"
    foreach ($f in $script:failures) { Write-Output "  - $f" }
  }
  Write-Output "=========================================="
  if ($script:failed -gt 0) { exit 1 } else { exit 0 }
}
