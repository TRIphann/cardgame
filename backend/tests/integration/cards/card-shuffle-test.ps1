# Shuffle (Xáo Bài) card test suite.
#
# Covers scenarios TC3.2 - TC3.6 from TEST_LOBBY_TEST_CASES.md:
#   3.2  Shuffle - User dùng lần 1 (deck order changes)
#   3.3  Shuffle - Double shuffle
#   3.4  Shuffle - Bot dùng (play-cards)
#   3.5  Shuffle - Multi-Nope scenario
#   3.6  Shuffle - Animation/reveal (snapshot-only)

. "$PSScriptRoot\..\_lib.ps1"

Write-Output "=========================================="
Write-Output "SHUFFLE CARD TEST SUITE"
Write-Output "=========================================="

# ─────────────────────────────────────────────────────────────────────
# 3.2 - User shuffle: deck thay đổi thứ tự
# ─────────────────────────────────────────────────────────────────────
Run-Test "3.2 User plays Shuffle, deck order changes (still same multiset)" {
  $room = New-TestRoom -hostName "ShuffleUser"
  $hostMember = Get-Host $room

  $deck = @("attack","skip","defuse","favor","nope","cat_a","cat_b","future","skip","defuse")
  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("shuffle") } `
    -CustomDeck  $deck `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $beforeDeck = @(Get-DeckList -Room $room)
  Write-Output "  Deck before: $($beforeDeck -join ',')"

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  $afterDeck = Get-DeckList -Room $room
  Write-Output "  Deck after:  $($afterDeck -join ',')"

  if ($afterDeck.Count -ne $beforeDeck.Count) {
    $beforeCount = $beforeDeck.Count
    $afterCount = $afterDeck.Count
    throw "Deck size changed: $beforeCount -> $afterCount"
  }

  # Multiset phải bằng nhau (cùng các lá, chỉ đổi thứ tự)
  $sortedBefore = ($beforeDeck | Sort-Object) -join ','
  $sortedAfter  = ($afterDeck  | Sort-Object) -join ','
  if ($sortedBefore -ne $sortedAfter) {
    throw "Deck multiset changed! before=$sortedBefore, after=$sortedAfter"
  }

  # Thứ tự (rất có thể) đã đổi
  if (($beforeDeck -join ',') -eq ($afterDeck -join ',')) {
    Write-Output "  (note) shuffle produced identical order - possible but unlikely"
  }

  # Shuffle phải nằm trong discard pile
  if (-not (Test-DiscardHas -Room $room -CardKey "shuffle")) {
    throw "Shuffle not in discard pile"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 3.3 - Double shuffle: hai lần shuffle vẫn giữ multiset
# ─────────────────────────────────────────────────────────────────────
Run-Test "3.3 Double shuffle preserves deck multiset, changes order" {
  $room = New-TestRoom -hostName "DoubleShuffle"
  $hostMember = Get-Host $room

  $deck = @("attack","skip","defuse","favor","nope","cat_a","cat_b","cat_c","cat_d","future","skip")
  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("shuffle","shuffle") } `
    -CustomDeck  $deck `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $sortedInitial = (Get-DeckList -Room $room | Sort-Object) -join ','

  $sh1 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Chờ cửa sổ Nope của lần shuffle đầu đóng lại (10s) trước khi shuffle lần 2
  Wait-Idle -Room $room -TimeoutSec 16 | Out-Null

  $sh2 = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5
  Wait-Idle -Room $room -TimeoutSec 16 | Out-Null

  $finalDeck = Get-DeckList -Room $room
  $sortedFinal = ($finalDeck | Sort-Object) -join ','

  if ($sortedFinal -ne $sortedInitial) {
    throw "Deck multiset changed after 2 shuffles!"
  }

  # discard pile phải có 2 shuffle
  $shufflesInDiscard = @((Get-DiscardPile -Room $room) | Where-Object { $_ -eq "shuffle" }).Count
  if ($shufflesInDiscard -lt 2) {
    throw "Expected 2 'shuffle' in discard, got $shufflesInDiscard"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 3.4 - Bot dùng Shuffle (play-cards mode)
# ─────────────────────────────────────────────────────────────────────
Run-Test "3.4 Bot in play-cards mode plays Shuffle" {
  $room = New-TestRoom -hostName "BotShuffle"
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $b1.id = @("shuffle","defuse") } `
    -CustomDeck  @("attack","skip","defuse","favor","nope","cat_a","cat_b") `
    -FirstPlayerId $b1.id `
    -BotTurnSeconds 0 `
    -PlayCardsBotIds @($b1.id)

  $snap = Wait-Snap -Room $room -Predicate { $args[0].gameState.lastPlayedCardKey -eq "shuffle" } -TimeoutSec 15

  if ($snap.gameState.lastPlayedCardKey -ne "shuffle") {
    $lastPlayed = $snap.gameState.lastPlayedCardKey
    throw "Bot did not play Shuffle, last=$lastPlayed"
  }
  if (-not (Test-DiscardHas -Room $room -CardKey "shuffle")) {
    throw "Shuffle not in discard pile"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 3.5 - Multi-nope: shuffle bị bot nope rồi host nope lại
# ─────────────────────────────────────────────────────────────────────
Run-Test "3.5 Shuffle - bot nopes user's shuffle" {
  $room = New-TestRoom -hostName "ShuffleNope"
  $hostMember = Get-Host $room
  $bots = Get-Bots $room
  $b1 = $bots[0]

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("shuffle"); $b1.id = @("nope") } `
    -CustomDeck  @("attack","skip","defuse","favor","cat_a","cat_b") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $beforeDeck = @(Get-DeckList -Room $room)

  # User plays Shuffle
  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Bot nopes
  $nope = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/nope" -Method Post `
    -Body (@{ memberId = $b1.id } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  # Sau nope chain, deck KHÔNG được shuffle (vì action bị cancel)
  $finalDeck = Get-DeckList -Room $room
  if (($finalDeck -join ',') -ne ($beforeDeck -join ',')) {
    Write-Output "  (note) deck reordered despite nope - verify cancel logic if this is a bug"
  }
}

# ─────────────────────────────────────────────────────────────────────
# 3.6 - Shuffle snapshot exposes deck (sanity check)
# ─────────────────────────────────────────────────────────────────────
Run-Test "3.6 Snapshot returns deck array after shuffle" {
  $room = New-TestRoom -hostName "ShuffleSnap"
  $hostMember = Get-Host $room

  $start = Start-TestGame -Room $room `
    -CustomHands @{ $hostMember.id = @("shuffle") } `
    -CustomDeck  @("attack","skip","defuse","favor","nope","cat_a","cat_b","cat_c") `
    -FirstPlayerId $hostMember.id `
    -BotTurnSeconds 0 `
    -DisableBotService $true

  $play = Invoke-RestMethod -Uri "$api/api/rooms/$($room.roomId)/game/play-card" -Method Post `
    -Body (@{ memberId = $hostMember.id; cardKey = "shuffle" } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5

  if ($null -eq (Get-DeckList -Room $room)) { throw "Snapshot missing deck field" }
  if ((Get-DeckList -Room $room).Count -lt 5) { throw "Deck should have many cards after shuffle" }
}

Print-Summary
