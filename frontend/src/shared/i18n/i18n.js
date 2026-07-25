// Tiny i18n module — Vietnamese only for now.
// Adding a new locale means dropping a new entry in LOCALES; call sites stay the same.
//
// Usage:
//   import { t } from "../../shared/i18n/i18n.js";
//   t("lobby.title")

const LOCALES = {
  vi: {
    "app.title": "Arcana",

    "settings.title": "Cài đặt",
    "settings.language": "Ngôn ngữ",
    "settings.language.value": "Tiếng Việt",
    "settings.music": "Âm lượng nhạc nền",
    "settings.sfx": "Âm lượng hiệu ứng",
    "settings.musicMuted": "Tắt nhạc nền",
    "settings.sfxMuted": "Tắt hiệu ứng",
    "settings.close": "Đóng",
    "settings.languageLocked": "Hiện chỉ hỗ trợ Tiếng Việt.",

    "lobby.title": "Phòng chờ",
    "lobby.subtitle": "Đang chờ người chơi…",
    "lobby.inviteCode": "MÃ MỜI PHÒNG",
    "lobby.copy": "Sao chép",
    "lobby.copied": "Đã sao chép",
    "lobby.emptySlot": "Còn trống",
    "lobby.playerCount": "{count}/8 người chơi",
    "lobby.startGame": "Bắt đầu",
    "lobby.leave": "Rời phòng",
    "lobby.waiting": "Đang chờ chủ phòng…",
    "lobby.you": "Bạn",
    "lobby.host": "Chủ phòng",
    "lobby.ready": "Sẵn sàng",
    "lobby.notReady": "Chưa sẵn sàng",
    "lobby.shareHint": "Chia sẻ mã này cho tối đa 7 người bạn để cùng vào phòng.",

    "landing.title": "Arcana",
    "landing.tagline": "Số phận nằm trong tay bạn.",
    "landing.eyebrow": "ĐẤU TRƯỜNG THẺ HUYỀN BÍ",
    "landing.playerName": "Tên người chơi",
    "landing.playerNamePlaceholder": "Nhập tên của bạn…",
    "landing.createRoom": "Tạo phòng",
    "landing.joinRoom": "Vào phòng",
    "landing.creating": "Đang tạo phòng…",
    "landing.joining": "Đang vào phòng…",
    "landing.pickGame": "CHỌN TRÒ CHƠI",
    "landing.game.explodingCats": "Mèo Nổ",
    "landing.game.comingSoon": "Sắp ra mắt",
    "landing.footer": "Sẵn sàng cho một ván đấu huyền bí?",
    "landing.codePrompt": "Nhập mã mời phòng (6 ký tự):",
    "landing.codeEmpty": "Bạn chưa nhập mã phòng.",
  },
};

const SUPPORTED = ["vi"];

class I18n {
  constructor() {
    this.locale = "vi";
  }

  setLocale(loc) {
    if (SUPPORTED.includes(loc)) this.locale = loc;
  }

  getLocale() {
    return this.locale;
  }

  getSupported() {
    return SUPPORTED;
  }

  t(key, params = {}) {
    const dict = LOCALES[this.locale] || LOCALES.vi;
    let str = dict[key] ?? key;
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, v);
    }
    return str;
  }
}

export const i18n = new I18n();
export const t = (key, params) => i18n.t(key, params);
