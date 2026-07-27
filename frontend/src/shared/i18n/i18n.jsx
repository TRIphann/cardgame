// Tiny i18n module — Vietnamese only for now. Hook-shaped so any React
// component can read translations with useI18n().
//
// Adding a new locale means dropping a new entry in LOCALES and exposing a
// setter on the context. Call sites stay the same.

import React, { createContext, useContext, useMemo, useState, useCallback } from "react";

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

    "common.error.network": "Không kết nối được máy chủ.",
    "common.error.timeout": "Máy chủ không phản hồi.",
    "common.error.invalidCode": "Mã phòng không hợp lệ.",
    "common.error.roomFull": "Phòng đã đầy.",
    "common.error.notFound": "Phòng không tồn tại.",
    "common.nameRequired": "Vui lòng nhập tên trước.",
    "common.codeRequired": "Vui lòng nhập mã phòng.",
  },
};

// React adapter -------------------------------------------------------------

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState("vi");

  const t = useCallback(
    (key, vars) => {
      const dict = LOCALES[locale] || LOCALES.vi;
      let str = dict[key] || LOCALES.vi[key] || key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, available: Object.keys(LOCALES) }),
    [locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

// Back-compat named export so any non-React caller still works.
export { LOCALES };