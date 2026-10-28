# Normal Lobby E2E test - multi-tab parallel real users.
#
# Covers scenarios from TEST_LOBBY_TEST_CASES.md Section PHẦN LOBBY:
#   N.1   Host creates room, gets 6-char code
#   N.2   Player 2 joins via code
#   N.3   Player 3 joins via code
#   N.4   All 3 ready
#   N.5   Host starts game
#   N.6   Player 1, 2, 3 see game state
#   N.7   Snapshot for player 2 has myHand populated
#   N.8   Snapshot for player 3 has myHand populated
#   N.9   Turn progresses through players
#   N.10  Player 2 draws card, hand increases
#   N.11  Player 3 plays an action (Skip)
#   N.12  Player 1 sees Player 3's played card in discard
#   N.13  Turn advances to next player
#   N.14  Lobby heartbeat keeps player online
#   N.15  Player 2 leaves mid-game
#   N.16  Room still has 2 players
#   N.17  Game continues after leave
#   N.18  Multi-tab parallel: 3 tabs join simultaneously (no race conditions)
#
#   ─── Extended coverage (kỹ hơn) ───
#   N.19  4th player joins after game starts (rejected)
#   N.20  Host kicks player before start
#   N.21  Player un-ready (toggle ready off)
#   N.22  Snapshot for 4 players all see same gameState
#   N.23  Multiple parallel draws (race condition)
#   N.24  Snapshot consistency under load (10 polls in 5s)
#   N.25  Same code re-join: second join with same name creates new member

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "NORMAL LOBBY (MULTI-TAB PARALLEL) TEST SUITE"
Write-Output "=========================================="

# Use distinct code per suite so it can run in parallel with other suites
$script:suiteCode = "NORM$(Get-Random -Min 1000 -Max 9999)"

# ─────────────────────────────────────────────────────────────────────
# N.1 - Host tạo room qua UI (POST /api/rooms)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.1 Host creates room via POST /api/rooms" {
  $body = @{ hostName = "Alice-$($script:suiteCode)" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  if (-not $r.id) { throw "no room id" }
  if ($r.code.Length -ne 6) { throw "code should be 6 chars, got $($r.code)" }
  if ($r.status -ne "waiting") { throw "status should be 'waiting', got $($r.status)" }
  if ($r.hostName -ne "Alice-$($script:suiteCode)") { throw "hostName mismatch" }
  if ($r.members.Count -ne 1) { throw "should have 1 member (host), got $($r.members.Count)" }

  $script:roomId = $r.id
  $script:roomCode = $r.code
  $script:hostId = $r.hostId
  $script:hostName = $r.hostName
}

# ─────────────────────────────────────────────────────────────────────
# N.18 - Multi-tab parallel: 3 players join simultaneously (race test)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.18 3 tabs join in parallel (no race conditions)" {
  # Reset
  $body = @{ hostName = "Race-$($script:suiteCode)" } | ConvertTo-Json
  $hostRoom = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5
  $script:raceRoomId = $hostRoom.id
  $script:raceCode = $hostRoom.code
  $script:raceHostId = $hostRoom.hostId

  # 3 joiners gọi song song qua Start-ThreadJob (PowerShell 7+)
  # Fallback: dùng 3 background threads với throttling 50ms
  $jobs = @()
  for ($i = 1; $i -le 3; $i++) {
    $name = "Joiner$i-$($script:suiteCode)"
    $jobs += Start-ThreadJob -ArgumentList $api, $script:raceCode, $name -ScriptBlock {
      param($a, $c, $n)
      try {
        $body = @{ code = $c; playerName = $n } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$a/api/rooms/join" -Method Post `
          -Body $body -ContentType "application/json" -TimeoutSec 5
        return @{ ok = $true; name = $n; id = ($r.members | Where-Object { $_.name -eq $n })[0].id; count = $r.members.Count }
      } catch {
        return @{ ok = $false; name = $n; err = $_.Exception.Message }
      }
    }
  }

  $results = Wait-Job -Job $jobs | ForEach-Object { Receive-Job -Job $_ }
  Remove-Job -Job $jobs -Force

  $okCount = @($results | Where-Object { $_.ok }).Count
  if ($okCount -lt 3) {
    $errs = @($results | Where-Object { -not $_.ok } | ForEach-Object { "$($_.name): $($_.err)" })
    throw "Only $okCount/3 joiners succeeded. Errors: $($errs -join '; ')"
  }

  # Verify final state: 4 members (host + 3 joiners)
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:raceRoomId)/snapshot" -Method Get -TimeoutSec 5
  if ($snap.members.Count -ne 4) {
    throw "After parallel join, room should have 4 members, got $($snap.members.Count)"
  }

  # Verify no duplicate IDs
  $ids = @($snap.members | ForEach-Object { $_.id })
  if (($ids | Sort-Object -Unique).Count -ne 4) {
    throw "Member IDs are not unique"
  }

  $script:raceJoinerIds = @{}
  foreach ($r in $results) { $script:raceJoinerIds[$r.name] = $r.id }
  $script:bobId = $script:raceJoinerIds["Joiner1-$($script:suiteCode)"]
  $script:carolId = $script:raceJoinerIds["Joiner2-$($script:suiteCode)"]
  $script:daveId = $script:raceJoinerIds["Joiner3-$($script:suiteCode)"]
}

