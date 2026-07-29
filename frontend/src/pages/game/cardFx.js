// CardFX — particle/ring effects driven by từng loại card. Đây là central
// catalogue ánh xạ key → config (màu sắc, glyph, particle count, sound
// effect hint). Mọi animation component đều import từ đây để giữ được tính
// nhất quán giữa visual + gameplay.
//
// Effect catalogue:
//   attack:   ⚔ red swoosh + 8 sparkles + flash ring
//   skip:     ⤳ wave-out + 6 wind sparkles
//   favor:    ✋ hand reaching + 4 gold sparkles
//   future:   👁 eye-glow + 3 layered rings + dim
//   shuffle:  🌀 vortex + 12 orbiting mini-cards
//   nope:     ✕ cross-slash + 2 red rings
//   bomb:     💥 explosion + red shockwave + screen shake
//   defuse:   💚 green halo + safe-lock pulse
//   combo:    ✦ rainbow burst + 12 multi-color stars
//   5-any:    🌟 rainbow vortex
//   general:  sparkle ring (used for non-card draws, joins, etc.)

export const CARD_FX = {
  attack:   { glyph: "⚔", color: "#ff5247", accent: "#ff8a7a", particle: "✦", count: 10, ring: true },
  skip:     { glyph: "⤳", color: "#7adfff", accent: "#9af3ff", particle: "✧", count: 8,  ring: false },
  favor:    { glyph: "✋", color: "#ffd86b", accent: "#ffeaa3", particle: "★", count: 10, ring: true },
  future:   { glyph: "◉", color: "#9a78ff", accent: "#cdb9ff", particle: "✦", count: 6,  ring: true },
  shuffle:  { glyph: "🌀", color: "#5fdcb6", accent: "#a4f2dc", particle: "✧", count: 14, ring: true },
  nope:     { glyph: "✕", color: "#ff4d6d", accent: "#ff8aa3", particle: "✕", count: 6,  ring: true },
  bomb:     { glyph: "💣", color: "#ff3030", accent: "#ff7474", particle: "✦", count: 22, ring: true },
  defuse:   { glyph: "✚", color: "#5fe07e", accent: "#a4f4ba", particle: "✧", count: 12, ring: true },
  combo:    { glyph: "✦", color: "#ffd86b", accent: "#a4f2dc", particle: "★", count: 14, ring: true },
  "5-any":  { glyph: "🌟", color: "#9a78ff", accent: "#ffd86b", particle: "★", count: 16, ring: true },
  general:  { glyph: "✦", color: "#ffd86b", accent: "#a4f2dc", particle: "✧", count: 8,  ring: false },
  draw:     { glyph: "✧", color: "#9af3ff", accent: "#7adfff", particle: "✧", count: 10, ring: false },
  back:     { glyph: "✦", color: "#a98cff", accent: "#cdb9ff", particle: "✧", count: 6,  ring: false },
};

export function fxFor(key) {
  return CARD_FX[key] || CARD_FX.general;
}