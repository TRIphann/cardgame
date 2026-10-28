import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regression tests for the 26/10/2026 + 28/10/2026 prod incidents
// (tricardgame.netlify.app):
//   26/10: during a Render cold-start the UI optimistically navigated to
//     /lobby with a RANDOM placeholder code, toasted "Đã tạo phòng XXXXXX",
//     and let the player copy that fake code. Seconds later the real response
//     landed and patched sessionStorage to the real code — but the toast/copy
//     button still showed the fake one, and the console filled with CORS +
//     polling noise.
//   28/10: lobby stuck on "••••••" with a DISABLED copy button forever, and
//     the eye-toggle showed nothing. Two root causes:
//     (a) the failure rollback routed through the landing onNavigate handler,
//         which navigates to /lobby unconditionally → dead /lobby, no way out;
//     (b) concurrent PENDING writes could clobber the REAL session patch
//         (no serialisation). Fixed with the session patch queue in
//         config/env.js + the background retry queue in useOptimisticRoom.js,
//         and the rollback now uses the router directly.

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

describe("cold-start room code — no fake placeholder", () => {
  it("useOptimisticRoom never invents a random code", () => {
    const src = read("src/hooks/useOptimisticRoom.js");
    expect(src).not.toMatch(/placeholderCode/);
    expect(src).not.toMatch(/PLACEHOLDER_CHARS/);
    // The optimistic room must carry an empty code + an explicit flag so
    // the lobby/toast can render a "warming up" state instead of a code.
    expect(src).toContain('code: ""');
    expect(src).toContain("optimistic: true");
  });

  it("landing toasts stay silent until the real code arrives", () => {
    const src = read("src/pages/landing/LandingPage.jsx");
    // No toast may interpolate room.code unconditionally anymore.
    expect(src).not.toMatch(/Đã tạo phòng \$\{room/);
    expect(src).not.toMatch(/Đã vào phòng \$\{room/);
    expect(src).toContain("Đang khởi tạo phòng");
  });

  it("lobby copy button only copies a validated 6-char code", () => {
    const src = read("src/pages/lobby/LobbyPage.jsx");
    expect(src).toContain("/^[A-Z0-9]{6}$/");
    // The old one-liner `room?.code || session?.roomCode` is gone.
    expect(src).not.toMatch(/const code = room\?\.code \|\| session\?\.roomCode/);
  });

  it("lobby offline/prune guard reads the flattened session shape", () => {
    const src = read("src/pages/lobby/LobbyPage.jsx");
    expect(src).not.toContain("session?.session?.playerId");
  });

  it("rollback goes straight to landing via the router (28/10 dead-lobby fix)", () => {
    const src = read("src/hooks/useOptimisticRoom.js");
    // The rollback callback must call navigate(ROUTES.landing) directly —
    // never onNavigate(ROUTES.landing), which the landing handlers treat
    // as a room object and bounce back to /lobby.
    expect(src).toContain("navigate(ROUTES.landing");
    expect(src).not.toMatch(/onNavigate\s*\(\s*ROUTES\.landing/);
  });

  it("session writes go through the FIFO patch queue (28/10 clobber fix)", () => {
    const hookSrc = read("src/hooks/useOptimisticRoom.js");
    const envSrc = read("src/config/env.js");
    // The hook must queue patches, not bare-save them, so a double-click
    // PENDING write can never overwrite the REAL room patch.
    expect(hookSrc).toContain("queueSessionPatch");
    expect(envSrc).toContain("sessionPatchQueue");
    expect(envSrc).toContain("queueSessionPatch");
  });

  it("background POST retries with backoff before rolling back", () => {
    const src = read("src/hooks/useOptimisticRoom.js");
    expect(src).toContain("enqueueBackgroundRetry");
    expect(src).toContain("RETRY_MAX_ATTEMPTS");
    expect(src).toContain("RETRY_BASE_DELAY_MS");
  });

  it("REAL room patch re-announces the code when already on /lobby", () => {
    const src = read("src/pages/landing/LandingPage.jsx");
    // The background POST resolves while the lobby is already mounted —
    // the handler must toast the real code instead of navigating again.
    expect(src).toContain("Phòng đã sẵn sàng");
  });
});

describe("game page initial snapshot — StrictMode double-invoke fix", () => {
  // Regression: the game page mounted and stayed on "Đang tải ván chơi…"
  // forever ("Mất kết nối với máy chủ."). Root cause: the initial-snapshot
  // effect used a boolean "already fetched" ref. React StrictMode
  // double-invokes effects (mount → cleanup → mount), so the FIRST
  // invocation set the flag and the SECOND (the one that actually renders)
  // bailed out early — the snapshot was never applied and `room` stayed
  // null for the whole session.
  //
  // The fix: let every mount attempt fetch and let the LAST one win. The
  // per-attempt `cancelled` flag discards the stale StrictMode result.

  it("does not gate the initial fetch behind a boolean ref check", () => {
    const src = read("src/pages/game/GamePage.jsx");
    // The bail-out must NOT depend on a boolean flag that StrictMode
    // already tripped during the discarded first invocation.
    expect(src).not.toMatch(/initialFetchDoneRef\.current\)\s*return/);
    expect(src).not.toMatch(/!initialFetchDoneRef\.current/);
  });

  it("still cancels the stale StrictMode attempt so the last one wins", () => {
    const src = read("src/pages/game/GamePage.jsx");
    expect(src).toContain("if (cancelled) return;");
    expect(src).toContain("cancelled = true;");
  });

  it("applies the snapshot to room when members are present", () => {
    const src = read("src/pages/game/GamePage.jsx");
    expect(src).toContain("if (data && data.members)");
    expect(src).toContain("setRoom(data)");
  });
});

describe("console hygiene — cold-start must stay quiet", () => {
  // Allowed: real error surfaces (boot, ErrorBoundary, audio ctx, out-of-tree
  // toast guard). Everything else — per-request/per-render logs — is banned
  // because it buries the real CORS/snapshot errors players report.
  const ALLOWLIST = [
    "app/boot.js",
    "app/ErrorBoundary.jsx",
    "shared/audio/AudioManager.jsx",
    "shared/ui/toast.jsx",
    "pages/landing/index.html",
  ];

  const offenders = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "test") continue; // Test Lobby page is dev-only
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx)$/.test(ent.name)) continue;
      const rel = path.relative(path.join(repoRoot, "src"), full).replace(/\\/g, "/");
      if (ALLOWLIST.some((a) => rel.endsWith(a))) continue;
      const src = fs.readFileSync(full, "utf8");
      const hits = [...src.matchAll(/console\.(log|debug|info|table|group)\s*\(/g)];
      if (hits.length) offenders.push(`${rel}: ${hits.length} call(s)`);
    }
  };
  walk(path.join(repoRoot, "src"));

  it("has no console.log/debug/info in shipped source", () => {
    expect(offenders).toEqual([]);
  });

  it("sends no custom header on bodyless GETs (avoids CORS preflight spam)", () => {
    const src = read("src/shared/api/roomsApi.js");
    expect(src).toContain("options.body ?");
    expect(src).not.toContain("X-Requested-With");
  });
});