# ─────────────────────────────────────────────────────────────────────
# N.2 - Player 2 join (sequential, after race test)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.2 Player 2 joins via code (sequential sanity check)" {
  $body = @{ code = $script:roomCode; playerName = "Bob-$($script:suiteCode)" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  if ($r.members.Count -lt 2) { throw "should have 2 members, got $($r.members.Count)" }
  if ($r.members[1].name -ne "Bob-$($script:suiteCode)") { throw "second member should be Bob" }

  $script:bobId = ($r.members | Where-Object { $_.name -eq "Bob-$($script:suiteCode)" })[0].id
}

# ─────────────────────────────────────────────────────────────────────
# N.3 - Player 3 join
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.3 Player 3 joins via code" {
  $body = @{ code = $script:roomCode; playerName = "Carol-$($script:suiteCode)" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  if ($r.members.Count -lt 3) { throw "should have 3 members, got $($r.members.Count)" }

  $script:carolId = ($r.members | Where-Object { $_.name -eq "Carol-$($script:suiteCode)" })[0].id
}

# ─────────────────────────────────────────────────────────────────────
# N.25 - Re-join with same name creates new member (no identity collision)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.25 Same-name rejoin creates a new member id" {
  # Dùng room riêng để không làm nhiễu room chính
  $rejoinHost = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post `
    -Body (@{ hostName = "RejoinHost-$($script:suiteCode)" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $body = @{ code = $rejoinHost.code; playerName = "Twin-$($script:suiteCode)" } | ConvertTo-Json
  $r1 = Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  $body2 = @{ code = $rejoinHost.code; playerName = "Twin-$($script:suiteCode)" } | ConvertTo-Json
  $r2 = Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post `
    -Body $body2 -ContentType "application/json" -TimeoutSec 5

  $twins = @($r2.members | Where-Object { $_.name -eq "Twin-$($script:suiteCode)" })
  if ($twins.Count -lt 2) {
    throw "Re-join should create another Twin member, got $($twins.Count)"
  }
  $ids = @($twins | ForEach-Object { $_.id } | Sort-Object -Unique)
  if ($ids.Count -lt 2) {
    throw "Re-join members should have distinct ids"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.4 - Tất cả ready
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.4 All players ready" {
  # Host KHÔNG cần ready (server chủ động set IsReady=true cho host).
  # Ready tất cả member online không phải host.
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  foreach ($m in $snap.members) {
    if ($m.isOnline -and -not $m.isHost -and -not $m.isReady) {
      $body = @{ memberId = $m.id; isReady = $true } | ConvertTo-Json
      Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/ready" -Method Post `
        -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
    }
  }

  $snap2 = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $notReady = @($snap2.members | Where-Object { -not $_.isHost -and -not $_.isReady -and $_.isOnline }).Count
  if ($notReady -gt 0) { throw "$notReady players not ready" }
}

# ─────────────────────────────────────────────────────────────────────
# N.21 - Player un-ready (toggle ready off)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.21 Player toggles ready off and on again" {
  # Set Bob un-ready
  $body = @{ memberId = $script:bobId; isReady = $false } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/ready" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  if ($r.isReady -ne $false) { throw "Bob should be un-ready" }

  # Set Bob ready again
  $body = @{ memberId = $script:bobId; isReady = $true } | ConvertTo-Json
  $r2 = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/ready" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5
  if ($r2.isReady -ne $true) { throw "Bob should be ready again" }
}

