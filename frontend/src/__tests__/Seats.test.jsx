import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Seats } from "@pages/lobby/Seats.jsx";

function member(id, over = {}) {
  return { id, name: id.toUpperCase(), isHost: false, isReady: false, ...over };
}

describe("Seats", () => {
  it("always puts the host in the first left slot", () => {
    const members = [member("host", { isHost: true }), member("b"), member("c")];

    render(
      <Seats
        side="left"
        members={members}
        myId="b"
        onPickAvatar={() => {}}
        onToggleReady={() => {}}
      />,
    );

    const seats = screen.getAllByRole("listitem");
    expect(seats[0]).toHaveTextContent("HOST");
  });

  it("puts the host only on the left side", () => {
    const members = [member("host", { isHost: true }), member("b"), member("c")];

    render(
      <Seats side="right" members={members} myId="b" onPickAvatar={() => {}} />,
    );

    expect(screen.queryByText(/HOST/)).not.toBeInTheDocument();
  });

  it("splits non-host players evenly between the two sides", () => {
    // Host + 4 others -> left gets host + 2, right gets 2.
    const members = [
      member("host", { isHost: true }),
      member("b"),
      member("c"),
      member("d"),
      member("e"),
    ];

    const { unmount } = render(
      <Seats side="left" members={members} myId="b" onPickAvatar={() => {}} />,
    );
    const leftCount = screen.getAllByRole("listitem").length;
    unmount();

    render(<Seats side="right" members={members} myId="b" onPickAvatar={() => {}} />);
    const rightCount = screen.getAllByRole("listitem").length;

    expect(leftCount).toBe(3);
    expect(rightCount).toBe(2);
  });

  it("puts a single guest on the right side", () => {
    const members = [member("host", { isHost: true }), member("b")];

    const { unmount } = render(
      <Seats side="left" members={members} myId="b" onPickAvatar={() => {}} />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    unmount();

    render(<Seats side="right" members={members} myId="b" onPickAvatar={() => {}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("marks the local player's seat", () => {
    const members = [member("host", { isHost: true }), member("b")];

    const { container } = render(
      <Seats side="right" members={members} myId="b" onPickAvatar={() => {}} />,
    );

    expect(container.querySelector(".seat-me")).toBeInTheDocument();
  });

  it("marks the ready seat", () => {
    const members = [member("host", { isHost: true }), member("b", { isReady: true })];

    const { container } = render(
      <Seats side="right" members={members} myId="b" onPickAvatar={() => {}} />,
    );

    expect(container.querySelector(".seat-ready")).toBeInTheDocument();
  });

  it("only lets the local player change their own avatar", async () => {
    const onPickAvatar = vi.fn();
    const members = [member("host", { isHost: true }), member("b")];

    render(
      <Seats side="right" members={members} myId="b" onPickAvatar={onPickAvatar} />,
    );

    const avatar = screen.getByRole("button", { name: "Đổi avatar của bạn" });
    await userEvent.click(avatar);

    expect(onPickAvatar).toHaveBeenCalledWith("b");
  });

  it("disables the avatar button for other players", () => {
    const members = [member("host", { isHost: true }), member("b")];

    render(
      <Seats side="right" members={members} myId="host" onPickAvatar={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Avatar của B" })).toBeDisabled();
  });

  it("shows the ready button only for the local non-host player", () => {
    const members = [member("host", { isHost: true }), member("b"), member("c")];

    const { unmount } = render(
      <Seats side="right" members={members} myId="b" onToggleReady={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Sẵn sàng" })).toBeInTheDocument();
    unmount();

    render(
      <Seats side="right" members={members} myId="host" onToggleReady={() => {}} />,
    );
    // The host never gets a ready button.
    expect(screen.queryByRole("button", { name: "Sẵn sàng" })).not.toBeInTheDocument();
  });

  it("toggles the ready state and reflects it in aria-pressed", async () => {
    const onToggleReady = vi.fn();
    const members = [member("host", { isHost: true }), member("b")];

    render(
      <Seats side="right" members={members} myId="b" onToggleReady={onToggleReady} />,
    );

    const btn = screen.getByRole("button", { name: "Sẵn sàng" });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(btn);

    expect(onToggleReady).toHaveBeenCalledWith("b");
  });

  it("shows 'Hủy sẵn sàng' for a player who is already ready", () => {
    const members = [member("host", { isHost: true }), member("b", { isReady: true })];

    render(
      <Seats side="right" members={members} myId="b" onToggleReady={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Hủy sẵn sàng" })).toBeInTheDocument();
  });

  it("renders no seats for an empty room", () => {
    render(<Seats side="left" members={[]} myId="me" onPickAvatar={() => {}} />);

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("handles a missing members prop", () => {
    render(<Seats side="left" myId="me" onPickAvatar={() => {}} />);

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});