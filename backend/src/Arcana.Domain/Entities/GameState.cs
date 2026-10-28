namespace Arcana.Domain.Entities;

public class GameState
{
    public List<string> Deck { get; set; } = [];
    public List<string> DiscardPile { get; set; } = [];
    // Per-member hand (the local viewer sees only their own hand; others are hidden).
    public Dictionary<string, List<string>> Hands { get; set; } = [];
    // Snapshot of the deck order BEFORE the most recent Shuffle card was
    // played. Used by ChainNopeAsync to roll back the shuffle if a Nope
    // chain cancels the action. Null outside the 5s Shuffle window.
    public List<string>? PreShuffleDeck { get; set; }
    // Snapshot of AttackCounter BEFORE the most recent Attack card was
    // played. Used by ChainNopeAsync to roll back the attack chain if a
    // Nope cancels the action. Null outside the 5s Attack window.
    public int? PreAttackCounter { get; set; }
    // Whose turn it is right now.
    public string CurrentTurnMemberId { get; set; } = string.Empty;
    // Attack: counter that says "the current player has to take N more turns"
    public int AttackCounter { get; set; } = 0;
    // Player stats for the summary screen.
    public Dictionary<string, int> TurnsTaken { get; set; } = [];
    public Dictionary<string, int> CardsPlayed { get; set; } = [];
    // Alive flags — dead members' hands get folded into the discard pile.
    public Dictionary<string, bool> Alive { get; set; } = [];
    // When did each player die (UTC). Null = still alive.
    public Dictionary<string, DateTime?> DiedAt { get; set; } = [];
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public string? WinnerId { get; set; }
    // While this is set, the active action is "pending nope" and other players
    // have a 3s window to chain nopes.
    public PendingAction? PendingAction { get; set; }

    // ── Turn timer ────────────────────────────────────────────
    // When the current player's turn started (UTC). Reset on every turn
    // advance. If null, the game hasn't started or the game has ended.
    // Players get TurnTimeLimitSec to act; if they don't, the server
    // background service auto-draws on their behalf (treated as a normal
    // draw that advances the turn).
    public DateTime? TurnStartedAt { get; set; }

    // ── Client-ready gate ──────────────────────────────────
    // True after at least one human client has called the /ready endpoint
    // for this room. While false the turn-clock background service will NOT
    // auto-draw — we wait for the UI to actually render before counting down
    // (otherwise the player opens the game tab to find they're already AFK).
    // Set to true the first time a player joins the game tab. Cleared on
    // game end (the next StartGameAsync starts it false again so a re-queued
    // game also waits for the new host's ready signal).
    public bool ClientReady { get; set; } = false;

    // ── Turn order ────────────────────────────────────────────
    // Frozen memberId list in the order players take their first turn. The
    // first entry is "thứ 1" (người đi trước), the last entry is "thứ N".
    // We expose this so the client can show "Bạn sẽ đi thứ X" the moment
    // a game starts.
    public List<string> TurnOrder { get; set; } = [];

    // ── Bot behavior (test mode) ─────────────────────────────
    // Bot IDs in this set are in "draw-only" mode: they only draw cards.
    // If a bomb is drawn and they have a defuse, they defuse and then die (no more turns).
    // If no defuse, they die immediately. No action cards are played.
    public HashSet<string> DrawOnlyBotIds { get; set; } = [];
    // Bot IDs in this set auto-draw AND play the best available action card.
    public HashSet<string> PlayCardsBotIds { get; set; } = [];
    // Per-bot "play this exact card" map. The BotService looks up the current
    // player's entry and forces the card if present, falling back to normal
    // priority selection when the entry is missing.
    public Dictionary<string, string> OneCardBotCardMap { get; set; } = [];
    // When true, BotService will skip processing this room (for manual testing).
    public bool DisableBotService { get; set; } = false;
    // Override turn timer for bots (in seconds). Default 0 = use the
    // unified 10s turn timer. Set to 1 for slightly delayed bots, keep at
    // 0 for instant bot actions during QA.
    public int BotTurnSeconds { get; set; } = 0;

    // ── Cinematic broadcast fields ─────────────────────────────────
    // Set by DrawCardAsync so every viewer can show the bomb-reveal
    // animation in sync. Cleared a few seconds later by the broadcaster
    // (or by the next state mutation).
    public string? LastDrawnBy { get; set; }
    public string? LastDrawnCardKey { get; set; }
    public DateTime? LastDrawnAt { get; set; }
    // True while the bomb-reveal overlay is showing (drawn bomb, not yet
    // exploded or defused). Drives a 3s cinematic for everyone in the room.
    public bool BombRevealActive { get; set; } = false;

    // ── AFK auto-play fields ─────────────────────────────────────
    // Members in this set have been marked "AFK" by the turn-clock service
    // because their first turn hit the 10s window with no action. While
    // they're in this set, the server auto-draws on their turn immediately
    // (no 10s wait) and the UI prompts them with a "Bạn có đang chơi không?"
    // modal until they click "Tôi đã quay lại".
    public HashSet<string> AfkMemberIds { get; set; } = [];

    // ── Future-peek field (persisted so SignalR re-fetch survives) ──
    // Set when a player plays the Future card; survives the SignalR snapshot
    // re-fetch so the FuturePeekModal can render correctly on reconnection.
    public List<string>? FuturePeek { get; set; }
    // When the current FuturePeek was generated. The GameService background
    // sweeper (or any subsequent turn advance) clears the peek once
    // (now - FuturePeekAt) > the modal lifetime (~10s after the card lands)
    // so the modal doesn't re-open itself every snapshot poll.
    public DateTime? FuturePeekAt { get; set; }

    // ── Pending Favor-pick field ───────────────────────
    // While this is set, the Favor card is in its post-play "choose a card"
    // phase. It survives the SignalR snapshot re-fetch so the modal renders
    // correctly on reconnection, and gets cleared when the pick lands or the
    // action gets Nope'd.
    public PendingFavorPick? PendingFavorPick { get; set; }

    // ── Pending target-pick field (Favor phase 1 / Combo 2-3) ──
    // While this is set, the ACTOR has played a card that needs a target
    // chosen before the action can commit (Favor phase 1: "pick who to
    // ask", Combo 2-same: "pick whose card to take"). The client opens a
    // player picker; the server arms a 10s timeout so the game can never
    // stall on a player who walked away from the tab.
    //
    // Lives on GameState (not PendingAction) because this phase has NOT yet
    // opened a Nope window — the action isn't committed until the target
    // is chosen.
    public PendingTargetPick? PendingTargetPick { get; set; }

    // ── Action-card cinematic fields ────────────────────────
    // Most recent action / nope card that should appear centre-screen for
    // everyone. Reset each time someone chains a Nope. Cleared when the
    // action resolves (window expires or chain even).
    public string? LastPlayedCardKey { get; set; }
    public string? LastPlayedBy { get; set; }
    public DateTime? LastPlayedAt { get; set; }
    public string? LastPlayedByNope { get; set; } // memberId who most recently played Nope (if last entry is Nope)
}