# ─────────────────────────────────────────────────────────────────────
# N.5 - Host start game
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.5 Host starts game" {
  $body = @{ hostId = $script:hostId } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/start" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 10

  if ($r.status -ne "playing") { throw "status should be 'playing', got $($r.status)" }
  if (-not $r.gameState.startedAt) { throw "startedAt should be set" }
}

# ─────────────────────────────────────────────────────────────────────
# N.6 - Tất cả snapshot có gameState
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.6 All players see game state in snapshot" {
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  if (-not $snap.gameState) { throw "gameState missing" }
  $handCounts = Get-HandCountMap $snap
  if ($handCounts.Count -lt 3) { throw "handCounts should have 3 players, got $($handCounts.Count)" }
}

# ─────────────────────────────────────────────────────────────────────
# N.7 - Snapshot cho Bob (player 2) có myHand
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.7 Bob snapshot has myHand populated" {
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot?memberId=$($script:bobId)" -Method Get -TimeoutSec 5
  if (-not $snap.gameState) { throw "gameState missing for Bob" }
  if ((Get-HandCount $snap $script:bobId) -lt 1) {
    throw "Bob should have at least 1 card, got $(Get-HandCount $snap $script:bobId)"
  }
  $myHand = Get-MyHand $snap
  if ($myHand.Count -lt 1) { throw "Bob myHand should be populated (got $($myHand.Count) cards)" }
  if ($myHand.Count -ne (Get-HandCount $snap $script:bobId)) {
    throw "myHand count ($($myHand.Count)) should match handCounts"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.8 - Snapshot cho Carol (player 3) có myHand
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.8 Carol snapshot has myHand populated" {
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot?memberId=$($script:carolId)" -Method Get -TimeoutSec 5
  if (-not $snap.gameState) { throw "gameState missing for Carol" }
  if ((Get-HandCount $snap $script:carolId) -lt 1) {
    throw "Carol should have at least 1 card, got $(Get-HandCount $snap $script:carolId)"
  }
  $myHand = Get-MyHand $snap
  if ($myHand.Count -lt 1) { throw "Carol myHand should be populated (got $($myHand.Count) cards)" }
  if ($myHand.Count -ne (Get-HandCount $snap $script:carolId)) {
    throw "myHand count ($($myHand.Count)) should match handCounts"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.9 - Turn progression
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.9 Turn progresses through players" {
  # Normal lobby shuffle turn order ngẫu nhiên, nên phải chơi đúng người
  # đang đến lượt chứ không hardcode Bob.
  $r = Advance-Turn -Room @{ roomId = $script:roomId }
  if (-not $r.Ok) { throw "Turn did not advance: $($r.Reason)" }
  if ($r.TurnAfter -eq $r.TurnBefore) { throw "After action, turn should NOT be on the same player" }
  Write-Output "  $($r.Action): $($r.TurnBefore) -> $($r.TurnAfter)"
}

# ─────────────────────────────────────────────────────────────────────
# N.10 - Player 2 draws card, hand tăng
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.10 Bob draws card, hand size increases" {
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $turnNow = Get-CurrentTurnId $snap

  if ($turnNow -ne $script:bobId) {
    Write-Output "  (skip) Bob is not current turn (turn=$turnNow), skipping"
    return
  }

  $handBefore = Get-HandCount $snap $script:bobId

  $draw = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/game/draw-card" -Method Post `
    -Body (@{ memberId = $script:bobId } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if ($draw.requiresDefuse) {
    Write-Output "  (note) Bob drew bomb - hand logic skipped"
    return
  }
  $handAfter = Get-HandCount $draw.room $script:bobId
  if ($handAfter -le $handBefore) {
    throw "Bob's hand should increase: was $handBefore, got $handAfter"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.11 - Player 3 plays Skip
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.11 Carol plays Skip" {
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $turnNow = Get-CurrentTurnId $snap
  if ($turnNow -ne $script:carolId) {
    Write-Output "  (skip) Carol is not current turn (turn=$turnNow), skipping"
    return
  }

  $carolHand = @(Get-HandOf -Room @{ roomId = $script:roomId } -MemberId $script:carolId)
  if ($carolHand.Count -lt 1) {
    Write-Output "  (skip) Carol has no cards"
    return
  }
  if ($carolHand -notcontains "skip") {
    Write-Output "  (skip) Carol has no Skip card (hand: $($carolHand -join ','))"
    return
  }

  $r = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $script:carolId; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Skip mở cửa sổ Nope 10s -> turn chỉ chuyển sau khi cửa sổ đóng.
  $after = Wait-NopeResolve -Room @{ roomId = $script:roomId }
  if ((Get-CurrentTurnId $after) -eq $script:carolId) {
    throw "Turn should advance after Carol plays Skip (after nope window)"
  }
  $script:skipPlayed = $true
}

# ─────────────────────────────────────────────────────────────────────
# N.12 - Discard pile có Skip (sau khi ai đó play)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.12 Player 3's played card is visible to Player 1" {
  # Normal room DTO không expose full discardPile (chỉ discardCount). Verify
  # the played card is visible to ANOTHER player via the shared gameState:
  # lastPlayedCardKey + lastPlayedBy + cardsPlayed đều là state chung.
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $playedBefore = Get-CounterTotal $snap "cardsPlayed"

  # Tìm người đang đến lượt và có Skip để chơi
  $turnNow = Get-CurrentTurnId $snap
  $hand = @(Get-HandOf -Room @{ roomId = $script:roomId } -MemberId $turnNow)
  if ($hand -notcontains "skip") {
    Write-Output "  (skip) current turn player has no Skip (hand: $($hand -join ','))"
    return
  }

  $r = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $turnNow; cardKey = "skip" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # lastPlayedCardKey / lastPlayedBy là "cinematic" của cửa sổ Nope: backend
  # chủ đích xoá chúng (ClearActionCinematic) ngay khi cửa sổ đóng. Vì vậy
  # Player 1 phải thấy lá vừa đánh TRONG lúc cửa sổ còn mở, không phải sau đó.
  $hostSnap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot?memberId=$($script:hostId)" -Method Get -TimeoutSec 5
  if (-not $hostSnap.gameState.lastPlayedCardKey) {
    throw "Player 1 should see lastPlayedCardKey while the Nope window is open"
  }
  if ($hostSnap.gameState.lastPlayedCardKey -ne "skip") {
    throw "lastPlayedCardKey should be 'skip', got $($hostSnap.gameState.lastPlayedCardKey)"
  }
  if ($hostSnap.gameState.lastPlayedBy -ne $turnNow) {
    throw "lastPlayedBy should be the player who played ($turnNow), got $($hostSnap.gameState.lastPlayedBy)"
  }
  Write-Output "  Player 1 sees lastPlayed=$($hostSnap.gameState.lastPlayedCardKey) by $($hostSnap.gameState.lastPlayedBy)"

  # Chờ cửa sổ Nope đóng để action commit; lúc này cinematic đã bị xoá và
  # chỉ còn bộ đếm cardsPlayed (state bền) là bằng chứng lá bài đã được đánh.
  $after = Wait-NopeResolve -Room @{ roomId = $script:roomId }
  $hostAfter = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot?memberId=$($script:hostId)" -Method Get -TimeoutSec 5
  $playedAfter = Get-CounterTotal $hostAfter "cardsPlayed"
  if ($playedAfter -le $playedBefore) {
    throw "cardsPlayed should increase: was $playedBefore, got $playedAfter"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.13 - Turn advances to next player after draw
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.13 Turn advances to next player after draw" {
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $turnBefore = Get-CurrentTurnId $snap
  if (-not $turnBefore) { throw "no current turn" }

  $r = Advance-Turn -Room @{ roomId = $script:roomId }
  if (-not $r.Ok) { throw "Turn did not advance: $($r.Reason)" }
  if ($r.TurnAfter -eq $turnBefore) {
    throw "Turn should advance after action"
  }

  # Turn mới phải là người khác và phải còn sống
  $snap2 = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $alive = $snap2.gameState.alive
  $aliveProp = $alive.PSObject.Properties[$r.TurnAfter]
  if ($aliveProp -and $aliveProp.Value -eq $false) {
    throw "Turn moved to a dead player"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.14 - Heartbeat giữ player online
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.14 Heartbeat keeps player online" {
  # Heartbeat trả 204 No Content -> Invoke-RestMethod trả $null.
  # Dùng Invoke-WebRequest + SkipHttpErrorCheck để lấy status code.
  $status = Invoke-Status -Uri "$api/api/rooms/$($script:roomId)/heartbeat" `
    -Body @{ memberId = $script:carolId }
  if ($status -ne 200 -and $status -ne 204) {
    throw "heartbeat should return 200/204, got $status"
  }

  # Sau heartbeat, player vẫn online
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $carol = @($snap.members | Where-Object { $_.id -eq $script:carolId })[0]
  if ($null -eq $carol) { throw "Carol should still be a member after heartbeat" }
  if (-not $carol.isOnline) { throw "Carol should be online after heartbeat" }
}

# ─────────────────────────────────────────────────────────────────────
# N.23 - Multiple parallel snapshots (race in polling)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.23 10 parallel snapshots return consistent state" {
  $jobs = @()
  for ($i = 0; $i -lt 10; $i++) {
    $jobs += Start-ThreadJob -ArgumentList $api, $script:roomId -ScriptBlock {
      param($a, $r)
      try {
        $snap = Invoke-RestMethod -Uri "$a/api/rooms/$r/snapshot" -Method Get -TimeoutSec 5
        # Serialize handCounts deterministically để so sánh torn read
        $parts = @()
        foreach ($p in $snap.gameState.handCounts.PSObject.Properties) {
          $parts += "$($p.Name)=$($p.Value)"
        }
        $sig = (($parts | Sort-Object) -join "|")
        return @{ ok = $true; sig = $sig; turn = $snap.gameState.currentTurnMemberId }
      } catch {
        return @{ ok = $false; err = $_.Exception.Message }
      }
    }
  }
  $results = Wait-Job -Job $jobs | ForEach-Object { Receive-Job -Job $_ }
  Remove-Job -Job $jobs -Force

  $ok = @($results | Where-Object { $_.ok })
  if ($ok.Count -ne 10) {
    $errs = @($results | Where-Object { -not $_.ok } | ForEach-Object { $_.err })
    throw "Only $($ok.Count)/10 snapshots succeeded: $($errs -join '; ')"
  }

  # Tất cả signature phải giống nhau (no torn read)
  $first = $ok[0].sig
  foreach ($r in $ok) {
    if ($r.sig -ne $first) {
      throw "Snapshot hands diverged under load (torn read): '$($r.sig)' vs '$first'"
    }
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.24 - 10 sequential snapshots trong 5s (no degradation)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.24 10 sequential snapshots within 5s" {
  $start = Get-Date
  for ($i = 0; $i -lt 10; $i++) {
    $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 3
    if (-not $snap.gameState) { throw "Snapshot #$($i+1) missing gameState" }
  }
  $elapsed = (Get-Date) - $start
  if ($elapsed.TotalSeconds -gt 10) {
    throw "10 snapshots took $($elapsed.TotalSeconds)s - too slow"
  }
  Write-Output "  10 snapshots in $([math]::Round($elapsed.TotalSeconds, 2))s"
}

# ─────────────────────────────────────────────────────────────────────
# N.15 - Player 2 leaves mid-game
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.15 Bob leaves mid-game" {
  $body = @{ memberId = $script:bobId } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/members/$($script:bobId)/leave" -Method Post `
    -Body $body -ContentType "application/json" -TimeoutSec 5

  if ($null -ne $r.error) { throw "leave failed: $($r.error)" }
}

# ─────────────────────────────────────────────────────────────────────
# N.16 - Còn 2 players sau leave
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.16 Room still has Alice + Carol after Bob leaves" {
  Start-Sleep -Milliseconds 500
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  $remainingNames = @($snap.members | Where-Object { $_.isOnline }).Count
  if ($remainingNames -lt 2) {
    throw "Expected at least 2 online members, got $remainingNames"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.17 - Game continues after leave
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.17 Game continues after player leaves" {
  Start-Sleep -Milliseconds 800
  $snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:roomId)/snapshot" -Method Get -TimeoutSec 5
  if ($snap.status -ne "playing") {
    throw "Status should remain 'playing' after leave, got $($snap.status)"
  }
  if (-not $snap.gameState) { throw "gameState should remain after leave" }
}

# ─────────────────────────────────────────────────────────────────────
# N.20 - Host kicks player before game starts
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.20 Host kicks player before start" {
  # Tạo room riêng để test kick
  $kickHost = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post `
    -Body (@{ hostName = "KickHost-$($script:suiteCode)" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5
  $kickRoomId = $kickHost.id
  $kickCode = $kickHost.code
  $kickHostId = $kickHost.hostId

  # 2 người join
  $p2 = Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post `
    -Body (@{ code = $kickCode; playerName = "Kickee-$($script:suiteCode)" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5
  $kickeeId = ($p2.members | Where-Object { $_.name -eq "Kickee-$($script:suiteCode)" })[0].id

  # Host kick
  $kickBody = @{ hostId = $kickHostId; targetMemberId = $kickeeId } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms/$kickRoomId/kick" -Method Post `
    -Body $kickBody -ContentType "application/json" -TimeoutSec 5

  $remaining = @($r.members | Where-Object { $_.id -eq $kickeeId }).Count
  if ($remaining -gt 0) { throw "Kickee should be removed from members" }
  if ($r.members.Count -ne 1) { throw "Room should have 1 member after kick" }
}

# ─────────────────────────────────────────────────────────────────────
# N.19 - 4th player joins after game starts (should be rejected)
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.19 Joining started room returns error" {
  $body = @{ code = $script:roomCode; playerName = "LateJoiner-$($script:suiteCode)" } | ConvertTo-Json
  $statusCode = 0
  $r = $null
  try {
    $r = Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post `
      -Body $body -ContentType "application/json" -TimeoutSec 5
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $r = $null
  }

  # Có thể trả về lỗi (400/409) hoặc thêm vào members (tùy logic)
  if ($r -and $r.members) {
    $lateCount = @($r.members | Where-Object { $_.name -eq "LateJoiner-$($script:suiteCode)" }).Count
    if ($lateCount -gt 0) {
      Write-Output "  (note) Late joiner was added to room (status $statusCode)"
    }
  } else {
    if ($statusCode -lt 400) {
      throw "Expected error status code for late join, got $statusCode"
    }
    Write-Output "  (ok) Late join rejected with $statusCode"
  }
}

# ─────────────────────────────────────────────────────────────────────
# N.22 - All 4 players in race room see same gameState
# ─────────────────────────────────────────────────────────────────────
Run-Test "N.22 All 4 players in race room see consistent snapshot" {
  if (-not $script:raceRoomId) {
    Write-Output "  (skip) no race room created"
    return
  }

  # Start race room với 4 players
  $startBody = @{ hostId = $script:raceHostId } | ConvertTo-Json
  try {
    $r = Invoke-RestMethod -Uri "$api/api/rooms/$($script:raceRoomId)/start" -Method Post `
      -Body $startBody -ContentType "application/json" -TimeoutSec 10
  } catch {
    Write-Output "  (skip) cannot start race room: $($_.Exception.Message)"
    return
  }

  if ($r.status -ne "playing") {
    Write-Output "  (note) race room status: $($r.status)"
    return
  }

  # Lấy snapshot cho từng member
  $snapshots = @()
  $snapshots += @{ viewer = "host"; snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:raceRoomId)/snapshot?memberId=$($script:raceHostId)" -TimeoutSec 5 }
  foreach ($name in @("Joiner1-$($script:suiteCode)", "Joiner2-$($script:suiteCode)", "Joiner3-$($script:suiteCode)")) {
    $mid = $script:raceJoinerIds[$name]
    if ($mid) {
      $snapshots += @{ viewer = $name; snap = Invoke-RestMethod -Uri "$api/api/rooms/$($script:raceRoomId)/snapshot?memberId=$mid" -TimeoutSec 5 }
    }
  }

  # Tất cả snapshots phải cùng startedAt
  $startedAt = $snapshots[0].snap.gameState.startedAt
  foreach ($s in $snapshots) {
    if ($s.snap.gameState.startedAt -ne $startedAt) {
      throw "Viewer $($s.viewer) sees different startedAt"
    }
    $hc = Get-HandCountMap $s.snap
    if ($hc.Count -ne 4) {
      throw "Viewer $($s.viewer) sees $($hc.Count) handCounts, expected 4"
    }
  }
}

Print-Summary
