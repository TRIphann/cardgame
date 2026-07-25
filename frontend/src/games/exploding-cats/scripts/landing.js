// Landing hub — for now it routes Exploding Cats selection into a dedicated
// room-creation flow. Since the original createRoom/joinRoom flow existed,
// we keep its semantics: pick "Mèo Nổ" → prompt for name → create or join.
//
// For the multi-game pivot, we instead route to game-specific entry page.

import { t } from "../../../shared/i18n/i18n.js";

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

applyI18n();

const explodingCard = document.querySelector('[data-game="exploding-cats"]');
explodingCard?.addEventListener("click", () => {
  // In the next iteration this routes to a per-game lobby entry form.
  // For now we go straight into room creation using the legacy flow.
  window.location.href = "../exploding-cats/pages/room-entry/index.html";
});
