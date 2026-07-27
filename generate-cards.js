/**
 * Arcana Card SVG Generator v8 — Reference image icons
 *
 * v8 changes (per user reference images):
 * - DEFUSE: Băng urgo + bông y tế chéo (hình 1)
 * - ATTACK: 2 thanh kiếm chéo nhau (hình 2)
 * - NOPE: STOP sign đỏ + chữ STOP trắng (hình 3)
 * - SKIP: 2 mũi tên tam giác chubby (hình 4)
 */

const fs = require('fs');
const path = require('path');

const BASE = 'd:/gmae/frontend/src/assets/cards/default/cards';
const W = 140, H = 200;

function cardShell({ id, bg1, bg2, accent, label, sub, icon }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg_${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient>
  <linearGradient id="ov_${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="black" stop-opacity="0"/><stop offset="100%" stop-color="black" stop-opacity="0.42"/></linearGradient>
  <filter id="sd_${id}"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="black" flood-opacity="0.6"/></filter>
</defs>
<g filter="url(#sd_${id})"><rect width="${W}" height="${H}" rx="14" fill="url(#bg_${id})"/></g>
<rect x="1.5" y="1.5" width="${W-3}" height="${H-3}" rx="13" fill="none" stroke="white" stroke-width="0.8" opacity="0.13"/>
<rect x="0" y="0" width="${W}" height="3" rx="3" fill="${accent}" opacity="0.65"/>
<rect x="0" y="146" width="${W}" height="${H-146}" fill="url(#ov_${id})"/>
<g transform="translate(0,4)" opacity="0.97">${icon}</g>
<text x="${Math.floor(W/2)}" y="${H-26}" text-anchor="middle" font-family="'Arial Black','Segoe UI Black',sans-serif" font-size="13" font-weight="900" fill="white" letter-spacing="1.5">${label}</text>
<text x="${Math.floor(W/2)}" y="${H-11}" text-anchor="middle" font-family="'Segoe UI',sans-serif" font-size="6.5" fill="rgba(255,255,255,0.62)">${sub}</text>
</svg>`;
}

// ─────────────────────────────────────────────────────────────
//  BOM — BIG explosion effect (cloud + spikes + flame core)
// ─────────────────────────────────────────────────────────────
const ICON_BOM = `
<g transform="translate(2,-2)">
  <g stroke="#ff6600" stroke-linecap="round" fill="none">
    <line x1="68" y1="2" x2="68" y2="22" stroke-width="3.5" opacity="0.85"/>
    <line x1="40" y1="8" x2="48" y2="26" stroke-width="3" opacity="0.75"/>
    <line x1="96" y1="8" x2="88" y2="26" stroke-width="3" opacity="0.75"/>
    <line x1="14" y1="32" x2="32" y2="42" stroke-width="2.5" opacity="0.65"/>
    <line x1="122" y1="32" x2="104" y2="42" stroke-width="2.5" opacity="0.65"/>
    <line x1="2" y1="60" x2="22" y2="62" stroke-width="2.5" opacity="0.6"/>
    <line x1="134" y1="60" x2="114" y2="62" stroke-width="2.5" opacity="0.6"/>
    <line x1="6" y1="88" x2="24" y2="84" stroke-width="2" opacity="0.5"/>
    <line x1="130" y1="88" x2="112" y2="84" stroke-width="2" opacity="0.5"/>
    <line x1="16" y1="114" x2="34" y2="108" stroke-width="2" opacity="0.45"/>
    <line x1="120" y1="114" x2="102" y2="108" stroke-width="2" opacity="0.45"/>
    <line x1="68" y1="138" x2="68" y2="124" stroke-width="3" opacity="0.55"/>
  </g>
  <ellipse cx="34" cy="86" rx="20" ry="18" fill="#3a1a05"/>
  <ellipse cx="104" cy="86" rx="22" ry="20" fill="#4a220a"/>
  <ellipse cx="68" cy="116" rx="26" ry="16" fill="#5a2a08"/>
  <ellipse cx="50" cy="108" rx="18" ry="14" fill="#3a1a05"/>
  <ellipse cx="86" cy="110" rx="18" ry="14" fill="#3a1a05"/>
  <circle cx="68" cy="68" r="38" fill="#ff4400"/>
  <circle cx="40" cy="74" r="22" fill="#ff5500"/>
  <circle cx="96" cy="74" r="24" fill="#ff5500"/>
  <circle cx="68" cy="98" r="28" fill="#ee3300"/>
  <circle cx="68" cy="68" r="26" fill="#ffaa22"/>
  <circle cx="58" cy="64" r="14" fill="#ffdd44"/>
  <circle cx="80" cy="72" r="12" fill="#ff6600"/>
  <circle cx="68" cy="68" r="14" fill="#fff066"/>
  <circle cx="68" cy="68" r="7" fill="#ffffff" opacity="0.9"/>
  <ellipse cx="56" cy="50" rx="8" ry="5" fill="#fff" opacity="0.4"/>
  <ellipse cx="84" cy="60" rx="6" ry="4" fill="#fff" opacity="0.3"/>
  <circle cx="32" cy="44" r="1.8" fill="#222" opacity="0.7"/>
  <circle cx="106" cy="40" r="2" fill="#222" opacity="0.7"/>
  <circle cx="22" cy="56" r="1.5" fill="#222" opacity="0.6"/>
  <circle cx="118" cy="58" r="1.5" fill="#222" opacity="0.6"/>
  <circle cx="44" cy="24" r="1.2" fill="#ffdd44" opacity="0.8"/>
  <circle cx="94" cy="22" r="1.2" fill="#ffdd44" opacity="0.8"/>
  <circle cx="76" cy="14" r="1" fill="#fff" opacity="0.7"/>
  <circle cx="62" cy="20" r="1" fill="#fff" opacity="0.6"/>
</g>`;

// ─────────────────────────────────────────────────────────────
//  CỨU — Hình 1: Băng urgo + bông y tế chéo
// ─────────────────────────────────────────────────────────────
const ICON_DEFUSE = `
<g transform="translate(0,4)">
  <ellipse cx="70" cy="118" rx="36" ry="5" fill="#00ff44" opacity="0.18"/>

  <!-- Bandage 1: top-left to bottom-right -->
  <g transform="translate(70,84) rotate(45)">
    <rect x="-34" y="-11" width="68" height="22" rx="8" fill="#1a5a1a" opacity="0.22"/>
    <rect x="-32" y="-9" width="64" height="18" rx="7" fill="#f5f0e8" stroke="#ccc5b5" stroke-width="1"/>
    <line x1="-24" y1="-9" x2="-24" y2="9" stroke="#e0dbd0" stroke-width="0.9" opacity="0.7"/>
    <line x1="-14" y1="-9" x2="-14" y2="9" stroke="#e0dbd0" stroke-width="0.9" opacity="0.7"/>
    <line x1="-4" y1="-9" x2="-4" y2="9" stroke="#e0dbd0" stroke-width="0.9" opacity="0.7"/>
    <line x1="6" y1="-9" x2="6" y2="9" stroke="#e0dbd0" stroke-width="0.9" opacity="0.7"/>
    <line x1="16" y1="-9" x2="16" y2="9" stroke="#e0dbd0" stroke-width="0.9" opacity="0.7"/>
    <line x1="26" y1="-9" x2="26" y2="9" stroke="#e0dbd0" stroke-width="0.9" opacity="0.7"/>
    <line x1="-26" y1="0" x2="26" y2="0" stroke="#c0b8a8" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.55"/>
    <rect x="-11" y="-7" width="22" height="14" rx="3.5" fill="#e8e0d0" stroke="#b8b0a0" stroke-width="0.8"/>
    <rect x="-8" y="-5" width="16" height="10" rx="2" fill="#ddd5c5" opacity="0.8"/>
  </g>

  <!-- Bandage 2: bottom-left to top-right -->
  <g transform="translate(70,84) rotate(-45)">
    <rect x="-34" y="-11" width="68" height="22" rx="8" fill="#f0ebe3" stroke="#c8c0b0" stroke-width="1"/>
    <line x1="-24" y1="-9" x2="-24" y2="9" stroke="#d8d0c0" stroke-width="0.9" opacity="0.6"/>
    <line x1="-14" y1="-9" x2="-14" y2="9" stroke="#d8d0c0" stroke-width="0.9" opacity="0.6"/>
    <line x1="-4" y1="-9" x2="-4" y2="9" stroke="#d8d0c0" stroke-width="0.9" opacity="0.6"/>
    <line x1="6" y1="-9" x2="6" y2="9" stroke="#d8d0c0" stroke-width="0.9" opacity="0.6"/>
    <line x1="16" y1="-9" x2="16" y2="9" stroke="#d8d0c0" stroke-width="0.9" opacity="0.6"/>
    <line x1="26" y1="-9" x2="26" y2="9" stroke="#d8d0c0" stroke-width="0.9" opacity="0.6"/>
    <line x1="-26" y1="0" x2="26" y2="0" stroke="#b0a898" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.5"/>
    <rect x="-11" y="-7" width="22" height="14" rx="3.5" fill="#ddd5c0" stroke="#b0a898" stroke-width="0.8"/>
    <rect x="-8" y="-5" width="16" height="10" rx="2" fill="#ccc4b4" opacity="0.7"/>
  </g>

  <!-- Cotton ball on top (fluffy) -->
  <g transform="translate(70,72)">
    <circle cx="0" cy="0" r="14" fill="#f8f5f0"/>
    <circle cx="-7" cy="-8" r="8" fill="#faf7f2"/>
    <circle cx="7" cy="-7" r="7.5" fill="#faf7f2"/>
    <circle cx="-10" cy="4" r="7" fill="#f8f5f0"/>
    <circle cx="8" cy="5" r="7" fill="#f8f5f0"/>
    <circle cx="0" cy="0" r="7" fill="#f0ece5"/>
    <!-- Red cross on cotton -->
    <rect x="-6" y="-1.8" width="12" height="3.6" rx="1.5" fill="#dd4444"/>
    <rect x="-1.8" y="-6" width="3.6" height="12" rx="1.5" fill="#dd4444"/>
    <circle cx="-4" cy="-5" r="1" fill="#e0d8d0" opacity="0.7"/>
    <circle cx="5" cy="3" r="1" fill="#e0d8d0" opacity="0.7"/>
    <circle cx="-8" cy="0" r="0.9" fill="#e0d8d0" opacity="0.6"/>
  </g>

  <!-- Red border ring -->
  <circle cx="70" cy="84" r="44" fill="none" stroke="#cc3333" stroke-width="2.5" opacity="0.45"/>
  <circle cx="70" cy="84" r="40" fill="none" stroke="#ee4444" stroke-width="1.2" opacity="0.28"/>

  <!-- Sparkles -->
  <circle cx="30" cy="58" r="2" fill="#88ffaa" opacity="0.7"/>
  <circle cx="110" cy="62" r="2" fill="#88ffaa" opacity="0.7"/>
  <circle cx="24" cy="110" r="1.5" fill="#88ffaa" opacity="0.5"/>
  <circle cx="116" cy="106" r="1.5" fill="#88ffaa" opacity="0.5"/>
  <circle cx="70" cy="24" r="1.5" fill="#ffffff" opacity="0.5"/>
</g>`;

// ─────────────────────────────────────────────────────────────
//  BỐC ĐI — Hình 2: 2 thanh kiếm chéo nhau
// ─────────────────────────────────────────────────────────────
const ICON_ATTACK = `
<g transform="translate(0,2)">
  <ellipse cx="70" cy="78" rx="56" ry="48" fill="#cc0000" opacity="0.06"/>

  <!-- Sword 1: top-left to bottom-right -->
  <g transform="translate(70,78) rotate(45)">
    <!-- Blade: curved taper from wide base (-38) to sharp point (-56) -->
    <path d="M0 -56 Q6 -52 6 -38 L5 -14 L-5 -14 L-6 -38 Q-6 -52 0 -56 Z" fill="#d0d5e0" stroke="#a0a8b8" stroke-width="1.2"/>
    <!-- Blade shine (right half) -->
    <path d="M0 -56 Q6 -52 6 -38 L5 -14 L0 -14 Z" fill="white" opacity="0.38"/>
    <!-- Fuller groove -->
    <line x1="0" y1="-50" x2="0" y2="-20" stroke="#b0b8c8" stroke-width="1.5" opacity="0.5"/>
    <!-- Cross-guard -->
    <rect x="-15" y="-14" width="30" height="7" rx="2" fill="#c8a060" stroke="#8a6030" stroke-width="1"/>
    <rect x="-12" y="-13" width="24" height="2" rx="1" fill="#e0b870" opacity="0.5"/>
    <!-- Grip -->
    <rect x="-5" y="-7" width="10" height="24" rx="2" fill="#5a3818" stroke="#3a2010" stroke-width="1"/>
    <line x1="-5" y1="-3" x2="5" y2="-3" stroke="#7a5030" stroke-width="1" opacity="0.7"/>
    <line x1="-5" y1="3" x2="5" y2="3" stroke="#7a5030" stroke-width="1" opacity="0.7"/>
    <line x1="-5" y1="9" x2="5" y2="9" stroke="#7a5030" stroke-width="1" opacity="0.7"/>
    <!-- Pommel -->
    <circle cx="0" cy="18" r="7" fill="#c8a060" stroke="#8a6030" stroke-width="1.2"/>
    <circle cx="0" cy="18" r="3.5" fill="#e0b870" opacity="0.6"/>
  </g>

  <!-- Sword 2: bottom-left to top-right -->
  <g transform="translate(70,78) rotate(-45)">
    <!-- Blade: curved taper -->
    <path d="M0 -56 Q6 -52 6 -38 L5 -14 L-5 -14 L-6 -38 Q-6 -52 0 -56 Z" fill="#d8dde8" stroke="#a8b0c0" stroke-width="1.2"/>
    <!-- Blade shine -->
    <path d="M0 -56 Q6 -52 6 -38 L5 -14 L0 -14 Z" fill="white" opacity="0.32"/>
    <line x1="0" y1="-50" x2="0" y2="-20" stroke="#b8c0cc" stroke-width="1.5" opacity="0.45"/>
    <rect x="-15" y="-14" width="30" height="7" rx="2" fill="#d0aa68" stroke="#906030" stroke-width="1"/>
    <rect x="-12" y="-13" width="24" height="2" rx="1" fill="#e8c078" opacity="0.45"/>
    <rect x="-5" y="-7" width="10" height="24" rx="2" fill="#603818" stroke="#402010" stroke-width="1"/>
    <line x1="-5" y1="-3" x2="5" y2="-3" stroke="#805838" stroke-width="1" opacity="0.65"/>
    <line x1="-5" y1="3" x2="5" y2="3" stroke="#805838" stroke-width="1" opacity="0.65"/>
    <line x1="-5" y1="9" x2="5" y2="9" stroke="#805838" stroke-width="1" opacity="0.65"/>
    <circle cx="0" cy="18" r="7" fill="#d0aa68" stroke="#906030" stroke-width="1.2"/>
    <circle cx="0" cy="18" r="3.5" fill="#e8c078" opacity="0.55"/>
  </g>

  <!-- Center clash -->
  <circle cx="70" cy="76" r="10" fill="#ffcc44" opacity="0.5"/>
  <circle cx="70" cy="76" r="6" fill="#ffee88" opacity="0.8"/>
  <circle cx="70" cy="76" r="3" fill="white"/>

  <!-- Sparks -->
  <line x1="58" y1="64" x2="50" y2="56" stroke="#ffdd44" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
  <line x1="82" y1="64" x2="90" y2="56" stroke="#ffdd44" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
  <line x1="58" y1="88" x2="50" y2="96" stroke="#ffdd44" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
  <line x1="82" y1="88" x2="90" y2="96" stroke="#ffdd44" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
  <line x1="48" y1="76" x2="36" y2="76" stroke="#ffdd44" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <line x1="92" y1="76" x2="104" y2="76" stroke="#ffdd44" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
</g>`;

// ─────────────────────────────────────────────────────────────
//  AI CHO — Hình 3: STOP sign đỏ với chữ STOP trắng
// ─────────────────────────────────────────────────────────────
const ICON_NOPE = `
<g transform="translate(0,0)">
  <circle cx="70" cy="78" r="56" fill="#ff4400" opacity="0.06"/>

  <!-- Outer shadow ring -->
  <polygon points="38,24 102,24 120,42 120,114 102,132 38,132 20,114 20,42"
    fill="#880000" opacity="0.38"/>

  <!-- Main octagon -->
  <polygon points="36,24 104,24 122,42 122,114 104,132 36,132 18,114 18,42"
    fill="#cc1111" stroke="#ee2222" stroke-width="2.5"/>

  <!-- Inner face -->
  <polygon points="42,34 98,34 114,50 114,106 98,122 42,122 26,106 26,50"
    fill="#dd2222"/>

  <!-- White border ring -->
  <polygon points="46,40 94,40 108,54 108,100 94,114 46,114 32,100 32,54"
    fill="none" stroke="white" stroke-width="3"/>

  <!-- Inner clean face -->
  <polygon points="48,44 92,44 104,56 104,98 92,110 48,110 36,98 36,56"
    fill="#cc1111"/>

  <!-- STOP text — bold, clean -->
  <text x="70" y="86"
    text-anchor="middle"
    font-family="'Arial Black','Impact','Segoe UI Black',sans-serif"
    font-size="24"
    font-weight="900"
    fill="white"
    letter-spacing="1.5"
    style="font-stretch:condensed;">STOP</text>

  <!-- Shadow on STOP text -->
  <text x="70" y="86"
    text-anchor="middle"
    font-family="'Arial Black','Impact','Segoe UI Black',sans-serif"
    font-size="24"
    font-weight="900"
    fill="none"
    stroke="#880000"
    stroke-width="1"
    letter-spacing="1.5"
    style="font-stretch:condensed;"
    opacity="0.4">STOP</text>

  <!-- Corner dots -->
  <circle cx="36" cy="24" r="3" fill="white" opacity="0.5"/>
  <circle cx="104" cy="24" r="3" fill="white" opacity="0.5"/>
  <circle cx="36" cy="132" r="3" fill="white" opacity="0.5"/>
  <circle cx="104" cy="132" r="3" fill="white" opacity="0.5"/>

  <!-- Shine -->
  <line x1="36" y1="24" x2="58" y2="24" stroke="white" stroke-width="3" opacity="0.22" stroke-linecap="round"/>
  <line x1="36" y1="24" x2="36" y2="44" stroke="white" stroke-width="3" opacity="0.18" stroke-linecap="round"/>
</g>`;

// ─────────────────────────────────────────────────────────────
//  SKIP — Hình 4: 2 mũi tên tam giác lớn, cân đối
//  Mỗi mũi tên: đuôi hình chữ nhật + đầu tam giác (shape rõ ràng)
// ─────────────────────────────────────────────────────────────
const ICON_SKIP = `
<g transform="translate(0,4)">
  <!-- Background glow -->
  <ellipse cx="70" cy="78" rx="60" ry="50" fill="#3399ff" opacity="0.07"/>

  <!-- ══ Arrow 1 (left) ══ -->
  <!-- Outer arrow shape -->
  <polygon points="
    5,20
    52,20
    66,52
    52,84
    5,84
    19,52
  " fill="#3399ff" stroke="#2266cc" stroke-width="1.5"/>

  <!-- Arrow 1: highlight (left edge shine) -->
  <polygon points="
    5,20
    52,20
    66,52
    52,57
    10,57
    10,47
    52,47
    66,52
  " fill="white" opacity="0.18"/>

  <!-- Arrow 1: inner cutout (creates the hollow look) -->
  <polygon points="
    12,32
    46,32
    57,52
    46,72
    12,72
    23,52
  " fill="#0a1a33"/>

  <!-- Arrow 1: thin white accent line inside -->
  <polygon points="
    16,37
    42,37
    52,52
    42,67
    16,67
    26,52
  " fill="none" stroke="#88ccff" stroke-width="1.2" opacity="0.5"/>

  <!-- Arrow 1: bottom shadow edge -->
  <polygon points="
    12,67
    46,67
    57,52
    52,84
    5,84
    19,52
  " fill="#2266cc" opacity="0.25"/>

  <!-- ══ Arrow 2 (right) ══ -->
  <polygon points="
    74,20
    121,20
    135,52
    121,84
    74,84
    88,52
  " fill="#3399ff" stroke="#2266cc" stroke-width="1.5"/>

  <!-- Arrow 2: highlight -->
  <polygon points="
    74,20
    121,20
    135,52
    121,57
    79,57
    79,47
    121,47
    135,52
  " fill="white" opacity="0.18"/>

  <!-- Arrow 2: inner cutout -->
  <polygon points="
    81,32
    115,32
    126,52
    115,72
    81,72
    92,52
  " fill="#0a1a33"/>

  <!-- Arrow 2: thin white accent -->
  <polygon points="
    85,37
    111,37
    121,52
    111,67
    85,67
    95,52
  " fill="none" stroke="#88ccff" stroke-width="1.2" opacity="0.5"/>

  <!-- Arrow 2: bottom shadow -->
  <polygon points="
    81,67
    115,67
    126,52
    121,84
    74,84
    88,52
  " fill="#2266cc" opacity="0.25"/>

  <!-- Motion lines between arrows (subtle) -->
  <line x1="70" y1="46" x2="74" y2="46" stroke="#88bbff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <line x1="69" y1="52" x2="74" y2="52" stroke="#88bbff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <line x1="70" y1="58" x2="74" y2="58" stroke="#88bbff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>

  <!-- Arrow tips sparkle -->
  <circle cx="66" cy="52" r="2" fill="white" opacity="0.35"/>
  <circle cx="135" cy="52" r="2" fill="white" opacity="0.35"/>
</g>`;

// ─────────────────────────────────────────────────────────────
//  SHUFFLE — 2 mũi tên cong đối xứng, cân đối
// ─────────────────────────────────────────────────────────────
const ICON_SHUFFLE = `
<g transform="translate(0,0)">
  <!-- Background glow -->
  <ellipse cx="70" cy="70" rx="58" ry="52" fill="#cc8833" opacity="0.06"/>

  <!-- Top arrow: curves left → right, tip points RIGHT (downward tangent ≈45°) -->
  <path d="M20 28 Q70 4 120 26" stroke="#cc8833" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <!-- Arrowhead at (120,26) -->
  <g transform="translate(120,26) rotate(45)">
    <polygon points="0,0 -13,-6 -13,6" fill="#cc8833"/>
  </g>
  <!-- Arrow shadow/depth line -->
  <path d="M20 30 Q70 6 120 28" stroke="#ffaa44" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.3"/>

  <!-- 3 cards in middle -->
  <g transform="translate(8,44) rotate(-12)"><rect width="42" height="60" rx="5" fill="#221100" stroke="#664422" stroke-width="1.8"/><rect x="3" y="3" width="36" height="54" rx="3" fill="none" stroke="#886633" stroke-width="0.7" opacity="0.35"/></g>
  <g transform="translate(34,36) rotate(4)"><rect width="42" height="60" rx="5" fill="#331e00" stroke="#885533" stroke-width="1.8"/><rect x="3" y="3" width="36" height="54" rx="3" fill="none" stroke="#aa7744" stroke-width="0.7" opacity="0.35"/></g>
  <g transform="translate(60,44)"><rect width="42" height="60" rx="5" fill="#442800" stroke="#aa7744" stroke-width="2.2"/><rect x="3" y="3" width="36" height="54" rx="3" fill="none" stroke="#cc9955" stroke-width="0.7" opacity="0.35"/><rect x="14" y="22" width="14" height="14" rx="2" fill="none" stroke="#886633" stroke-width="1.2" transform="rotate(45 21 29)" opacity="0.4"/></g>

  <!-- Bottom arrow: curves right → left, tip points LEFT (upward tangent ≈-135°) -->
  <path d="M120 114 Q70 138 20 116" stroke="#cc8833" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <!-- Arrowhead at (20,116) -->
  <g transform="translate(20,116) rotate(-135)">
    <polygon points="0,0 -13,-6 -13,6" fill="#cc8833"/>
  </g>
  <!-- Arrow shadow/depth line -->
  <path d="M120 116 Q70 140 20 118" stroke="#ffaa44" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.3"/>

  <!-- Sparkles at arrow tails -->
  <circle cx="20" cy="22" r="2.5" fill="#ffcc66" opacity="0.7"/>
  <circle cx="120" cy="122" r="2.5" fill="#ffcc66" opacity="0.7"/>
  <!-- Sparkles at tips -->
  <circle cx="122" cy="32" r="1.5" fill="white" opacity="0.4"/>
  <circle cx="18" cy="122" r="1.5" fill="white" opacity="0.4"/>
</g>`;

// ─────────────────────────────────────────────────────────────
//  FAVOR
// ─────────────────────────────────────────────────────────────
const ICON_FAVOR = `
<g transform="translate(0,2)">
  <ellipse cx="70" cy="118" rx="40" ry="6" fill="#aaaaaa" opacity="0.08"/>
  <g transform="translate(70,60) rotate(15)">
    <ellipse cx="0" cy="0" rx="22" ry="22" fill="#ffd9a8" stroke="#c4956a" stroke-width="1.5"/>
    <path d="M-22 -2 Q-22 -22 0 -22 Q22 -22 22 -2 Q18 -10 12 -8 Q0 -12 -12 -8 Q-18 -10 -22 -2" fill="#553311"/>
    <path d="M-12 -2 Q-8 2 -4 -2" stroke="#332200" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M4 -2 Q8 2 12 -2" stroke="#332200" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="-12" cy="6" rx="3" ry="2" fill="#ffaaaa" opacity="0.6"/>
    <ellipse cx="12" cy="6" rx="3" ry="2" fill="#ffaaaa" opacity="0.6"/>
    <path d="M-5 8 Q0 12 5 8" stroke="#332200" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </g>
  <g transform="translate(70,98)">
    <path d="M-30 -2 Q-34 22 -22 36 L22 36 Q34 22 30 -2 Q26 -10 0 -10 Q-26 -10 -30 -2 Z" fill="#cc3344" stroke="#88222a" stroke-width="1.5"/>
    <path d="M-12 -10 L0 -2 L12 -10" fill="#ffd9a8" stroke="#c4956a" stroke-width="1"/>
    <path d="M-22 14 Q-12 24 -2 18" stroke="#cc3344" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M22 14 Q12 24 2 18" stroke="#cc3344" stroke-width="8" fill="none" stroke-linecap="round"/>
    <ellipse cx="0" cy="20" rx="6" ry="5" fill="#ffd9a8" stroke="#c4956a" stroke-width="1.2"/>
  </g>
  <g transform="translate(28,30)"><path d="M0 -8 L1.5 -1.5 L8 0 L1.5 1.5 L0 8 L-1.5 1.5 L-8 0 L-1.5 -1.5 Z" fill="white" opacity="0.6"/></g>
  <g transform="translate(112,28)"><path d="M0 -6 L1 -1 L6 0 L1 1 L0 6 L-1 1 L-6 0 L-1 -1 Z" fill="white" opacity="0.5"/></g>
</g>`;

// ─────────────────────────────────────────────────────────────
//  FUTURE
// ─────────────────────────────────────────────────────────────
const ICON_FUTURE = `
<g transform="translate(0,0)">
  <circle cx="70" cy="70" r="42" fill="#ff66aa" opacity="0.08"/>
  <g transform="translate(70,18)">
    <ellipse cx="0" cy="22" rx="36" ry="6" fill="#1a0022" stroke="#5522aa" stroke-width="1.5"/>
    <path d="M-22 22 Q-22 0 -8 -8 Q-2 -28 4 -30 Q12 -28 18 -8 Q26 0 22 22 Z" fill="#1a0022" stroke="#5522aa" stroke-width="1.5"/>
    <ellipse cx="0" cy="18" rx="20" ry="4" fill="#3d0066" stroke="#7733aa" stroke-width="1"/>
    <rect x="-3" y="16" width="6" height="4" rx="1" fill="#aa44dd" stroke="#cc66ff" stroke-width="0.5"/>
    <path d="M-12 -2 Q-6 -22 0 -28" stroke="white" stroke-width="1.5" fill="none" opacity="0.15"/>
    <circle cx="-8" cy="6" r="1.2" fill="white" opacity="0.4"/>
    <circle cx="10" cy="10" r="1" fill="white" opacity="0.35"/>
    <circle cx="6" cy="-6" r="1" fill="white" opacity="0.4"/>
  </g>
  <circle cx="70" cy="74" r="32" fill="#0f0020" stroke="#ff66aa" stroke-width="2.5"/>
  <circle cx="70" cy="74" r="26" fill="#1a0033" stroke="#ff88cc" stroke-width="1" opacity="0.5"/>
  <circle cx="70" cy="74" r="20" fill="#220044" opacity="0.8"/>
  <ellipse cx="56" cy="58" rx="10" ry="6" fill="white" opacity="0.18" transform="rotate(-25 56 58)"/>
  <circle cx="70" cy="74" r="12" fill="none" stroke="#ff66aa" stroke-width="0.8" stroke-dasharray="3 2" opacity="0.5"/>
  <text x="70" y="78" text-anchor="middle" font-family="serif" font-size="14" fill="#ff88cc" opacity="0.7">&#9670;</text>
  <ellipse cx="70" cy="106" rx="28" ry="6" fill="#1a0022" stroke="#ff66aa" stroke-width="2"/>
  <path d="M48 102 Q70 96 92 102" stroke="#ff88cc" stroke-width="1.2" fill="none" opacity="0.4"/>
  <line x1="60" y1="103" x2="60" y2="107" stroke="#ff66aa" stroke-width="0.8" opacity="0.5"/>
  <line x1="80" y1="103" x2="80" y2="107" stroke="#ff66aa" stroke-width="0.8" opacity="0.5"/>
  <circle cx="20" cy="50" r="2" fill="#ff66aa" opacity="0.6"/>
  <circle cx="118" cy="60" r="1.8" fill="#ff88cc" opacity="0.5"/>
  <circle cx="18" cy="92" r="1.5" fill="#ff88cc" opacity="0.4"/>
  <circle cx="120" cy="96" r="1.5" fill="#ff66aa" opacity="0.4"/>
</g>`;

// ─────────────────────────────────────────────────────────────
//  TOM / JERRY / OGGY / JACK
// ─────────────────────────────────────────────────────────────
const ICON_TOM = `
<g transform="translate(0,4)">
  <ellipse cx="70" cy="32" rx="30" ry="6" fill="#aabbff" opacity="0.15"/>
  <path d="M44 36 L50 20 L60 30 L70 14 L80 30 L90 20 L96 36 L92 42 L48 42 Z" fill="#aabbff" stroke="#6677aa" stroke-width="1.5"/>
  <circle cx="52" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <circle cx="70" cy="22" r="3" fill="white" opacity="0.85"/>
  <circle cx="88" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <ellipse cx="70" cy="84" rx="38" ry="34" fill="#eef4ff" stroke="#334466" stroke-width="2.2"/>
  <polygon points="36,60 50,86 26,86" fill="#ddeeff" stroke="#334466" stroke-width="1.5"/>
  <polygon points="104,60 90,86 114,86" fill="#ddeeff" stroke="#334466" stroke-width="1.5"/>
  <polygon points="38,66 48,84 30,84" fill="#ffaaaa"/>
  <polygon points="102,66 92,84 110,84" fill="#ffaaaa"/>
  <ellipse cx="54" cy="78" rx="11" ry="13" fill="#88ccff"/>
  <ellipse cx="86" cy="78" rx="11" ry="13" fill="#88ccff"/>
  <ellipse cx="55" cy="80" rx="5.5" ry="9" fill="#1a1a2e"/>
  <ellipse cx="87" cy="80" rx="5.5" ry="9" fill="#1a1a2e"/>
  <circle cx="57" cy="76" r="2.5" fill="white"/>
  <circle cx="89" cy="76" r="2.5" fill="white"/>
  <polygon points="70,94 66,100 74,100" fill="#ff88aa"/>
  <path d="M62 104 Q70 112 78 104" stroke="#334466" stroke-width="2" fill="none"/>
  <line x1="30" y1="88" x2="50" y2="90" stroke="#334466" stroke-width="1.2"/>
  <line x1="30" y1="94" x2="50" y2="95" stroke="#334466" stroke-width="1.2"/>
  <line x1="90" y1="90" x2="110" y2="88" stroke="#334466" stroke-width="1.2"/>
  <line x1="90" y1="95" x2="110" y2="94" stroke="#334466" stroke-width="1.2"/>
</g>`;

const ICON_JERRY = `
<g transform="translate(0,4)">
  <path d="M44 36 L50 20 L60 30 L70 14 L80 30 L90 20 L96 36 L92 42 L48 42 Z" fill="#ffaa66" stroke="#cc6633" stroke-width="1.5"/>
  <circle cx="52" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <circle cx="70" cy="22" r="3" fill="white" opacity="0.85"/>
  <circle cx="88" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <circle cx="38" cy="60" r="20" fill="#ffccaa" stroke="#553311" stroke-width="1.5"/>
  <circle cx="38" cy="60" r="13" fill="#ffaaaa"/>
  <circle cx="102" cy="60" r="20" fill="#ffccaa" stroke="#553311" stroke-width="1.5"/>
  <circle cx="102" cy="60" r="13" fill="#ffaaaa"/>
  <ellipse cx="70" cy="86" rx="34" ry="32" fill="#ffeedd" stroke="#553311" stroke-width="2.2"/>
  <ellipse cx="56" cy="80" rx="9" ry="11" fill="#ffffcc"/>
  <ellipse cx="84" cy="80" rx="9" ry="11" fill="#ffffcc"/>
  <ellipse cx="57" cy="82" rx="4.5" ry="7" fill="#1a1000"/>
  <ellipse cx="85" cy="82" rx="4.5" ry="7" fill="#1a1000"/>
  <circle cx="59" cy="78" r="1.8" fill="white"/>
  <circle cx="87" cy="78" r="1.8" fill="white"/>
  <ellipse cx="70" cy="96" rx="7" ry="5" fill="#ff88aa"/>
  <path d="M62 106 Q70 114 78 106" stroke="#553311" stroke-width="1.5" fill="none"/>
  <rect x="64" y="106" width="5" height="7" rx="2" fill="white"/>
  <rect x="71" y="106" width="5" height="7" rx="2" fill="white"/>
  <line x1="40" y1="92" x2="58" y2="94" stroke="#553311" stroke-width="1"/>
  <line x1="40" y1="98" x2="58" y2="98" stroke="#553311" stroke-width="1"/>
  <line x1="82" y1="94" x2="100" y2="92" stroke="#553311" stroke-width="1"/>
  <line x1="82" y1="98" x2="100" y2="98" stroke="#553311" stroke-width="1"/>
</g>`;

const ICON_OGGY = `
<g transform="translate(0,4)">
  <path d="M44 36 L50 20 L60 30 L70 14 L80 30 L90 20 L96 36 L92 42 L48 42 Z" fill="#44ff88" stroke="#22aa44" stroke-width="1.5"/>
  <circle cx="52" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <circle cx="70" cy="22" r="3" fill="white" opacity="0.85"/>
  <circle cx="88" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <ellipse cx="70" cy="86" rx="40" ry="38" fill="#88ff88" stroke="#228822" stroke-width="2.5"/>
  <ellipse cx="52" cy="64" rx="14" ry="10" fill="white" opacity="0.15" transform="rotate(-20 52 64)"/>
  <ellipse cx="54" cy="76" rx="12" ry="14" fill="white"/>
  <ellipse cx="86" cy="76" rx="12" ry="14" fill="white"/>
  <ellipse cx="55" cy="78" rx="6.5" ry="9" fill="#1a2a1a"/>
  <ellipse cx="87" cy="78" rx="6.5" ry="9" fill="#1a2a1a"/>
  <circle cx="57" cy="74" r="3" fill="white"/>
  <circle cx="89" cy="74" r="3" fill="white"/>
  <path d="M46 100 Q70 124 94 100" stroke="#115511" stroke-width="3.5" fill="none"/>
  <rect x="50" y="100" width="8" height="11" rx="3" fill="white"/>
  <rect x="60" y="100" width="8" height="11" rx="3" fill="white"/>
  <rect x="70" y="100" width="8" height="11" rx="3" fill="white"/>
  <rect x="80" y="100" width="8" height="11" rx="3" fill="white"/>
  <circle cx="36" cy="92" r="5" fill="#66cc66" opacity="0.3"/>
  <circle cx="104" cy="92" r="5" fill="#66cc66" opacity="0.3"/>
</g>`;

const ICON_JACK = `
<g transform="translate(0,4)">
  <path d="M44 36 L50 20 L60 30 L70 14 L80 30 L90 20 L96 36 L92 42 L48 42 Z" fill="#dd99ff" stroke="#9955cc" stroke-width="1.5"/>
  <circle cx="52" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <circle cx="70" cy="22" r="3" fill="white" opacity="0.85"/>
  <circle cx="88" cy="26" r="2.5" fill="white" opacity="0.75"/>
  <rect x="30" y="46" width="80" height="12" rx="6" fill="#1a1a1a" stroke="#444" stroke-width="1.5"/>
  <rect x="40" y="14" width="60" height="36" rx="5" fill="#111111" stroke="#333" stroke-width="1.5"/>
  <rect x="40" y="40" width="60" height="10" fill="#3d0066" stroke="#5522aa" stroke-width="1"/>
  <rect x="62" y="42" width="16" height="6" rx="1.5" fill="#aa44dd" stroke="#cc66ff" stroke-width="0.5"/>
  <ellipse cx="70" cy="84" rx="32" ry="30" fill="#f5deb3" stroke="#c4956a" stroke-width="2.2"/>
  <ellipse cx="56" cy="78" rx="7" ry="6.5" fill="white"/>
  <ellipse cx="84" cy="78" rx="7" ry="6.5" fill="white"/>
  <circle cx="57" cy="79" rx="3.5" ry="3.5" fill="#222"/>
  <circle cx="85" cy="79" rx="3.5" ry="3.5" fill="#222"/>
  <circle cx="58" cy="78" r="1.2" fill="white"/>
  <circle cx="86" cy="78" r="1.2" fill="white"/>
  <ellipse cx="70" cy="92" rx="11" ry="9" fill="#d4a070" stroke="#c4956a" stroke-width="1.5"/>
  <ellipse cx="70" cy="89" rx="6" ry="3" fill="#e8b888" opacity="0.6"/>
  <path d="M50 102 Q58 98 66 102 Q70 106 74 102 Q82 98 90 102" stroke="#442200" stroke-width="2.5" fill="none"/>
  <polygon points="54,114 70,108 70,120" fill="#cc0066"/>
  <polygon points="86,114 70,108 70,120" fill="#cc0066"/>
  <circle cx="70" cy="114" r="5" fill="#aa0044"/>
</g>`;

const CARDS = [
  { id:'bomb',    label:'BOM',       sub:'Kích nổ ngay!',        g1:'#0a0000', g2:'#3d0000', accent:'#ff3300', icon:ICON_BOM },
  { id:'defuse',  label:'CỨU',      sub:'Né bom + đặt lại',    g1:'#001500', g2:'#003d00', accent:'#00ff44', icon:ICON_DEFUSE },
  { id:'skip',    label:'SKIP',      sub:'Bỏ qua lượt này',    g1:'#000d1a', g2:'#002244', accent:'#3399ff', icon:ICON_SKIP },
  { id:'shuffle', label:'XÀO XÁO',  sub:'Trộn bộ bài',         g1:'#1a0a00', g2:'#3d2200', accent:'#cc8833', icon:ICON_SHUFFLE },
  { id:'favor',   label:'CHO XIN',   sub:'Xin 1 lá từ người khác', g1:'#0a0a0a', g2:'#1a1a1a', accent:'#aaaaaa', icon:ICON_FAVOR },
  { id:'attack',  label:'BỐC ĐI',   sub:'Người sau bốc 2 lá',  g1:'#1a0000', g2:'#3d0000', accent:'#cc0000', icon:ICON_ATTACK },
  { id:'nope',    label:'AI CHO',    sub:'Hủy action (trừ combo)', g1:'#1a0800', g2:'#3d2200', accent:'#cc0000', icon:ICON_NOPE },
  { id:'future',  label:'XEM 1 TÍ',  sub:'Xem 3 lá trên cùng', g1:'#1a001a', g2:'#3d003d', accent:'#ff66aa', icon:ICON_FUTURE },
  { id:'tom',     label:'TOM',       sub:'Combo: cướp lá đối thủ', g1:'#0a1428', g2:'#1a2840', accent:'#88aadd', icon:ICON_TOM },
  { id:'jerry',   label:'JERRY',     sub:'Combo: cướp lá đối thủ', g1:'#1a0a00', g2:'#2d1800', accent:'#ff8844', icon:ICON_JERRY },
  { id:'oggy',    label:'OGGY',      sub:'Combo: cướp lá đối thủ', g1:'#001500', g2:'#002800', accent:'#00ff66', icon:ICON_OGGY },
  { id:'jack',    label:'JACK',      sub:'Combo: cướp lá đối thủ', g1:'#0a001a', g2:'#180028', accent:'#cc88ff', icon:ICON_JACK },
];

const COUNTS = { bomb:4, defuse:6, skip:4, shuffle:4, favor:4, attack:4, nope:5, future:5, tom:1, jerry:1, oggy:1, jack:1 };

let total = 0;
CARDS.forEach(c => {
  const count = COUNTS[c.id];
  for (let i = 1; i <= count; i++) {
    const filename = count === 1 ? `${c.id}.svg` : `${c.id}-${i}.svg`;
    const svg = cardShell({ ...c, id: `${c.id}${i}` });
    fs.writeFileSync(path.join(BASE, filename), svg, 'utf8');
    total++;
  }
});
console.log(`Generated ${total} cards — v8`);