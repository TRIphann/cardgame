# Bot Modes Integration Test Suite
# Tests drawOnlyBotIds, playCardsBotIds, and oneCardBotCardMap

$api = "http://localhost:5000"
$passed = 0
$failed = 0

function Get-PropVal($obj, $key) {
  if ($null -eq $obj) { return $null }
  $prop = $obj.PSObject.Properties[$key]
  if ($prop) { return $prop.Value } else { return $null }
}

function Run-Test {
  param($name, $script)
  Write-Output ""
  Write-Output "== $name =="
  try {
    & $script
    $global:passed++
    Write-Output "  ✓ PASS"
  } catch {
    $global:failed++
    Write-Output "  ✗ FAIL: $_"
  }
}

Write-Output "=========================================="
Write-Output "BOT MODES TEST SUITE"
Write-Output "=========================================="

Run-Test "1.1 Draw-only bot draws card, ignores actions" {
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
  $created = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post -Body '{"hostName":"R1"}' -ContentType "application/json" -TimeoutSec 5
  $roomId = $created.roomId
  $b1 = @($created.members | Where-Object { $_.isBot })[0]
  $body = @{ roomId=$roomId; dealCards=$false; customHands=@{ $b1.id=@("skip","attack") }; customDeck=@("defuse","defuse","defuse"); firstPlayerId=$b1.id; botTurnSeconds=1; drawOnlyBotIds=@($b1.id) } | ConvertTo-Json -Depth 8
  $start = Invoke-RestMethod -Uri "$api/api/test/start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
  $initTurn = $start.gameState.currentTurnMemberId
  $initHand = Get-PropVal $start.gameState.handCounts $b1.id
  for ($i=1; $i -le 24; $i++) {
    Start-Sleep -Milliseconds 500
    $s = Invoke-RestMethod -Uri "$api/api/test/room/$roomId/snapshot" -Method Get -TimeoutSec 5
    $curTurn = $s.gameState.currentTurnMemberId
    $curHand = Get-PropVal $s.gameState.handCounts $b1.id
    if ($curTurn -ne $initTurn -and $curHand -eq ($initHand+1) -and [string]::IsNullOrEmpty($s.gameState.lastPlayedCardKey)) { return }
    if ($s.gameState.endedAt) { throw "ended early" }
  }
  throw "timeout"
}

Run-Test "2.1 Play-cards bot plays attack (priority)" {
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
  $created = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post -Body '{"hostName":"R2"}' -ContentType "application/json" -TimeoutSec 5
  $roomId = $created.roomId
  $b1 = @($created.members | Where-Object { $_.isBot })[0]
  $body = @{ roomId=$roomId; dealCards=$false; customHands=@{ $b1.id=@("skip","attack") }; customDeck=@("defuse","defuse"); firstPlayerId=$b1.id; botTurnSeconds=1; playCardsBotIds=@($b1.id) } | ConvertTo-Json -Depth 8
  $start = Invoke-RestMethod -Uri "$api/api/test/start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
  for ($i=1; $i -le 24; $i++) {
    Start-Sleep -Milliseconds 500
    $s = Invoke-RestMethod -Uri "$api/api/test/room/$roomId/snapshot" -Method Get -TimeoutSec 5
    if ($s.gameState.lastPlayedCardKey -eq "attack") { return }
    if ($s.gameState.endedAt) { throw "ended" }
  }
  throw "timeout"
}

Run-Test "2.2 Play-cards bot plays favor with valid target" {
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
  $created = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post -Body '{"hostName":"R3"}' -ContentType "application/json" -TimeoutSec 5
  $roomId = $created.roomId
  $bots = @($created.members | Where-Object { $_.isBot })
  $b1=$bots[0]; $b2=$bots[1]
  $body = @{ roomId=$roomId; dealCards=$false; customHands=@{ $b1.id=@("favor","cat_a"); $b2.id=@("defuse","defuse") }; customDeck=@("defuse","defuse"); firstPlayerId=$b1.id; botTurnSeconds=1; playCardsBotIds=@($b1.id) } | ConvertTo-Json -Depth 8
  $start = Invoke-RestMethod -Uri "$api/api/test/start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
  for ($i=1; $i -le 24; $i++) {
    Start-Sleep -Milliseconds 500
    $s = Invoke-RestMethod -Uri "$api/api/test/room/$roomId/snapshot" -Method Get -TimeoutSec 5
    if ($s.gameState.lastPlayedCardKey -eq "favor") { return }
    if ($s.gameState.endedAt) { throw "ended" }
  }
  throw "timeout"
}

Run-Test "3.1 One-card bot plays designated card (skip)" {
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
  $created = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post -Body '{"hostName":"R4"}' -ContentType "application/json" -TimeoutSec 5
  $roomId = $created.roomId
  $b1 = @($created.members | Where-Object { $_.isBot })[0]
  $body = @{ roomId=$roomId; dealCards=$false; customHands=@{ $b1.id=@("skip","attack","cat_a") }; customDeck=@("defuse"); firstPlayerId=$b1.id; botTurnSeconds=1; oneCardBotCardMap=@{ $b1.id="skip" } } | ConvertTo-Json -Depth 8
  $start = Invoke-RestMethod -Uri "$api/api/test/start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
  # 60 × 500ms = 30s. Bot cần ~1s (botTurnSeconds) + cửa sổ Nope 10s để
  # lá "skip" được commit vào discard + lastPlayedCardKey hiện lên.
  for ($i=1; $i -le 60; $i++) {
    Start-Sleep -Milliseconds 500
    $s = Invoke-RestMethod -Uri "$api/api/test/room/$roomId/snapshot" -Method Get -TimeoutSec 5
    if ($s.gameState.lastPlayedCardKey -eq "skip") { return }
    if ($s.gameState.endedAt) { throw "ended" }
  }
  throw "timeout"
}

