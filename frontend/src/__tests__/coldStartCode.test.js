import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regression tests for the 26/10/2026 prod incident
// (tricardgame.netlify.app): during a Render cold-start the UI
// optimistically navigated to /lobby with a RANDOM placeholder code,
// toasted "Đã tạo phòng XXXXXX", and let the player copy that fake code.
// Seconds later the real response landed and patched sessionStorage to the
// real code — but the toast/copy button still showed the fake one, and the
// console filled with CORS + polling noise.

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
