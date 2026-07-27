/**
 * Arcana Card Asset Loader
 *
 * Priority: Cloudinary URL > Local SVG > Emoji fallback
 * Nếu ảnh chưa load xong → hiện shimmer placeholder
 * Nếu có cosmetic → thay bằng cosmetic art
 */

import cardSvg from '../assets/cards/default/cards/bomb-1.svg?raw';
import { CARD_EFFECTS, getCardUrl } from './cardCatalog';

const CARD_ASSET_BASE = 'frontend/src/assets/cards/default/cards';
const CLOUDINARY_CLOUD = 'dc433bff4';

/**
 * Asset cache — tránh re-fetch cùng 1 card
 */
const assetCache = new Map();

/**
 * Load 1 card image (SVG/PNG) từ source
 * @param {string} cardId  - VD: "bomb", "bomb-1", "defuse"
 * @param {string|null} cloudinaryUrl
 * @returns {Promise<string>} SVG string
 */
async function loadCardAsset(cardId, cloudinaryUrl = null) {
  const cacheKey = `svg:${cardId}`;

  if (assetCache.has(cacheKey)) {
    return assetCache.get(cacheKey);
  }

  let svgText = null;

  // 1. Cloudinary URL (ưu tiên cao nhất)
  if (cloudinaryUrl) {
    try {
      const res = await fetch(cloudinaryUrl);
      if (res.ok) {
        svgText = await res.text();
        assetCache.set(cacheKey, svgText);
        return svgText;
      }
    } catch (_) {
      // fall through
    }
  }

  // 2. Local SVG (dev mode)
  try {
    // cardId có thể là "bomb" hoặc "bomb-1"
    // Thử import local file
    const localPath = `/src/assets/cards/default/cards/${cardId}.svg`;
    const res = await fetch(localPath);
    if (res.ok) {
      svgText = await res.text();
      assetCache.set(cacheKey, svgText);
      return svgText;
    }
  } catch (_) {
    // fall through
  }

  // 3. Inline SVG fallback từ pre-built catalog
  // (nếu bundle có inline)
  return null;
}

/**
 * Render 1 card DOM element
 * @param {string} cardId  - VD: "bomb", "defuse-2"
 * @param {object} opts
 * @returns {HTMLElement}
 */
export function renderCard(cardId, opts = {}) {
  const {
    cosmetic = null,         // cosmetic override map
    size = 'normal',          // 'small' | 'normal' | 'large'
    interactive = true,       // có hover effect
    onClick = null,
    showLabel = true,
    showSubtitle = true,
    animation = null,         // animation name override
  } = opts;

  const cardDef = CARD_EFFECTS[cardId.replace(/-\d+$/, '')]; // strip "-1", "-2"
  if (!cardDef) {
    console.warn(`[CardAssetLoader] Unknown card: ${cardId}`);
  }

  const effect = cardDef?.onUse ?? cardDef?.onDraw;
  const animClass = animation ?? effect?.animation ?? '';

  const sizeMap = {
    small: { w: 60, h: 86 },
    normal: { w: 100, h: 143 },
    large: { w: 140, h: 200 },
  };
  const { w, h } = sizeMap[size] ?? sizeMap.normal;

  const el = document.createElement('div');
  el.className = [
    'arcana-card',
    `arcana-card--${size}`,
    `arcana-card--${cardDef?.rarity ?? 'common'}`,
    animClass,
    interactive ? 'arcana-card--interactive' : '',
  ].filter(Boolean).join(' ');

  el.dataset.cardId = cardId;
  el.style.cssText = `width:${w}px;height:${h}px;position:relative;display:inline-block;`;

  // Background
  const bgDiv = document.createElement('div');
  bgDiv.className = `arcana-card__bg arcana-card__bg--${cardDef?.id ?? 'default'} ${cardDef?.bgClass ?? ''}`;
  bgDiv.style.cssText = 'position:absolute;inset:0;border-radius:8px;overflow:hidden;';
  el.appendChild(bgDiv);

  // Content
  const content = document.createElement('div');
  content.className = 'arcana-card__content';
  content.style.cssText = 'position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:6px;gap:2px;';
  el.appendChild(content);

  // Label
  if (showLabel && cardDef) {
    const label = document.createElement('span');
    label.className = 'arcana-card__label';
    label.textContent = cardDef.label;
    label.style.cssText = 'font-family:monospace;font-weight:bold;font-size:11px;color:white;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
    content.appendChild(label);
  }

  // Subtitle
  if (showSubtitle && cardDef) {
    const sub = document.createElement('span');
    sub.className = 'arcana-card__subtitle';
    sub.textContent = cardDef.subtitle;
    sub.style.cssText = 'font-size:7px;color:rgba(255,255,255,0.75);text-align:center;line-height:1.2;';
    content.appendChild(sub);
  }

  // Emoji fallback (nếu chưa load được art)
  if (cardDef?.emoji) {
    const emoji = document.createElement('span');
    emoji.className = 'arcana-card__emoji';
    emoji.textContent = cardDef.emoji;
    emoji.style.cssText = 'font-size:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));';
    content.appendChild(emoji);
  }

  if (onClick && interactive) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => onClick(cardId, cardDef));
  }

  return el;
}

