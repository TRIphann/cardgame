import { describe, it, expect } from "vitest";
import { cardImageUrl, CARD_CARDS, CARD_CLOUDINARY } from "@games/exploding-cats/cardCloudinary.js";

describe("cardCloudinary", () => {
  describe("cardImageUrl", () => {
    it("returns the mapped URL for a known short key", () => {
      const url = cardImageUrl("attack");
      expect(url).toBe(CARD_CARDS["attack"]);
      expect(url).toContain("res.cloudinary.com");
    });

    it("returns the mapped URL for a known suffixed key", () => {
      expect(cardImageUrl("attack-1")).toBe(CARD_CARDS["attack-1"]);
    });

    it("falls back to the back-of-card art for an unknown key", () => {
      expect(cardImageUrl("not-a-real-card")).toBe(CARD_CARDS.back);
    });

    it("falls back to the back-of-card art for an empty key", () => {
      expect(cardImageUrl("")).toBe(CARD_CARDS.back);
    });

    it("falls back to the back-of-card art for a null key", () => {
      expect(cardImageUrl(null)).toBe(CARD_CARDS.back);
    });

    it("falls back to the back-of-card art for an undefined key", () => {
      expect(cardImageUrl(undefined)).toBe(CARD_CARDS.back);
    });

    it("never throws for any input", () => {
      const inputs = [null, undefined, "", 0, 123, {}, [], "attack", "nope"];
      for (const input of inputs) {
        expect(() => cardImageUrl(input)).not.toThrow();
      }
    });
  });

  describe("catalogue integrity", () => {
    it("exposes a back-of-card fallback", () => {
      expect(CARD_CARDS.back).toBeTruthy();
      expect(typeof CARD_CARDS.back).toBe("string");
    });

    it("maps every card to an https Cloudinary URL", () => {
      for (const [key, url] of Object.entries(CARD_CARDS)) {
        expect(url, `card "${key}" has no URL`).toBeTruthy();
        expect(url, `card "${key}" is not an https URL`).toMatch(/^https:\/\//);
      }
    });

    it("covers every card the backend can emit", () => {
      // These are the CardCatalog keys the backend sends over the wire.
      const backendKeys = [
        "bomb", "defuse", "attack", "skip", "favor", "future", "shuffle", "nope",
        "ninja", "superman", "zombie", "robot", "hải-tặc",
      ];
      for (const key of backendKeys) {
        expect(CARD_CARDS[key], `no image registered for "${key}"`).toBeTruthy();
      }
    });

    it("registers a short alias for every suffixed card", () => {
      // The backend emits short keys ("attack") while the uploaded files are
      // suffixed ("attack-1"). Both must resolve to the same URL.
      const suffixed = Object.keys(CARD_CARDS).filter((k) => /-\d+$/.test(k));
      expect(suffixed.length).toBeGreaterThan(0);
      for (const key of suffixed) {
        const short = key.replace(/-\d+$/, "");
        expect(CARD_CARDS[short], `no alias for "${key}"`).toBe(CARD_CARDS[key]);
      }
    });

    it("exposes the Cloudinary base URL", () => {
      expect(CARD_CLOUDINARY.baseUrl).toMatch(/^https:\/\/res\.cloudinary\.com/);
    });

    it("exposes CARD_CARDS as the same map as CARD_CLOUDINARY.cards", () => {
      expect(CARD_CARDS).toBe(CARD_CLOUDINARY.cards);
    });
  });
});