Run-Test "3.2 One-card bot plays designated favor" {
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
  $created = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post -Body '{"hostName":"R5"}' -ContentType "application/json" -TimeoutSec 5
  $roomId = $created.roomId
  $bots = @($created.members | Where-Object { $_.isBot })
  $b1=$bots[0]; $b2=$bots[1]
  $body = @{ roomId=$roomId; dealCards=$false; customHands=@{ $b1.id=@("favor","skip"); $b2.id=@("defuse","defuse") }; customDeck=@("defuse"); firstPlayerId=$b1.id; botTurnSeconds=1; oneCardBotCardMap=@{ $b1.id="favor" } } | ConvertTo-Json -Depth 8
  $start = Invoke-RestMethod -Uri "$api/api/test/start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
  # 60 × 500ms = 30s — Favor cần cửa sổ Nope 10s + phase chọn lá.
  for ($i=1; $i -le 60; $i++) {
    Start-Sleep -Milliseconds 500
    $s = Invoke-RestMethod -Uri "$api/api/test/room/$roomId/snapshot" -Method Get -TimeoutSec 5
    if ($s.gameState.lastPlayedCardKey -eq "favor") { return }
    if ($s.gameState.endedAt) { throw "ended" }
  }
  throw "timeout"
}

Run-Test "3.3 One-card bot draws when designated card not in hand" {
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
  $created = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post -Body '{"hostName":"R6"}' -ContentType "application/json" -TimeoutSec 5
  $roomId = $created.roomId
  $b1 = @($created.members | Where-Object { $_.isBot })[0]
  $body = @{ roomId=$roomId; dealCards=$false; customHands=@{ $b1.id=@("cat_a") }; customDeck=@("defuse","defuse"); firstPlayerId=$b1.id; botTurnSeconds=1; oneCardBotCardMap=@{ $b1.id="skip" } } | ConvertTo-Json -Depth 8
  $start = Invoke-RestMethod -Uri "$api/api/test/start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
  $initTurn = $start.gameState.currentTurnMemberId
  $initHand = Get-PropVal $start.gameState.handCounts $b1.id
  for ($i=1; $i -le 24; $i++) {
    Start-Sleep -Milliseconds 500
    $s = Invoke-RestMethod -Uri "$api/api/test/room/$roomId/snapshot" -Method Get -TimeoutSec 5
    $curTurn = $s.gameState.currentTurnMemberId
    $curHand = Get-PropVal $s.gameState.handCounts $b1.id
    if ($curTurn -ne $initTurn -and $curHand -eq ($initHand+1) -and [string]::IsNullOrEmpty($s.gameState.lastPlayedCardKey)) { return }
    if ($s.gameState.endedAt) { throw "ended" }
  }
  throw "timeout"
}

Run-Test "4.1 Mixed: draw-only + one-card bots in same room" {
  try { Invoke-RestMethod -Uri "$api/api/test/room/current" -Method Delete -TimeoutSec 3 | Out-Null } catch {}
  Start-Sleep -Milliseconds 400
  $created = Invoke-RestMethod -Uri "$api/api/test/room" -Method Post -Body '{"hostName":"R7","botCount":2}' -ContentType "application/json" -TimeoutSec 5
  $roomId = $created.roomId
  $bots = @($created.members | Where-Object { $_.isBot })
  $b1=$bots[0]; $b2=$bots[1]
  $body = @{ roomId=$roomId; dealCards=$false; customHands=@{ $b1.id=@("cat_a"); $b2.id=@("skip","cat_b") }; customDeck=@("defuse","defuse","defuse","defuse"); firstPlayerId=$b1.id; botTurnSeconds=1; drawOnlyBotIds=@($b1.id); oneCardBotCardMap=@{ $b2.id="skip" } } | ConvertTo-Json -Depth 8
  $start = Invoke-RestMethod -Uri "$api/api/test/start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
  $b1Drew=$false; $b2PlayedSkip=$false
  for ($i=1; $i -le 30; $i++) {
    Start-Sleep -Milliseconds 500
    $s = Invoke-RestMethod -Uri "$api/api/test/room/$roomId/snapshot" -Method Get -TimeoutSec 5
    $b1Hand = Get-PropVal $s.gameState.handCounts $b1.id
    if ($b1Hand -eq 2) { $b1Drew=$true }
    if ($s.gameState.lastPlayedCardKey -eq "skip") { $b2PlayedSkip=$true }
    if ($b1Drew -and $b2PlayedSkip) { return }
    if ($s.gameState.endedAt) { throw "ended early: drew=$b1Drew skip=$b2PlayedSkip" }
  }
  throw "timeout: drew=$b1Drew skip=$b2PlayedSkip"
}

Write-Output ""
Write-Output "=========================================="
Write-Output "FINAL: $passed passed, $failed failed"
Write-Output "=========================================="

if ($failed -gt 0) { exit 1 } else { exit 0 }
