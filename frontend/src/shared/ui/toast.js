// Toast notifications — stacked, dismissible, with enter/exit animations.
// Designed to match the welcome-panel aesthetic: deep purple/blue gradient,
// soft border, subtle backdrop blur, glowing accent by severity.
//
// Usage:
//   import { toast } from "../../shared/ui/toast.js";
//   toast.error("Máy chủ không phản hồi");
//   toast.success("Đã vào phòng!");
//   toast.info("Đang tải...");
//   toast.show("Hello", { tone: "info", duration: 3000 });
//
// Behavior:
//   - Stack vertically top-right with 12px gap.
//   - Auto-dismiss after `duration` ms (default 4500). Set 0 to disable.
//   - User can dismiss via the X button or by clicking the toast itself.
//   - Animations: slide-in-from-right + fade-out-down on exit.

const ICONS = {
  error: "⚠",
  success: "✓",
  info: "ℹ",
  warning: "!",
};

const DEFAULT_DURATION = 4500;

let container = null;
let counter = 0;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement("div");
  container.className = "arc-toast-container";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "Thông báo");
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
  return container;
}

function dismiss(el) {
  if (!el || el.dataset.dismissing === "1") return;
  el.dataset.dismissing = "1";
  el.classList.remove("arc-toast--enter");
  el.classList.add("arc-toast--exit");
  // Wait for exit animation to finish, then remove from DOM.
  const onEnd = () => {
    el.removeEventListener("animationend", onEnd);
    el.remove();
  };
  el.addEventListener("animationend", onEnd);
  // Safety: remove after 700ms even if animationend never fires.
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 700);
}

function show(message, options = {}) {
  const tone = options.tone ?? "info";
  const duration = options.duration ?? DEFAULT_DURATION;
  const title = options.title ?? null;

  const root = ensureContainer();
  const id = `arc-toast-${++counter}`;

  const el = document.createElement("div");
  el.className = `arc-toast arc-toast--${tone}`;
  el.id = id;
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  el.dataset.tone = tone;

  const icon = document.createElement("span");
  icon.className = "arc-toast__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = ICONS[tone] ?? ICONS.info;

  const body = document.createElement("div");
  body.className = "arc-toast__body";

  if (title) {
    const titleEl = document.createElement("div");
    titleEl.className = "arc-toast__title";
    titleEl.textContent = title;
    body.appendChild(titleEl);
  }

  const msgEl = document.createElement("div");
  msgEl.className = "arc-toast__message";
  msgEl.textContent = message;
  body.appendChild(msgEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "arc-toast__close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Đóng");
  closeBtn.innerHTML = "×";

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dismiss(el);
  });
  // Click anywhere on the toast body also dismisses (X is the obvious affordance,
  // but body click is the forgiving fallback).
  el.addEventListener("click", () => dismiss(el));

  el.appendChild(icon);
  el.appendChild(body);
  el.appendChild(closeBtn);

  // Trigger enter animation on next frame so the element is in the DOM
  // when the class is applied (otherwise the animation is skipped).
  root.appendChild(el);
  // Force reflow before adding the enter class.
  void el.offsetWidth;
  el.classList.add("arc-toast--enter");

  if (duration > 0) {
    setTimeout(() => dismiss(el), duration);
  }

  return { id, dismiss: () => dismiss(el) };
}

export const toast = {
  show,
  error: (msg, opts) => show(msg, { ...opts, tone: "error" }),
  success: (msg, opts) => show(msg, { ...opts, tone: "success" }),
  info: (msg, opts) => show(msg, { ...opts, tone: "info" }),
  warning: (msg, opts) => show(msg, { ...opts, tone: "warning" }),
  dismissAll: () => {
    if (!container) return;
    [...container.children].forEach((c) => dismiss(c));
  },
};
