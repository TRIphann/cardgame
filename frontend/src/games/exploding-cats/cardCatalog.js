/**
 * Arcana Card Catalog — Exploding Cats Việt hóa
 *
 * Quy tắc bộ 4 đặc biệt (Tom/Jerry/Oggy/Jack):
 *   1 lá  : vô tác dụng
 *   2 lá  : cướp 1 lá ngẫu nhiên từ người khác
 *   3 lá  : chỉ định 1 lá muốn lấy từ người khác
 *   4 khác: chọn 1 lá từ chồng bài thải
 *
 * Số lượng: Bom(4) + Cứu(6) + Skip(4) + Xào(4) + Cho xin(4) + Bốc đi(4) + AI cho(5) + Xem(5) + 4 lá đặc biệt(4) = 40 lá
 */

export const CARD_EFFECTS = {
  bomb: {
    id: 'bomb',
    label: 'BOM',
    subtitle: 'Kích nổ ngay!',
    emoji: '💣',
    bgColor: { primary: '#0a0000', secondary: '#3d0000' },
    accentColor: '#ff3300',
    glowColor: '#ff4400',
    bgClass: 'card-bg-bomb',
    rarity: 'rare',
    stackable: true,
    // Chỉ người có lá Cứu mới tránh được
    onDraw: {
      action: 'faceBomb',
      animation: 'shake-explode',
      toast: '💣 Bạn chạm bom!',
      responseRequired: ['defuse'],
    },
  },
  defuse: {
    id: 'defuse',
    label: 'CỨU',
    subtitle: 'Tránh bom + đặt lại',
    emoji: '🛡️',
    bgClass: 'card-bg-defuse',
    rarity: 'epic',
    stackable: true,
    onUse: {
      action: 'defuseBomb',
      animation: 'shield-pulse',
      toast: '🛡️ Né bom thành công! Đặt bom vào đâu?',
      placement: true,
    },
  },
  skip: {
    id: 'skip',
    label: 'SKIP',
    subtitle: 'Bỏ qua lượt này',
    emoji: '⏭️',
    bgClass: 'card-bg-skip',
    rarity: 'common',
    stackable: true,
    onUse: {
      action: 'skipTurn',
      animation: 'fade-slide',
      toast: '⏭️ Bỏ qua lượt!',
      stackable: false,
    },
  },
  shuffle: {
    id: 'shuffle',
    label: 'XÀO XÁO',
    subtitle: 'Trộn bộ bài',
    emoji: '🔀',
    bgClass: 'card-bg-shuffle',
    rarity: 'common',
    stackable: true,
    onUse: {
      action: 'shuffleDeck',
      animation: 'flip-spin',
      toast: '🔀 Bộ bài đã được xáo!',
    },
  },
  favor: {
    id: 'favor',
    label: 'CHO XIN',
    subtitle: 'Xin 1 lá từ người khác',
    emoji: '🎁',
    bgClass: 'card-bg-favor',
    rarity: 'common',
    stackable: true,
    onUse: {
      action: 'demandFavor',
      animation: 'heart-float',
      toast: '🎁 Chỉ định ai sẽ cho bạn 1 lá!',
      targetRequired: 'other-player',
      stackable: false,
    },
  },
  attack: {
    id: 'attack',
    label: 'BỐC ĐI',
    subtitle: 'Người sau bốc 2 lá',
    emoji: '🖐️',
    bgClass: 'card-bg-attack',
    rarity: 'common',
    stackable: true,
    stackEffect: 'attack_stacks', // +1 mỗi lần dùng
    onUse: {
      action: 'attackNext',
      animation: 'claw-slash',
      toast: '🖐️ Người tiếp theo bốc 2 lá!',
      stackable: true,
    },
  },
  nope: {
    id: 'nope',
    label: 'AI CHO',
    subtitle: 'Hủy action (trừ combo)',
    emoji: '✋',
    bgClass: 'card-bg-nope',
    rarity: 'common',
    stackable: true,
    onUse: {
      action: 'nope',
      animation: 'stop-hand',
      toast: '✋ Đã hủy action!',
      interruptible: true,
      stackable: false,
    },
    canBlock: ['favor', 'attack', 'future', 'shuffle', 'tom', 'jerry', 'oggy', 'jack'],
    cannotBlock: ['bomb', 'defuse', 'skip', 'nope', 'combo'],
  },
  future: {
    id: 'future',
    label: 'XEM',
    subtitle: 'Xem 3 lá trên cùng',
    emoji: '🔮',
    bgClass: 'card-bg-future',
    rarity: 'common',
    stackable: true,
    onUse: {
      action: 'peekTopThree',
      animation: 'crystal-glow',
      toast: '🔮 Xem 3 lá trên!',
      stackable: false,
    },
  },
  tom: {
    id: 'tom',
    label: 'TOM',
    subtitle: 'Combo: cướp lá đối thủ',
    emoji: '🐱',
    bgClass: 'card-bg-special',
    rarity: 'legendary',
    stackable: false,
    comboGroup: 'toji',
    onUse: {
      action: 'comboTomJerryOggyJack',
      animation: 'combo-glow',
      toast: '🐱 Combo!',
    },
  },
  jerry: {
    id: 'jerry',
    label: 'JERRY',
    subtitle: 'Combo: cướp lá đối thủ',
    emoji: '🐭',
    bgClass: 'card-bg-special',
    rarity: 'legendary',
    stackable: false,
    comboGroup: 'toji',
    onUse: {
      action: 'comboTomJerryOggyJack',
      animation: 'combo-glow',
      toast: '🐭 Combo!',
    },
  },
  oggy: {
    id: 'oggy',
    label: 'OGGY',
    subtitle: 'Combo: cướp lá đối thủ',
    emoji: '🟢',
    bgClass: 'card-bg-special',
    rarity: 'legendary',
    stackable: false,
    comboGroup: 'toji',
    onUse: {
      action: 'comboTomJerryOggyJack',
      animation: 'combo-glow',
      toast: '🟢 Combo!',
    },
  },
  jack: {
    id: 'jack',
    label: 'JACK',
    subtitle: 'Combo: cướp lá đối thủ',
    emoji: '🎩',
    bgClass: 'card-bg-special',
    rarity: 'legendary',
    stackable: false,
    comboGroup: 'toji',
    onUse: {
      action: 'comboTomJerryOggyJack',
      animation: 'combo-glow',
      toast: '🎩 Combo!',
    },
  },
};

