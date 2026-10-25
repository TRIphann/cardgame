import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryScreen } from "@pages/game/SummaryScreen.jsx";

function buildRoom(members) {
  return { members };
}

const STARTED = "2026-01-01T10:00:00.000Z";

function buildGameState(overrides = {}) {
  return {
    winnerId: null,
    alive: {},
    diedAt: {},
    turnsTaken: {},
    cardsPlayed: {},
    startedAt: STARTED,
    endedAt: null,
    ...overrides,
  };
}

describe("SummaryScreen", () => {
  it("renders the winner's name", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }, { id: "m2", name: "Bob" }]);
    const gs = buildGameState({ winnerId: "m1", alive: { m1: true, m2: false } });

    render(<SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />);

    expect(screen.getByText(/Người thắng: Alice/)).toBeInTheDocument();
  });

  it("shows 'no winner' when there is no winner", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }]);
    const gs = buildGameState({ alive: {} });

    render(<SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />);

    expect(screen.getByText("Không có người thắng")).toBeInTheDocument();
  });

  it("marks the local player with '(bạn)'", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }, { id: "m2", name: "Bob" }]);
    const gs = buildGameState({ winnerId: "m1", alive: { m1: true, m2: false } });

    render(<SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />);

    expect(screen.getByText("Alice (bạn)")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("lists the alive player before the dead ones", () => {
    const room = buildRoom([
      { id: "m1", name: "Alice" },
      { id: "m2", name: "Bob" },
      { id: "m3", name: "Cara" },
    ]);
    const gs = buildGameState({
      winnerId: "m3",
      alive: { m1: false, m2: false, m3: true },
      diedAt: {
        m1: "2026-01-01T10:01:00.000Z",
        m2: "2026-01-01T10:02:00.000Z",
      },
    });

    render(<SummaryScreen room={room} gameState={gs} myId="m3" onContinue={() => {}} />);

    const rows = screen.getAllByRole("row").slice(1); // skip the header row
    // Sort order: alive players first, then dead players by time of death.
    // Cara survived; Alice died at 10:01 (earlier), Bob at 10:02 (later).
    // The name cell can contain a "(bạn)" suffix, so match on a prefix.
    expect(within(rows[0]).getByText(/^Cara/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Alice")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Bob")).toBeInTheDocument();
  });

  it("gives the winner the gold rank class", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }, { id: "m2", name: "Bob" }]);
    const gs = buildGameState({ winnerId: "m1", alive: { m1: true, m2: false } });

    const { container } = render(
      <SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />,
    );

    expect(container.querySelector(".summary-card__rank--gold")).toBeInTheDocument();
  });

  it("marks the dead player's row", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }, { id: "m2", name: "Bob" }]);
    const gs = buildGameState({ winnerId: "m1", alive: { m1: true, m2: false } });

    const { container } = render(
      <SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />,
    );

    expect(container.querySelector(".dead-row")).toBeInTheDocument();
  });

  it("shows the turn and cards-played counters", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }]);
    const gs = buildGameState({
      winnerId: "m1",
      alive: { m1: true },
      turnsTaken: { m1: 7 },
      cardsPlayed: { m1: 4 },
    });

    render(<SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />);

    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("7")).toBeInTheDocument();
    expect(within(row).getByText("4")).toBeInTheDocument();
  });

  it("formats the elapsed time as mm:ss", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }]);
    const gs = buildGameState({
      winnerId: "m1",
      alive: { m1: true },
      startedAt: STARTED,
      endedAt: "2026-01-01T10:02:05.000Z",
    });

    render(<SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />);

    expect(screen.getByText("02:05")).toBeInTheDocument();
  });

  it("shows a dash when the game never started", () => {
    const room = buildRoom([{ id: "m1", name: "Alice" }]);
    const gs = buildGameState({ winnerId: "m1", alive: { m1: true }, startedAt: null });

    render(<SummaryScreen room={room} gameState={gs} myId="m1" onContinue={() => {}} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("calls onContinue when the lobby button is clicked", async () => {
    const onContinue = vi.fn();
    const room = buildRoom([{ id: "m1", name: "Alice" }]);
    const gs = buildGameState({ winnerId: "m1", alive: { m1: true } });

    render(<SummaryScreen room={room} gameState={gs} myId="m1" onContinue={onContinue} />);

    await userEvent.click(screen.getByRole("button", { name: "Về sảnh chờ" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("renders without crashing when the room has no members", () => {
    const gs = buildGameState({ alive: {} });

    render(<SummaryScreen room={{}} gameState={gs} myId="m1" onContinue={() => {}} />);

    expect(screen.getByText("Không có người thắng")).toBeInTheDocument();
  });
});