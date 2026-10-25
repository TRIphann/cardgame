import { describe, it, expect } from "vitest";
import { getCardLabel, CARD_LABELS } from "@pages/game/cardLabels.js";
import { fxFor, CARD_FX } from "@pages/game/cardFx.js";

describe("cardLabels", () => {
  it("returns the label + description for a known card", () => {
    const entry = getCardLabel("attack");
    expect(entry.label).toBe("Tấn công");
    expect(entry.description.length).toBeGreaterThan(0);
  });

  it("falls back to the raw key for an unknown card", () => {
    const entry = getCardLabel("mystery-card");
    expect(entry.label).toBe("mystery-card");
    expect(entry.description).toBe("");
  });

  it("falls back to '?' for an empty key", () => {
    expect(getCardLabel("").label).toBe("?");
    expect(getCardLabel(null).label).toBe("?");
  });

  it("covers every card the backend can emit", () => {
    const backendKeys = [
      "bomb", "defuse", "attack", "skip", "favor", "future", "shuffle", "nope",
      "ninja", "superman", "zombie", "robot", "hải-tặc",
    ];
    for (const key of backendKeys) {
      const entry = getCardLabel(key);
      expect(entry, `no label for "${key}"`).toBeTruthy();
      expect(entry.label.length, `empty label for "${key}"`).toBeGreaterThan(0);
      expect(entry.description.length, `empty description for "${key}"`).toBeGreaterThan(0);
    }
  });

  it("resolves both spellings of the Vietnamese pirate card", () => {
    // The backend uses the hyphenated form, the UI sometimes uses the spaced one.
    expect(getCardLabel("hải-tặc").label).toBe("Hải tặc");
    expect(getCardLabel("hải tặc").label).toBe("Hải tặc");
  });

  it("gives every catalogue entry a non-empty label and description", () => {
    for (const [key, entry] of Object.entries(CARD_LABELS)) {
      expect(entry.label.length, `empty label for "${key}"`).toBeGreaterThan(0);
      expect(entry.description.length, `empty description for "${key}"`).toBeGreaterThan(0);
    }
  });
});

describe("cardFx", () => {
  it("returns the effect config for a known card", () => {
    const fx = fxFor("bomb");
    expect(fx).toBe(CARD_FX.bomb);
    expect(fx.glyph).toBe("💣");
  });

  it("falls back to the general effect for an unknown key", () => {
    expect(fxFor("not-a-real-card")).toBe(CARD_FX.general);
    expect(fxFor("")).toBe(CARD_FX.general);
    expect(fxFor(null)).toBe(CARD_FX.general);
  });

  it("defines a complete effect config for every card", () => {
    for (const [key, fx] of Object.entries(CARD_FX)) {
      expect(typeof fx.glyph, `fx "${key}" has no glyph`).toBe("string");
      expect(fx.glyph.length, `fx "${key}" has an empty glyph`).toBeGreaterThan(0);
      expect(fx.color, `fx "${key}" has no color`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(fx.accent, `fx "${key}" has no accent`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(typeof fx.particle, `fx "${key}" has no particle`).toBe("string");
      expect(typeof fx.count, `fx "${key}" has no count`).toBe("number");
      expect(fx.count, `fx "${key}" has a non-positive count`).toBeGreaterThan(0);
      expect(typeof fx.ring, `fx "${key}" has no ring flag`).toBe("boolean");
    }
  });

  it("defines an effect for every card that has a label", () => {
    const COMBO_KEYS = new Set(["ninja", "superman", "zombie", "robot", "hải-tặc"]);

    for (const key of Object.keys(CARD_LABELS)) {
      // "hải tặc" (spaced) is an alias of "hải-tặc" (hyphenated).
      const normalised = key.replace("hải tặc", "hải-tặc");
      // The combo variants are mapped to the shared "combo" effect inside
      // fxFor(), so assert through the accessor rather than the raw map.
      const fx = fxFor(normalised);
      expect(fx, `no fx for "${key}"`).toBeTruthy();
      expect(fx, `no fx for "${key}"`).toBe(
        COMBO_KEYS.has(normalised) ? CARD_FX.combo : CARD_FX[normalised],
      );
    }
  });

  it("maps every combo defuse variant to the shared combo effect", () => {
    for (const key of ["ninja", "superman", "zombie", "robot", "hải-tặc"]) {
      expect(fxFor(key)).toBe(CARD_FX.combo);
    }
  });

  it("keeps the plain action cards on their own effect", () => {
    for (const key of ["attack", "skip", "favor", "future", "shuffle", "nope", "bomb", "defuse"]) {
      expect(fxFor(key)).toBe(CARD_FX[key]);
    }
  });
});