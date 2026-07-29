// Auto-generated card metadata for Exploding Kittens.
//
// Cloudinary file names use suffixes like "-1" (e.g. "attack-1.svg") while
// the backend catalog emits short keys ("attack"). This module maps the
// short key → URL and exposes label/description so any component can render
// a card's face, tooltip, or action modal copy without re-deriving it.

const CARD_CLOUDINARY = {
  baseUrl: "https://res.cloudinary.com/ssoic87m/image/upload",
  cards: {
    "back":      "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/back_knmzmp.svg",
    "attack":    "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/attack-1_mmeqna.svg",
    "attack-1":  "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/attack-1_mmeqna.svg",
    "bomb":      "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/bomb-1_beeqmk.svg",
    "bomb-1":    "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/bomb-1_beeqmk.svg",
    "defuse":    "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/defuse-1_kezwhy.svg",
    "defuse-1":  "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/defuse-1_kezwhy.svg",
    "favor":     "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/favor-1_wuf8qh.svg",
    "favor-1":   "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/favor-1_wuf8qh.svg",
    "future":    "https://res.cloudinary.com/ssoic87m/image/upload/v1785156351/future-1_spt8eo.svg",
    "future-1":  "https://res.cloudinary.com/ssoic87m/image/upload/v1785156351/future-1_spt8eo.svg",
    "nope":      "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/nope-1_nestwa.svg",
    "nope-1":    "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/nope-1_nestwa.svg",
    "robot":     "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/robot_admqff.svg",
    "shuffle":   "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/shuffle-1_qhmijp.svg",
    "shuffle-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/shuffle-1_qhmijp.svg",
    "skip":      "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/skip-1_bdunf1.svg",
    "skip-1":    "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/skip-1_bdunf1.svg",
    "ninja":     "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/ninja_geqbzr.svg",
    "superman":  "https://res.cloudinary.com/ssoic87m/image/upload/v1785156354/superman_by7urw.svg",
    "zombie":    "https://res.cloudinary.com/ssoic87m/image/upload/v1785156354/zombie_zlgrvj.svg",
    "hải tặc":   "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/h%E1%BA%A3i_t%E1%BA%B7c_psrudy.svg",
    "hải-tặc":   "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/h%E1%BA%A3i_t%E1%BA%B7c_psrudy.svg",
  },
};

// Lookup used by every UI component. Falls back to the back-of-card art for
// unknown keys so we never render a broken image icon in production.
export function cardImageUrl(key) {
  if (!key) return CARD_CLOUDINARY.cards.back;
  return CARD_CLOUDINARY.cards[key] || CARD_CLOUDINARY.cards.back;
}

export const CARD_CARDS = CARD_CLOUDINARY.cards;
export { CARD_CLOUDINARY };