/**
 * Render toàn bộ hand (bài trên tay)
 * @param {string[]} cardIds
 * @param {object} opts
 * @returns {HTMLElement}
 */
export function renderHand(cardIds, opts = {}) {
  const container = document.createElement('div');
  container.className = 'arcana-hand';
  container.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:8px;';

  cardIds.forEach((id, idx) => {
    const cardEl = renderCard(id, { ...opts, size: opts.size ?? 'normal' });
    cardEl.style.transform = `rotate(${(idx - (cardIds.length - 1) / 2) * 2.5}deg)`;
    cardEl.style.transformOrigin = 'center bottom';
    cardEl.style.marginTop = `${Math.abs(idx - (cardIds.length - 1) / 2) * 6}px`;
    container.appendChild(cardEl);
  });

  return container;
}

/**
 * Trigger card animation (gọi sau khi action xảy ra)
 * @param {HTMLElement} cardEl
 * @param {string} animationName
 */
export function playCardAnimation(cardEl, animationName) {
  const animMap = {
    'shake-explode': 'arcana-anim-shake-explode',
    'shield-pulse': 'arcana-anim-shield-pulse',
    'fade-slide': 'arcana-anim-fade-slide',
    'flip-spin': 'arcana-anim-flip-spin',
    'heart-float': 'arcana-anim-heart-float',
    'claw-slash': 'arcana-anim-claw-slash',
    'stop-hand': 'arcana-anim-stop-hand',
    'crystal-glow': 'arcana-anim-crystal-glow',
    'combo-glow': 'arcana-anim-combo-glow',
  };

  const cssClass = animMap[animationName] ?? 'arcana-anim-default';
  cardEl.classList.add(cssClass);

  cardEl.addEventListener('animationend', () => {
    cardEl.classList.remove(cssClass);
  }, { once: true });
}

/**
 * Preload nhiều card cùng lúc
 * @param {string[]} cardIds
 */
export async function preloadCards(cardIds) {
  await Promise.allSettled(
    cardIds.map(async (id) => {
      const url = getCardUrl(id);
      if (url) {
        await loadCardAsset(id, url);
      }
    })
  );
}

/**
 * Hiện toast khi dùng lá bài
 * @param {string} message
 * @param {string} type  - 'info' | 'warning' | 'success' | 'danger'
 */
export function showCardToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `arcana-toast arcana-toast--${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;
    bottom:80px;
    left:50%;
    transform:translateX(-50%);
    background:rgba(0,0,0,0.85);
    color:white;
    padding:12px 24px;
    border-radius:8px;
    font-size:14px;
    font-weight:bold;
    z-index:9999;
    animation:arcana-toast-in 0.3s ease-out;
    border:1px solid rgba(255,255,255,0.1);
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
    text-align:center;
    max-width:320px;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'arcana-toast-out 0.3s ease-in forwards';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3000);
}
