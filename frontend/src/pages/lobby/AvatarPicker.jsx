// AvatarPicker — popover shown when the local player clicks their own avatar.
// Lets them choose an icon (emoji) and a background color. Selection is
// reported via onSelect(avatar) where avatar = { icon, color }.

import React, { useEffect, useRef, useState } from "react";

const ICONS = ["♟", "♛", "♜", "♞", "♝", "⚔", "🐱", "🐭", "🧙", "🦊", "🐺", "🦁", "🐲", "🌙", "☀", "✦", "✧", "♬", "♕", "♔", "👑", "🃏", "🎴"];

const COLORS = [
  "#7c5cff", // royal purple
  "#ff5d8f", // hot pink
  "#5ddc8f", // emerald
  "#ffb84a", // gold
  "#3399ff", // ocean blue
  "#ff6f3c", // ember orange
  "#a855f7", // amethyst
  "#f43f5e", // crimson
  "#14b8a6", // teal
  "#eab308", // sunshine
  "#0ea5e9", // sky
  "#ef4444", // ruby
];

export function AvatarPicker({ initial, onSelect, onClose }) {
  const [icon, setIcon] = useState(initial?.icon || "♟");
  const [color, setColor] = useState(initial?.color || COLORS[0]);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    function onEsc(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  return (
    <div className="avatar-picker" ref={ref} role="dialog" aria-label="Chọn avatar">
      <p className="avatar-picker__title">Chọn avatar của bạn</p>

      <div className="avatar-picker__preview">
        <span className="avatar-picker__icon" style={{ background: color }}>{icon}</span>
      </div>

      <div className="avatar-picker__section">
        <p className="avatar-picker__label">Biểu tượng</p>
        <div className="avatar-picker__icons">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              className={`avatar-picker__icon-btn ${i === icon ? "is-active" : ""}`}
              onClick={() => setIcon(i)}
              aria-pressed={i === icon}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="avatar-picker__section">
        <p className="avatar-picker__label">Màu nền</p>
        <div className="avatar-picker__colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`avatar-picker__color-btn ${c === color ? "is-active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Màu ${c}`}
              aria-pressed={c === color}
            />
          ))}
        </div>
      </div>

      <div className="avatar-picker__actions">
        <button type="button" className="avatar-picker__btn avatar-picker__btn--ghost" onClick={onClose}>Huỷ</button>
        <button
          type="button"
          className="avatar-picker__btn avatar-picker__btn--primary"
          onClick={() => onSelect?.({ icon, color })}
        >
          Lưu
        </button>
      </div>
    </div>
  );
}

export { COLORS as AVATAR_COLORS, ICONS as AVATAR_ICONS };