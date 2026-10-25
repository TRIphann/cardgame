import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseApiError } from "@shared/api/parseApiError.js";

// Regression tests for the production bugs seen on 25/10/2026
// (tricardgame.netlify.app landing page):
//   1. Backend ErrorResponse serializes PascalCase {Code, Message} but the
//      old parser only read lowercase body.code/body.message → every domain
//      error surfaced as the raw string "HTTP 400".
//   2. The Test Lobby button was visible on the production build.
//   3. index.html had an inline <script> that the Netlify CSP
//      (script-src 'self') blocked, filling the console with violations.

describe("parseApiError", () => {
  it("reads PascalCase ErrorResponse from ASP.NET (Code/Message)", () => {
    const { code, message } = parseApiError(
      { Code: "invalid_code", Message: "Mã phòng không tồn tại." },
      400,
    );
    expect(code).toBe("invalid_code");
    expect(message).toBe("Mã phòng không tồn tại.");
  });

  it("reads camelCase error bodies", () => {
    const { code, message } = parseApiError(
      { code: "room_full", message: "Phòng đã đủ người chơi." },
      409,
    );
    expect(code).toBe("room_full");
    expect(message).toBe("Phòng đã đủ người chơi.");
  });

  it("reads the { error } shape from the /api/test endpoints", () => {
    const { message } = parseApiError({ error: "Host name is required" }, 400);
    expect(message).toBe("Host name is required");
  });

  it("falls back to HTTP status when the body is empty", () => {
    const { code, message } = parseApiError(null, 400);
    expect(code).toBe("http_400");
    expect(message).toBe("HTTP 400");
  });

  it("never returns the raw 'HTTP 400' for a domain error body", () => {
    const { message } = parseApiError({ Code: "invalid_name", Message: "Tên không được để trống." }, 400);
    expect(message).not.toBe("HTTP 400");
  });
});

describe("landing page — prod hygiene", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const landingPath = path.join(repoRoot, "src", "pages", "landing", "LandingPage.jsx");
  const indexHtmlPath = path.join(repoRoot, "index.html");

  it("gates the Test Lobby button behind import.meta.env.DEV", () => {
    const src = fs.readFileSync(landingPath, "utf8");
    expect(src).toContain("Test Lobby");
    // The button must be conditional on DEV so production builds hide it.
    // The JSX block sits inside `import.meta.env.DEV && (...)` — assert the
    // two markers appear close together rather than regexing the whole file.
    const devIdx = src.indexOf("import.meta.env.DEV");
    const btnIdx = src.indexOf("test-lobby-button");
    expect(devIdx).toBeGreaterThanOrEqual(0);
    expect(btnIdx).toBeGreaterThanOrEqual(0);
    expect(Math.abs(btnIdx - devIdx)).toBeLessThan(400);
  });

  it("has no inline script tag that the CSP would block", () => {
    const html = fs.readFileSync(indexHtmlPath, "utf8");
    // Strip HTML comments first (docs may mention the word "script").
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
    // Only the module entry script is allowed; no inline script bodies.
    const inlineScripts = [...withoutComments.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    expect(inlineScripts).toEqual([]);
  });
});