/**
 * Mặc định 5 người chơi — 46 lá
 * Các variant khác có thể thay đổi số lượng bom cho phù hợp
 */
export const DECK_CONFIGS = {
  3: { bombs: 3, defuse: 4, players: 3 },
  4: { bombs: 4, defuse: 5, players: 4 },
  5: { bombs: 4, defuse: 6, players: 5 },
  6: { bombs: 5, defuse: 7, players: 6 },
  7: { bombs: 6, defuse: 8, players: 7 },
  8: { bombs: 7, defuse: 9, players: 8 },
};

export const DEFAULT_DECK = [
  ...Array(4).fill('bomb'),
  ...Array(6).fill('defuse'),
  ...Array(4).fill('skip'),
  ...Array(4).fill('shuffle'),
  ...Array(4).fill('favor'),
  ...Array(4).fill('attack'),
  ...Array(5).fill('nope'),
  ...Array(5).fill('future'),
  'tom', 'jerry', 'oggy', 'jack',
];

/**
 * Tạo deck với số lượng người chơi cụ thể
 */
export function buildDeck(playerCount) {
  const config = DECK_CONFIGS[playerCount] ?? DECK_CONFIGS[5];
  const deck = [
    ...Array(config.bombs).fill('bomb'),
    ...Array(config.defuse).fill('defuse'),
    ...Array(4).fill('skip'),
    ...Array(4).fill('shuffle'),
    ...Array(4).fill('favor'),
    ...Array(4).fill('attack'),
    ...Array(5).fill('nope'),
    ...Array(5).fill('future'),
    'tom', 'jerry', 'oggy', 'jack',
  ];
  return shuffleArray([...deck]);
}

export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Gọi khi combo Tom/Jerry/Oggy/Jack được chơi
 * @param {string[]} heldCards - mảng cardId người chơi đang cầm
 * @returns {{action, targets, description}}
 */
export function resolveCombo(heldCards) {
  const uniqueCards = [...new Set(heldCards)];
  const count = heldCards.length;

  if (count === 1) {
    return {
      action: 'nothing',
      description: 'Chỉ 1 lá, không có tác dụng',
      toast: '🤷 Chỉ 1 lá, vô tác dụng!',
    };
  }

  if (count === 2) {
    return {
      action: 'steal-random',
      description: 'Cướp 1 lá ngẫu nhiên từ người khác',
      toast: '⚡ Cướp 1 lá ngẫu nhiên!',
    };
  }

  if (count >= 3 && uniqueCards.length === 1) {
    // 3 hoặc 4 lá giống nhau
    return {
      action: 'steal-specific',
      description: 'Chỉ định lá muốn lấy từ người khác',
      toast: '🎯 Chỉ định 1 lá để cướp!',
    };
  }

  // 3-5 lá khác nhau
  if (uniqueCards.length >= 3) {
    return {
      action: 'pick-from-discard',
      description: 'Chọn 1 lá từ chồng bài thải',
      toast: '🗑️ Chọn 1 lá từ bãi!',
    };
  }

  return {
    action: 'nothing',
    description: 'Combo không hợp lệ',
    toast: '❓ Combo không hợp lệ',
  };
}

/**
 * Cloudinary URLs — sẽ được điền sau khi upload
 * Fallback: emoji trong cardAssetLoader
 */
export const CARD_CLOUDINARY = {
  // Format: https://res.cloudinary.com/{cloudName}/image/upload/f_auto,q_auto,w_140,h_200,c_fill/{publicId}.svg
  // Hiện tại dùng local SVG
  baseUrl: null, // set sau khi upload
  cards: {},
};

export function getCardUrl(cardId, cosmeticOverride = null) {
  if (cosmeticOverride) {
    return cosmeticOverride[cardId] ?? null;
  }
  return CARD_CLOUDINARY.cards[cardId] ?? null;
}
