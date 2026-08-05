const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GamePage-CKHhfxkF.js","assets/react-BhVOh7S1.js","assets/vendor-DcE7maHo.js","assets/router-DRJyKT9H.js","assets/react-dom-HPixZcWd.js","assets/GamePage-BG-JEZDo.css"])))=>i.map(i=>d[i]);
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { a as React, j as jsxRuntimeExports, r as reactExports } from "./react-BhVOh7S1.js";
import { r as reactDomExports, c as createRoot } from "./react-dom-HPixZcWd.js";
import { u as useLocation, a as useNavigate, L as Link, R as Routes, b as Route, N as Navigate, B as BrowserRouter } from "./router-DRJyKT9H.js";
import "./vendor-DcE7maHo.js";
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const scriptRel = "modulepreload";
const assetsURL = function(dep) {
  return "/" + dep;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = Promise.allSettled(
      deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
const API_BASE_URL = "https://cardgame-lwsk.onrender.com";
const ROUTES = {
  landing: "/",
  lobby: "/lobby",
  game: (roomId) => `/game/${roomId}`,
  settings: "/settings"
};
const SESSION_KEY = "arcana.session.v1";
const SESSION_EVENT$1 = "arcana:session";
function emitSessionChange$1(next) {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT$1, { detail: next }));
  } catch (_) {
  }
}
function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    emitSessionChange$1(session);
  } catch (_) {
  }
}
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (_) {
  }
}
const LAST_NAME_KEY = "arcana.lastName.v1";
function saveLastName(name) {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
  } catch (_) {
  }
}
function loadLastName() {
  try {
    return localStorage.getItem(LAST_NAME_KEY) || "";
  } catch (_) {
    return "";
  }
}
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    __publicField(this, "reset", () => {
      this.setState({ error: null, info: null });
    });
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("[arcana] ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "alert", className: "arc-error-screen", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Có lỗi xảy ra." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: String(this.state.error?.message || this.state.error) }),
        this.state.info?.componentStack && /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "arc-error-screen__stack", children: this.state.info.componentStack }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: this.reset, children: "Thử lại" })
      ] });
    }
    return this.props.children;
  }
}
function LoadingScreen() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "status", "aria-live": "polite", className: "arc-loading", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "arc-loading__spinner", "aria-hidden": "true" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Đang tải…" })
  ] });
}
const STORAGE_KEY = "arcana.audio.v1";
const DEFAULT_STATE = {
  musicVolume: 0.6,
  sfxVolume: 0.8,
  musicMuted: false,
  sfxMuted: false
};
class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicEl = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.buffers = /* @__PURE__ */ new Map();
    this.unlocked = false;
    this.state = { ...DEFAULT_STATE, ...this._loadPersisted() };
    this._listeners = /* @__PURE__ */ new Set();
  }
  _loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }
  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (_) {
    }
  }
  _emit() {
    for (const fn of this._listeners) fn();
  }
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  unlock() {
    if (this.unlocked) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.gain.value = this._effectiveMusicVolume();
      this.sfxGain.gain.value = this._effectiveSfxVolume();
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.unlocked = true;
    } catch (err) {
      console.warn("AudioContext unavailable", err);
    }
  }
  _effectiveMusicVolume() {
    return this.state.musicMuted ? 0 : this.state.musicVolume;
  }
  _effectiveSfxVolume() {
    return this.state.sfxMuted ? 0 : this.state.sfxVolume;
  }
  setMusicVolume(v) {
    this.state.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = this._effectiveMusicVolume();
    this._persist();
    this._emit();
  }
  setSfxVolume(v) {
    this.state.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this._effectiveSfxVolume();
    this._persist();
    this._emit();
  }
  setMusicMuted(muted) {
    this.state.musicMuted = !!muted;
    if (this.musicGain) this.musicGain.gain.value = this._effectiveMusicVolume();
    this._persist();
    this._emit();
  }
  setSfxMuted(muted) {
    this.state.sfxMuted = !!muted;
    if (this.sfxGain) this.sfxGain.gain.value = this._effectiveSfxVolume();
    this._persist();
    this._emit();
  }
  async _loadBuffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
    this.buffers.set(url, audioBuf);
    return audioBuf;
  }
  playSfx(name) {
    if (!this.unlocked || !this.ctx) return;
    const url = SFX_URLS[name];
    if (!url) return;
    this._loadBuffer(url).then((buf) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfxGain);
      src.start();
    }).catch((err) => console.warn("sfx play failed", name, err));
  }
}
const SFX_URLS = {
  buttonClick: null,
  roomCodeReveal: null,
  playerJoin: null,
  error: null
};
const audioManager = new AudioManager();
function useAudio() {
  const state = reactExports.useSyncExternalStore(
    (cb) => audioManager.subscribe(cb),
    () => audioManager.state
  );
  const unlock = reactExports.useCallback(() => audioManager.unlock(), []);
  const playSfx = reactExports.useCallback((name) => audioManager.playSfx(name), []);
  const setMusicVolume = reactExports.useCallback((v) => audioManager.setMusicVolume(v), []);
  const setSfxVolume = reactExports.useCallback((v) => audioManager.setSfxVolume(v), []);
  const setMusicMuted = reactExports.useCallback((m) => audioManager.setMusicMuted(m), []);
  const setSfxMuted = reactExports.useCallback((m) => audioManager.setSfxMuted(m), []);
  return {
    state,
    unlock,
    playSfx,
    setMusicVolume,
    setSfxVolume,
    setMusicMuted,
    setSfxMuted
  };
}
const SettingsContext = reactExports.createContext(null);
function SettingsProvider({ children }) {
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [tabs, setTabs] = reactExports.useState([]);
  const [activeTabId, setActiveTabId] = reactExports.useState(null);
  const actionsRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const rendersRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const open = reactExports.useCallback(() => {
    setIsOpen(true);
    if (!activeTabId && tabs[0]) setActiveTabId(tabs[0].id);
  }, [activeTabId, tabs]);
  const close = reactExports.useCallback(() => setIsOpen(false), []);
  const registerTabs = reactExports.useCallback((newTabs, onAction) => {
    setTabs(newTabs);
    actionsRef.current.clear();
    for (const t of newTabs) {
      if (t.onAction) actionsRef.current.set(t.id, t.onAction);
      rendersRef.current.set(t.id, { mount: t.render });
    }
    if (newTabs.length > 0 && !newTabs.find((t) => t.id === activeTabId)) {
      setActiveTabId(newTabs[0].id);
    }
  }, [activeTabId]);
  const dispatchAction = reactExports.useCallback((action, payload) => {
    const fn = actionsRef.current.get(activeTabId);
    if (fn) fn(action, payload);
  }, [activeTabId]);
  const refreshActive = reactExports.useCallback(() => {
    const entry = rendersRef.current.get(activeTabId);
    if (entry && entry.refresh) entry.refresh();
  }, [activeTabId]);
  const value = reactExports.useMemo(
    () => ({
      isOpen,
      open,
      close,
      tabs,
      activeTabId,
      setActiveTabId,
      registerTabs,
      dispatchAction,
      refreshActive
    }),
    [isOpen, open, close, tabs, activeTabId, registerTabs, dispatchAction, refreshActive]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsContext.Provider, { value, children });
}
function useSettings() {
  const ctx = reactExports.useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
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
    "common.codeRequired": "Vui lòng nhập mã phòng."
  }
};
const I18nContext = reactExports.createContext(null);
function I18nProvider({ children }) {
  const [locale, setLocale] = reactExports.useState("vi");
  const t = reactExports.useCallback(
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
    [locale]
  );
  const value = reactExports.useMemo(
    () => ({ locale, setLocale, t, available: Object.keys(LOCALES) }),
    [locale, t]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx(I18nContext.Provider, { value, children });
}
function useI18n() {
  const ctx = reactExports.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
function SettingsModalRoot() {
  const settings = useSettings();
  const audio = useAudio();
  const { t } = useI18n();
  reactExports.useEffect(() => {
    if (!settings.isOpen) return void 0;
    function onKey(e) {
      if (e.key === "Escape") settings.close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settings.isOpen, settings]);
  if (!settings.isOpen) return null;
  return reactDomExports.createPortal(
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-root", role: "dialog", "aria-modal": "true", "aria-labelledby": "settings-title", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "settings-backdrop", onClick: settings.close }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "settings-panel", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "settings-header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "settings-title", children: t("settings.title") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "settings-close", "aria-label": "Đóng", onClick: settings.close, children: "✕" })
        ] }),
        settings.tabs.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { className: "settings-tabs", role: "tablist", children: settings.tabs.map((tab) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": tab.id === settings.activeTabId,
            className: `settings-tab ${tab.id === settings.activeTabId ? "is-active" : ""}`,
            onClick: () => settings.setActiveTabId(tab.id),
            children: tab.label
          },
          tab.id
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "settings-body", role: "tabpanel", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsBody, { settings, audio, t }) })
      ] })
    ] }),
    document.body
  );
}
function SettingsBody({ settings, audio, t }) {
  const tab = settings.tabs.find((x) => x.id === settings.activeTabId);
  if (tab) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(CustomTabBody, { tab, settings });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-group", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "settings-label", children: t("settings.language") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("select", { className: "settings-select", defaultValue: "vi", children: /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "vi", children: t("settings.language.value") }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "settings-hint", children: t("settings.languageLocked") })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-group", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "settings-label", htmlFor: "music-vol", children: t("settings.music") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-slider-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "range",
            id: "music-vol",
            min: "0",
            max: "100",
            value: Math.round(audio.state.musicVolume * 100),
            onChange: (e) => audio.setMusicVolume(Number(e.target.value) / 100)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "settings-toggle",
            "aria-pressed": !audio.state.musicMuted,
            onClick: () => audio.setMusicMuted(!audio.state.musicMuted),
            children: "♪"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-group", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "settings-label", htmlFor: "sfx-vol", children: t("settings.sfx") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-slider-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "range",
            id: "sfx-vol",
            min: "0",
            max: "100",
            value: Math.round(audio.state.sfxVolume * 100),
            onChange: (e) => audio.setSfxVolume(Number(e.target.value) / 100)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "settings-toggle",
            "aria-pressed": !audio.state.sfxMuted,
            onClick: () => audio.setSfxMuted(!audio.state.sfxMuted),
            children: "▶"
          }
        )
      ] })
    ] })
  ] });
}
function CustomTabBody({ tab, settings }) {
  const containerRef = React.useRef(null);
  reactExports.useEffect(() => {
    const node = containerRef.current;
    if (!node) return void 0;
    function onClick(e) {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const payload = target.dataset.payload ? JSON.parse(target.dataset.payload) : null;
      settings.dispatchAction(action, payload);
    }
    node.addEventListener("click", onClick);
    return () => node.removeEventListener("click", onClick);
  }, [settings]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: containerRef, children: tab.render() });
}
const TITLES = {
  "/": "Arcana — Card Battle",
  "/lobby": "Arcana — Phòng chờ"
};
function RouteAnnouncer() {
  const location = useLocation();
  reactExports.useEffect(() => {
    const match = Object.entries(TITLES).find(
      ([prefix]) => location.pathname === prefix || location.pathname.startsWith(prefix + "/")
    );
    document.title = match ? match[1] : "Arcana";
  }, [location.pathname]);
  return null;
}
const FLOATING_CARDS = [
  { glyph: "☼", title: "SOL", cls: "card-sun" },
  { glyph: "☾", title: "LUNA", cls: "card-moon" },
  { glyph: "◉", title: "ORACLE", cls: "card-eye" },
  { glyph: "✦", title: "ASTRA", cls: "card-star" },
  { glyph: "♠", title: "IGNIS", cls: "card-flame" }
];
function AmbientBackdrop() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "arc-ambient", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-one" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-two" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stars" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "cards-scene", children: FLOATING_CARDS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: `floating-card ${c.cls}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: c.glyph }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: c.title })
    ] }, c.title)) })
  ] });
}
const ICONS$1 = {
  error: "⚠",
  success: "✓",
  info: "ℹ",
  warning: "!"
};
const DEFAULT_DURATION = 4500;
const ToastReactContext = reactExports.createContext(null);
function reducer(state, action) {
  switch (action.type) {
    case "ADD":
      return [...state, action.toast];
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}
function ToastProvider({ children }) {
  const [toasts, dispatch] = reactExports.useReducer(reducer, []);
  const idCounter = reactExports.useRef(0);
  const hostRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const host = document.createElement("div");
    host.className = "arc-toast-container";
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Thông báo");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
    hostRef.current = host;
    return () => {
      host.remove();
      hostRef.current = null;
    };
  }, []);
  const dismiss = reactExports.useCallback((id) => {
    dispatch({ type: "REMOVE", id });
  }, []);
  const show = reactExports.useCallback(
    (message, options = {}) => {
      const tone = options.tone || "info";
      const duration = options.duration ?? DEFAULT_DURATION;
      const id = ++idCounter.current;
      const toast2 = {
        id,
        message,
        title: options.title,
        tone,
        duration,
        action: options.action,
        createdAt: Date.now()
      };
      dispatch({ type: "ADD", toast: toast2 });
      if (duration > 0) {
        setTimeout(() => dispatch({ type: "REMOVE", id }), duration);
      }
      return {
        id,
        dismiss: () => dispatch({ type: "REMOVE", id })
      };
    },
    []
  );
  const api = reactExports.useMemo(
    () => ({
      show,
      success: (msg, opts) => show(msg, { ...opts, tone: "success" }),
      error: (msg, opts) => show(msg, { ...opts, tone: "error" }),
      info: (msg, opts) => show(msg, { ...opts, tone: "info" }),
      warning: (msg, opts) => show(msg, { ...opts, tone: "warning" }),
      dismiss
    }),
    [show, dismiss]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(ToastReactContext.Provider, { value: api, children: [
    children,
    hostRef.current ? reactDomExports.createPortal(/* @__PURE__ */ jsxRuntimeExports.jsx(ToastList, { toasts, onDismiss: dismiss }), hostRef.current) : null
  ] });
}
function ToastList({ toasts, onDismiss }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "arc-toast-stack", role: "list", children: toasts.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(ToastView, { toast: t, onDismiss }, t.id)) });
}
function ToastView({ toast: toast2, onDismiss }) {
  const handleClose = () => onDismiss(toast2.id);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "li",
    {
      className: `arc-toast arc-toast--${toast2.tone} arc-toast--enter`,
      role: toast2.tone === "error" ? "alert" : "status",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "arc-toast__icon", "aria-hidden": "true", children: ICONS$1[toast2.tone] || "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "arc-toast__body", children: [
          toast2.title && /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "arc-toast__title", children: toast2.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "arc-toast__message", children: toast2.message })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "arc-toast__close",
            "aria-label": "Đóng",
            onClick: handleClose,
            children: "✕"
          }
        )
      ]
    }
  );
}
function useToast() {
  const ctx = reactExports.useContext(ToastReactContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
const COLD_START_TIMEOUT_MS = 5e4;
const WARM_TIMEOUT_MS = 15e3;
const MAX_RETRIES = 1;
function isAbort(err) {
  return err && (err.name === "AbortError" || /abort/i.test(String(err.message || "")));
}
function isTransient(err) {
  if (!err) return false;
  if (isAbort(err)) return true;
  if (/timeout|network|failed to fetch/i.test(err.message || "")) return true;
  return false;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";
  const timeoutMs = isMutation ? COLD_START_TIMEOUT_MS : WARM_TIMEOUT_MS;
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...options.headers || {}
        }
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES && isTransient(err)) {
        const delay = Math.min(5e3, 500 * Math.pow(2, attempt));
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
async function jsonRequest(path, options = {}) {
  const res = await request(path, options);
  if (!res.ok) {
    let code = `http_${res.status}`;
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      code = body.code || code;
      msg = body.message || msg;
    } catch (_) {
    }
    const err = new Error(msg);
    err.code = code;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}
const roomsApi = {
  create(hostName) {
    return jsonRequest("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ hostName })
    });
  },
  join(code, playerName) {
    return jsonRequest("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code, playerName })
    });
  },
  // Snapshot endpoint also prunes stale members server-side. Used by the
  // polling loop instead of /api/rooms/{id} so we get fresh IsOnline flags.
  // Pass memberId so the server marks us online on each call (prevents
  // the 35s offline prune from kicking us while we're actively polling).
  snapshot(roomId, memberId) {
    const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
    return jsonRequest(`/api/rooms/${roomId}/snapshot${qs}`);
  },
  kick(roomId, hostId, targetMemberId) {
    return jsonRequest(`/api/rooms/${roomId}/kick`, {
      method: "POST",
      body: JSON.stringify({ hostId, targetMemberId })
    });
  },
  setReady(roomId, memberId, isReady) {
    return jsonRequest(`/api/rooms/${roomId}/ready`, {
      method: "POST",
      body: JSON.stringify({ memberId, isReady })
    });
  },
  leave(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/members/${memberId}/leave`, {
      method: "POST",
      body: JSON.stringify({ memberId })
    });
  },
  heartbeat(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ memberId })
    });
  },
  // Game endpoints
  snapshotWithViewer(roomId, memberId) {
    const qs = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
    return jsonRequest(`/api/rooms/${roomId}/snapshot${qs}`);
  },
  startGame(roomId, hostId) {
    return jsonRequest(`/api/rooms/${roomId}/start`, {
      method: "POST",
      body: JSON.stringify({ hostId })
    });
  },
  rotateRoom(roomId, hostId) {
    return jsonRequest(`/api/rooms/${roomId}/rotate`, {
      method: "POST",
      body: JSON.stringify({ hostId })
    });
  },
  playCard(roomId, payload) {
    return jsonRequest(`/api/rooms/${roomId}/game/play-card`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  drawCard(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/game/draw-card`, {
      method: "POST",
      body: JSON.stringify({ memberId })
    });
  },
  useDefuse(roomId, memberId, slotIndex) {
    return jsonRequest(`/api/rooms/${roomId}/game/defuse`, {
      method: "POST",
      body: JSON.stringify({ memberId, slotIndex })
    });
  },
  nope(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/game/nope`, {
      method: "POST",
      body: JSON.stringify({ memberId })
    });
  },
  concede(roomId, memberId) {
    return jsonRequest(`/api/rooms/${roomId}/game/concede`, {
      method: "POST",
      body: JSON.stringify({ memberId })
    });
  }
};
const OPTIMISTIC_TIMEOUT_MS = 1500;
const PLACEHOLDER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function placeholderCode() {
  let s = "";
  for (let i = 0; i < 6; i += 1) {
    s += PLACEHOLDER_CHARS[Math.floor(Math.random() * PLACEHOLDER_CHARS.length)];
  }
  return s;
}
function pickMember(room, isHostAction, name) {
  if (isHostAction) return room.members.find((m) => m.isHost) ?? room.members[0];
  return room.members.find((m) => !m.isHost && m.name === name) ?? room.members.at(-1);
}
function raceWithFallback(postPromise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ kind: "timeout" });
    }, ms);
    postPromise.then(
      (val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ kind: "ok", value: val });
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ kind: "err", error: err });
        }
      }
    );
  });
}
function useOptimisticRoom({ onNavigate } = {}) {
  const navigate = useNavigate();
  const navigateToLanding = reactExports.useCallback(() => {
    if (typeof onNavigate === "function") {
      onNavigate(ROUTES.landing);
      return;
    }
    navigate(ROUTES.landing, { replace: true });
  }, [navigate, onNavigate]);
  const [busy, setBusy] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const run = reactExports.useCallback(async (action, { name, code }) => {
    setBusy(true);
    setError(null);
    const postPromise = (async () => {
      const res = action === "create" ? await roomsApi.create(name) : await roomsApi.join(code, name);
      return res;
    })();
    const raced = await raceWithFallback(postPromise, OPTIMISTIC_TIMEOUT_MS);
    raced.kind === "timeout";
    const finalize = (room, member) => {
      saveSession({
        roomId: room.id,
        roomCode: room.code,
        playerId: member.id,
        playerName: member.name,
        isHost: action === "create",
        stage: "lobby"
      });
      if (onNavigate) onNavigate(room);
    };
    if (raced.kind === "ok") {
      const body = raced.value;
      const room = body.room ?? body;
      const member = pickMember(room, action === "create", name);
      if (!member) {
        setError(new Error("Không tìm thấy thành viên sau khi tạo/vào phòng."));
        setBusy(false);
        return { kind: "err" };
      }
      finalize(room, member);
      setBusy(false);
      return { kind: "ok", optimistic: false, room };
    }
    if (raced.kind === "err") {
      setError(raced.error);
      setBusy(false);
      return { kind: "err", error: raced.error };
    }
    const fakeRoom = {
      id: "PENDING-" + Date.now(),
      code: placeholderCode(),
      hostId: "PENDING",
      hostName: name,
      status: "waiting",
      maxPlayers: 7,
      currentPlayers: 1,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      members: [{
        id: "PENDING-me",
        name,
        isHost: action === "create",
        joinedAt: (/* @__PURE__ */ new Date()).toISOString()
      }]
    };
    finalize(fakeRoom, fakeRoom.members[0]);
    setBusy(false);
    postPromise.then((body) => {
      const real = body.room ?? body;
      const me = pickMember(real, action === "create", name);
      if (!real?.id || !me?.id) return;
      const cur = loadSession();
      if (cur && cur.playerId === "PENDING-me") {
        saveSession({
          ...cur,
          roomId: real.id,
          roomCode: real.code,
          playerId: me.id,
          playerName: me.name
        });
      }
    }).catch((err) => {
      console.warn("[arcana] optimistic cold-start POST failed", err);
      const cur = loadSession();
      if (cur && cur.roomId?.startsWith("PENDING-")) {
        navigateToLanding();
      }
    });
    return { kind: "ok", optimistic: true, room: fakeRoom };
  }, [onNavigate, navigateToLanding]);
  return { run, busy, error };
}
if (typeof window !== "undefined") {
  fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" }).catch(() => {
  });
  setInterval(() => {
    fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" }).catch(() => {
    });
  }, 6e4);
}
function LandingPage() {
  const navigate = useNavigate();
  const audio = useAudio();
  const toast = useToast();
  const { t } = useI18n();
  const [name, setName] = reactExports.useState(() => loadLastName());
  const [code, setCode] = reactExports.useState("");
  const [stage, setStage] = reactExports.useState("enter-code");
  const [message, setMessage] = reactExports.useState(null);
  const [shake, setShake] = reactExports.useState(0);
  const formRef = reactExports.useRef(null);
  const onCreateNavigate = reactExports.useCallback(
    (room) => {
      audio.playSfx(room.code && !String(room.code).startsWith("PENDING") ? "roomCodeReveal" : "buttonClick");
      toast.success(`Đã tạo phòng ${room.code}`, { title: "Tạo phòng thành công", duration: 2e3 });
      navigate(ROUTES.lobby, { replace: true });
    },
    [audio, toast, navigate]
  );
  const onJoinNavigate = reactExports.useCallback(
    (room) => {
      audio.playSfx(room.code && !String(room.code).startsWith("PENDING") ? "roomCodeReveal" : "buttonClick");
      toast.success(`Đã vào phòng ${room.code}`, { title: "Vào phòng thành công", duration: 2e3 });
      navigate(ROUTES.lobby, { replace: true });
    },
    [audio, toast, navigate]
  );
  const { run: runCreate, busy: busyCreate } = useOptimisticRoom({ onNavigate: onCreateNavigate });
  const { run: runJoin, busy: busyJoin } = useOptimisticRoom({ onNavigate: onJoinNavigate });
  const busy = busyCreate || busyJoin;
  reactExports.useEffect(() => {
    if (name) saveLastName(name);
  }, [name]);
  const flash = reactExports.useCallback((text, tone = "error") => {
    setMessage({ text, tone, key: Date.now() });
  }, []);
  const triggerShake = reactExports.useCallback(() => setShake((n) => n + 1), []);
  const submit = reactExports.useCallback(
    async (action) => {
      const trimmed = name.trim();
      if (!trimmed) {
        flash(t("common.nameRequired"));
        triggerShake();
        return;
      }
      if (action === "join" && !code.trim()) {
        flash(t("common.codeRequired"));
        triggerShake();
        return;
      }
      audio.unlock();
      audio.playSfx("buttonClick");
      const pending = toast.info(
        action === "create" ? t("landing.creating") : t("landing.joining"),
        { title: action === "create" ? "Tạo phòng" : "Vào phòng", duration: 0 }
      );
      const runner = action === "create" ? runCreate : runJoin;
      const result = await runner(action, { name: trimmed, code: code.trim().toUpperCase() });
      pending?.dismiss?.();
      if (result.kind === "err") {
        toast.error(result.error?.message || "Có lỗi xảy ra.", {
          title: action === "create" ? "Tạo phòng thất bại" : "Vào phòng thất bại"
        });
        audio.playSfx("error");
        triggerShake();
        flash(humanize(result.error, action));
      }
    },
    [name, code, audio, toast, runCreate, runJoin, flash, triggerShake, t]
  );
  const handleJoinClick = reactExports.useCallback(() => {
    if (stage === "enter-code") {
      if (!name.trim()) {
        flash(t("common.nameRequired"));
        triggerShake();
        return;
      }
      audio.unlock();
      audio.playSfx("buttonClick");
      setStage("submit");
      return;
    }
    submit("join");
  }, [stage, name, audio, submit, flash, triggerShake, t]);
  const prewarmOnHover = reactExports.useCallback(() => {
    fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" }).catch(() => {
    });
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: `landing-page ${shake > 0 ? "form-attention" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "landing-backdrop", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-one" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-two" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stars" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cards-scene", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-sun", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "☼" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "SOL" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-moon", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "☾" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "LUNA" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-eye", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "◉" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "ORACLE" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-star", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "✦" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "ASTRA" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-flame", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "♠" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "IGNIS" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "welcome-panel", "aria-labelledby": "game-title", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "brand-mark", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "✦" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", {})
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "eyebrow", children: t("landing.eyebrow") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "game-title", children: t("landing.title") }),
      t("landing.tagline") && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "tagline", children: t("landing.tagline") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "divider", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("i", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "✧" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("i", {})
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "form",
        {
          className: "player-form",
          noValidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            submit("create");
          },
          ref: formRef,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "player-name", children: t("landing.playerName") }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "name-input-wrap", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "input-icon", children: "♙" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  id: "player-name",
                  name: "playerName",
                  type: "text",
                  maxLength: 24,
                  autoComplete: "nickname",
                  placeholder: t("landing.playerNamePlaceholder"),
                  required: true,
                  value: name,
                  onChange: (e) => setName(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit("create");
                    }
                  }
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "hint", children: "Tên của bạn sẽ được hiển thị trong đấu trường." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "action-row landing-actions", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  className: "action-button primary",
                  type: "submit",
                  id: "create-button",
                  "data-action": "create",
                  disabled: busy,
                  onPointerEnter: prewarmOnHover,
                  onFocus: prewarmOnHover,
                  children: [
                    t("landing.createRoom"),
                    " ",
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "✦" })
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  className: "action-button secondary",
                  type: "button",
                  id: "join-button",
                  "data-action": "join",
                  "data-stage": stage,
                  disabled: busy,
                  onClick: handleJoinClick,
                  onPointerEnter: prewarmOnHover,
                  onFocus: prewarmOnHover,
                  children: [
                    t("landing.joinRoom"),
                    " ",
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: stage === "enter-code" ? "→" : "↳" })
                  ]
                }
              )
            ] }),
            stage === "submit" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "room-actions", id: "room-actions", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "room-code", children: "Mã phòng" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "name-input-wrap", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "input-icon", children: "✦" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    id: "room-code",
                    name: "roomCode",
                    type: "text",
                    maxLength: 6,
                    autoComplete: "off",
                    placeholder: "Nhập mã 6 ký tự",
                    value: code,
                    onChange: (e) => setCode(e.target.value.toUpperCase()),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submit("join");
                      }
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "hint", children: "Nhập mã phòng rồi bấm «Vào phòng» lần nữa." })
            ] }),
            message && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `form-message tone-${message.tone}`, role: "alert", children: message.text }, message.key)
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "corner corner-tl" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "corner corner-tr" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "corner corner-bl" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "corner corner-br" })
  ] }, `shake-${shake}`);
}
function humanize(err, action) {
  const msg = err?.message || "";
  const code = err?.code || "";
  if (code === "invalid_code" || /không hợp lệ|mã phòng không/i.test(msg))
    return "Sai mã phòng. Vui lòng kiểm tra lại mã phòng.";
  if (/timeout|không phản hồi/i.test(msg)) return "Máy chủ không phản hồi. Vui lòng thử lại.";
  if (/network|failed to fetch/i.test(msg)) return "Không kết nối được máy chủ. Kiểm tra CORS hoặc mạng.";
  if (/room_full|đủ người/i.test(msg)) return "Phòng đã đủ người chơi.";
  if (/game_already_started|đã bắt đầu/i.test(msg)) return "Phòng đã bắt đầu chơi rồi.";
  return msg || (action === "join" ? "Vào phòng thất bại." : "Tạo phòng thất bại.");
}
const SessionContext = reactExports.createContext(null);
const SESSION_EVENT = "arcana:session";
function emitSessionChange(next) {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: next }));
  } catch (_) {
  }
}
function SessionProvider({ children }) {
  const [session, setSession] = reactExports.useState(() => loadSession());
  reactExports.useEffect(() => {
    function onCustom(e) {
      setSession(e.detail === void 0 ? loadSession() : e.detail);
    }
    function onStorage(e) {
      if (e.key === "arcana.session.v1") {
        try {
          setSession(e.newValue ? JSON.parse(e.newValue) : null);
        } catch (_) {
          setSession(null);
        }
      }
    }
    window.addEventListener(SESSION_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const update = reactExports.useCallback((next) => {
    setSession(next);
    if (next) saveSession(next);
    else clearSession();
    emitSessionChange(next);
  }, []);
  const patch = reactExports.useCallback((partial) => {
    setSession((prev) => {
      const merged = prev ? { ...prev, ...partial } : partial;
      if (merged) saveSession(merged);
      emitSessionChange(merged);
      return merged;
    });
  }, []);
  const clear = reactExports.useCallback(() => {
    setSession(null);
    clearSession();
    emitSessionChange(null);
  }, []);
  const value = reactExports.useMemo(
    () => ({ session, update, patch, clear }),
    [session, update, patch, clear]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SessionContext.Provider, { value, children });
}
function useSession() {
  const ctx = reactExports.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
const POLL_INTERVAL_MS = 2500;
function useRoomPolling(roomId, { enabled = true, memberId = null } = {}) {
  const [room, setRoom] = reactExports.useState(null);
  const [error, setError] = reactExports.useState(null);
  const stoppedRef = reactExports.useRef(false);
  const roomIdRef = reactExports.useRef(roomId);
  const enabledRef = reactExports.useRef(enabled);
  const memberIdRef = reactExports.useRef(memberId);
  reactExports.useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  reactExports.useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  reactExports.useEffect(() => {
    memberIdRef.current = memberId;
  }, [memberId]);
  const refresh = reactExports.useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    const currentMemberId = memberIdRef.current;
    if (!currentRoomId || !enabledRef.current) return;
    try {
      const myId = currentMemberId || loadSession()?.playerId || null;
      const body = await roomsApi.snapshot(currentRoomId, myId);
      const next = body.room ?? body;
      setRoom(next);
      setError(null);
      if (next?.status === "playing") stoppedRef.current = true;
      return next;
    } catch (err) {
      setError(err);
    }
  }, []);
  reactExports.useEffect(() => {
    stoppedRef.current = false;
    if (!roomId || !enabled) return void 0;
    refresh();
    const id = setInterval(() => {
      if (!stoppedRef.current) refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [roomId, enabled, refresh]);
  return { room, error, refresh };
}
function useReducedMotion() {
  const [reduced, setReduced] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
const N = 4;
const FANOUT_ORDER = [3, 2, 1, 0];
const FANOUT_STAGGER_MS = 180;
const FANIN_STAGGER_MS = 180;
const ORBIT_RX = 160;
const ORBIT_RY = 130;
const ORBIT_Y_OFFSET = 70;
const ORBIT_X_OFFSET = 20;
const ORBIT_MS = 12e3;
const PHASE_OFFSET = Math.PI * 2 / N;
const WIGGLE_DELAYS = [5e3, 4e3, 2e3];
const FLIGHT_OUT_MS = 1e3;
const FLIGHT_BACK_MS = 1e3;
const REVEAL_HOLD_MS = 2e3;
const REVEAL_THRESH = 0.55;
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
const FLAT_RX = 58;
const FLAT_RZ = -9;
function makeTick({
  flyingCardRefs,
  revealedSetRef,
  flipTimersRef,
  orbitMs,
  flightOutMs,
  flightBackMs,
  onEnd
}) {
  let rafId = 0;
  let startMs = 0;
  const FANIN_ORDER = [0, 1, 2, 3];
  const tickFanIn = (now) => {
    const el = now - startMs;
    const totalDuration = flightBackMs + (N - 1) * FANIN_STAGGER_MS + 300;
    if (el >= totalDuration) {
      cancelAnimationFrame(rafId);
      for (let k = 0; k < N; k += 1) {
        const nd = flyingCardRefs.current[k];
        if (!nd) continue;
        nd.style.transform = "";
        nd.style.opacity = "0";
        nd.style.zIndex = "80";
        nd.classList.remove("revealed");
      }
      onEnd();
      return;
    }
    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;
      const slot = FANIN_ORDER.indexOf(k);
      const delay = slot * FANIN_STAGGER_MS;
      const cardEl = el - delay;
      if (cardEl < 0) {
        nd.style.opacity = "1";
        nd.style.zIndex = String(100 + k);
        continue;
      }
      const prog = clamp(cardEl / flightBackMs, 0, 1);
      const ek = easeInOutCubic(prog);
      const ta = k * PHASE_OFFSET;
      const rx = ORBIT_RX * (1 - ek);
      const ry = ORBIT_RY * (1 - ek);
      const fx = Math.sin(ta) * rx + ORBIT_X_OFFSET * (1 - ek);
      const fy = -Math.cos(ta) * ry + ORBIT_Y_OFFSET * (1 - ek);
      const fsc = 1;
      const rxAngle = FLAT_RX * ek;
      const rzAngle = FLAT_RZ + ta * 8 * ek;
      nd.style.transform = `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) rotateX(${rxAngle.toFixed(1)}deg) rotateZ(${rzAngle.toFixed(1)}deg) scale(${fsc.toFixed(3)})`;
      let opacity = 1;
      if (prog > 0.85) {
        opacity = 1 - (prog - 0.85) / 0.15;
      }
      nd.style.opacity = String(Math.max(0, opacity));
      nd.style.zIndex = String(Math.round(100 - (1 - prog) * 10));
    }
    rafId = requestAnimationFrame(tickFanIn);
  };
  const tickFanOut = (now) => {
    const fanDur = flightOutMs + (N - 1) * FANOUT_STAGGER_MS;
    const el = now - startMs;
    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;
      const slot = FANOUT_ORDER.indexOf(k);
      const delay = slot * FANOUT_STAGGER_MS;
      const cardEl = el - delay;
      if (cardEl < 0) {
        nd.style.transform = `translate(calc(-50% + ${ORBIT_X_OFFSET}px), calc(-50% + ${ORBIT_Y_OFFSET.toFixed(1)}px)) rotateX(${FLAT_RX}deg) rotateZ(${FLAT_RZ}deg) scale(0.3)`;
        nd.style.opacity = "0";
        nd.style.zIndex = String(80 + k);
        continue;
      }
      const prog = clamp(cardEl / flightOutMs, 0, 1);
      const ek = easeOutCubic(prog);
      const ta = k * PHASE_OFFSET;
      const sa = Math.PI / 2;
      const rx = 20 + ek * (ORBIT_RX - 20);
      const ry = 15 + ek * (ORBIT_RY - 15);
      const fx = Math.sin(sa + (ta - sa) * ek) * rx + ORBIT_X_OFFSET;
      const fy = -Math.cos(sa + (ta - sa) * ek) * ry + ORBIT_Y_OFFSET * ek;
      const fsc = 0.3 + ek * 0.7;
      const rxAngle = FLAT_RX * (1 - ek);
      const rzAngle = FLAT_RZ * (1 - ek) + ta * 8 * (1 - ek);
      nd.style.transform = `translate(calc(-50% + ${fx.toFixed(1)}px), calc(-50% + ${fy.toFixed(1)}px)) rotateX(${rxAngle.toFixed(1)}deg) rotateZ(${rzAngle.toFixed(1)}deg) scale(${fsc.toFixed(3)})`;
      nd.style.opacity = String(Math.min(1, 0.1 + ek * 0.9));
      nd.style.zIndex = String(80 + k);
    }
    if (el < fanDur) {
      rafId = requestAnimationFrame(tickFanOut);
    } else {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickOrbit);
    }
  };
  const tickOrbit = (now) => {
    const el = now - startMs;
    if (el >= orbitMs) {
      startMs = performance.now();
      rafId = requestAnimationFrame(tickFanIn);
      return;
    }
    for (let k = 0; k < N; k += 1) {
      const nd = flyingCardRefs.current[k];
      if (!nd) continue;
      const ba = el / orbitMs * Math.PI * 2;
      const a = ba + k * PHASE_OFFSET;
      const ox = Math.sin(a) * ORBIT_RX + ORBIT_X_OFFSET;
      const oy = -Math.cos(a) * ORBIT_RY + ORBIT_Y_OFFSET;
      const dp = Math.cos(a);
      const osc = 0.92 + 0.18 * (dp + 1) / 2;
      const tX = dp * 4;
      const tZ = Math.sin(a) * 5;
      nd.style.transform = `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px)) rotateX(${tX.toFixed(1)}deg) rotateZ(${tZ.toFixed(1)}deg) scale(${osc.toFixed(3)})`;
      nd.style.zIndex = String(100 + Math.round(dp * 10));
      nd.style.opacity = "1";
      if (dp > REVEAL_THRESH && !revealedSetRef.current.has(k)) {
        revealedSetRef.current.add(k);
        nd.classList.add("revealed");
        if (flipTimersRef.current[k]) clearTimeout(flipTimersRef.current[k]);
        flipTimersRef.current[k] = setTimeout(() => {
          const n = flyingCardRefs.current[k];
          if (n) n.classList.remove("revealed");
          flipTimersRef.current[k] = 0;
        }, REVEAL_HOLD_MS);
      }
    }
    rafId = requestAnimationFrame(tickOrbit);
  };
  return {
    start(ms) {
      startMs = ms;
      rafId = requestAnimationFrame(tickFanOut);
    },
    cancel() {
      cancelAnimationFrame(rafId);
    }
  };
}
function useDeckAnimation({ cardImageUrls }) {
  const reduced = useReducedMotion();
  const [wiggleLevel, setWiggleLevel] = reactExports.useState(0);
  const [isFlying, setIsFlying] = reactExports.useState(false);
  const [phase, setPhase] = reactExports.useState("idle");
  const [flyingCardUrls, setFlyingCardUrls] = reactExports.useState([]);
  const timeoutsRef = reactExports.useRef([]);
  const flyingCardRefs = reactExports.useRef([]);
  const revealedSetRef = reactExports.useRef(/* @__PURE__ */ new Set());
  const flipTimersRef = reactExports.useRef(Array(N).fill(0));
  const rafRunnerRef = reactExports.useRef(null);
  const clearAll = () => {
    for (const id of timeoutsRef.current) clearTimeout(id);
    timeoutsRef.current = [];
    rafRunnerRef.current?.cancel();
    rafRunnerRef.current = null;
    for (const t of flipTimersRef.current) if (t) clearTimeout(t);
    flipTimersRef.current = Array(N).fill(0);
  };
  reactExports.useEffect(() => () => clearAll(), []);
  reactExports.useEffect(() => {
    if (!reduced) return void 0;
    setPhase("idle");
    setWiggleLevel(0);
    const id = setInterval(() => {
      setPhase("flying");
      setTimeout(() => setPhase("idle"), 3e3);
    }, 12e3);
    timeoutsRef.current.push(id);
    return () => clearAll();
  }, [reduced]);
  reactExports.useEffect(() => {
    if (reduced) return void 0;
    if (phase !== "idle") return void 0;
    if (wiggleLevel < 3) {
      const delay = WIGGLE_DELAYS[wiggleLevel];
      const id = setTimeout(() => setWiggleLevel((w) => w + 1), delay);
      timeoutsRef.current.push(id);
      return () => clearAll();
    }
    if (wiggleLevel === 3) {
      const pool = Array.isArray(cardImageUrls) ? cardImageUrls : [];
      if (pool.length >= N) {
        const copy = [...pool];
        for (let k = copy.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1));
          [copy[k], copy[r]] = [copy[r], copy[k]];
        }
        setFlyingCardUrls(copy.slice(0, N));
      } else {
        setFlyingCardUrls(Array(N).fill(""));
      }
      revealedSetRef.current = /* @__PURE__ */ new Set();
      flipTimersRef.current = Array(N).fill(0);
      setIsFlying(true);
      setPhase("flying");
    }
    return () => clearAll();
  }, [phase, wiggleLevel, reduced, cardImageUrls]);
  reactExports.useEffect(() => {
    if (reduced) return void 0;
    if (phase !== "flying") {
      rafRunnerRef.current?.cancel();
      rafRunnerRef.current = null;
      return void 0;
    }
    const onEnd = () => {
      setIsFlying(false);
      setPhase("idle");
      setWiggleLevel(0);
    };
    rafRunnerRef.current = makeTick({
      flyingCardRefs,
      revealedSetRef,
      flipTimersRef,
      orbitMs: ORBIT_MS,
      flightOutMs: FLIGHT_OUT_MS,
      flightBackMs: FLIGHT_BACK_MS,
      onEnd
    });
    rafRunnerRef.current.start(performance.now());
    return () => {
      rafRunnerRef.current?.cancel();
      rafRunnerRef.current = null;
    };
  }, [phase, reduced, flyingCardUrls]);
  return {
    wiggleLevel,
    isFlying,
    phase,
    flyingCardRefs,
    flyingCardUrls
  };
}
function handleImgError(e) {
  const parent = e.currentTarget?.parentElement;
  if (!parent) return;
  e.currentTarget.style.display = "none";
  parent.style.background = "linear-gradient(135deg, #1a1a4e, #0d0d2e)";
  parent.style.border = "1.5px solid rgba(255,200,100,0.4)";
}
function handleFaceError(e) {
  const parent = e.currentTarget?.parentElement;
  if (!parent) return;
  e.currentTarget.style.display = "none";
  parent.style.background = "linear-gradient(135deg, #2d1a5e, #1a0d3e)";
  parent.style.border = "1.5px solid rgba(168,85,247,0.5)";
  parent.style.display = "flex";
  parent.style.alignItems = "center";
  parent.style.justifyContent = "center";
  parent.style.fontSize = "48px";
  parent.style.color = "rgba(168,85,247,0.6)";
  parent.textContent = "★";
}
function FlyingCards({ refs, faceUrls, backUrl }) {
  const items = [];
  for (let i = 0; i < 4; i += 1) {
    const faceUrl = faceUrls[i];
    const hasValidUrl = faceUrl && faceUrl.length > 0 && faceUrl.startsWith("http");
    items.push(
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          ref: (el) => {
            refs.current[i] = el;
          },
          className: "flying-card",
          "data-index": i,
          "aria-hidden": "true",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-face card-back-face", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: backUrl,
                alt: "",
                className: "card-back-img",
                draggable: "false",
                onError: handleImgError
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-face card-front-face", children: hasValidUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: faceUrl,
                alt: "",
                className: "card-img",
                draggable: "false",
                onError: handleFaceError
              }
            ) : null })
          ]
        },
        i
      )
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flying-cards-container", children: items });
}
const SLOTS_PER_SIDE = 4;
function Seats({ side, members, myId, onPickAvatar, onToggleReady }) {
  const all = Array.isArray(members) ? members : [];
  const host = all.find((m) => m.isHost) || null;
  const others = all.filter((m) => !m.isHost);
  const leftMembers = [];
  const rightMembers = [];
  for (let i = 0; i < others.length; i += 1) {
    if (i % 2 === 0) rightMembers.push(others[i]);
    else leftMembers.push(others[i]);
  }
  const list = side === "left" ? [host, ...leftMembers].filter(Boolean).slice(0, SLOTS_PER_SIDE) : rightMembers.slice(0, SLOTS_PER_SIDE);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: `seats-list seats-${side}-list`, role: "list", children: list.map((m, i) => {
    const isMe = m.id === myId;
    const avatarBg = m.avatar?.color || "linear-gradient(135deg,#2a2f6a,#16193d)";
    const avatarIcon = m.avatar?.icon || "♟";
    const isReady = !!m.isReady;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "li",
      {
        className: `seat ${isMe ? "seat-me" : ""} ${m.isHost ? "seat-host" : ""} ${isReady ? "seat-ready" : ""}`,
        "aria-label": `${m.name}${m.isHost ? " (chủ phòng)" : ""}${isReady ? " - sẵn sàng" : ""}`,
        style: { animationDelay: `${i * 60}ms` },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              className: "seat-avatar",
              style: isMe ? { background: avatarBg } : void 0,
              onClick: () => isMe && onPickAvatar?.(m.id),
              disabled: !isMe,
              "aria-label": isMe ? "Đổi avatar của bạn" : `Avatar của ${m.name}`,
              title: isMe ? "Đổi avatar" : void 0,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "seat-avatar__icon", "aria-hidden": "true", children: avatarIcon }),
                isReady && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "seat-ready-badge", "aria-hidden": "true", children: "✓" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "seat-info", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "seat-name", children: [
              m.name,
              isMe ? " (bạn)" : ""
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "seat-tag", children: m.isHost ? "Chủ phòng" : isReady ? "Sẵn sàng" : "Đang chờ" })
          ] }),
          !m.isHost && isMe && onToggleReady && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: `seat-ready-btn ${isReady ? "is-ready" : ""}`,
              onClick: () => onToggleReady(m.id),
              "aria-pressed": isReady,
              children: isReady ? "Hủy sẵn sàng" : "Sẵn sàng"
            }
          ),
          m.isHost && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "seat-crown", "aria-hidden": "true", children: "👑" })
        ]
      },
      m.id
    );
  }) });
}
const ICONS = ["♟", "♛", "♜", "♞", "♝", "⚔", "🐱", "🐭", "🧙", "🦊", "🐺", "🦁", "🐲", "🌙", "☀", "✦", "✧", "♬", "♕", "♔", "👑", "🃏", "🎴"];
const COLORS = [
  "#7c5cff",
  // royal purple
  "#ff5d8f",
  // hot pink
  "#5ddc8f",
  // emerald
  "#ffb84a",
  // gold
  "#3399ff",
  // ocean blue
  "#ff6f3c",
  // ember orange
  "#a855f7",
  // amethyst
  "#f43f5e",
  // crimson
  "#14b8a6",
  // teal
  "#eab308",
  // sunshine
  "#0ea5e9",
  // sky
  "#ef4444"
  // ruby
];
function AvatarPicker({ initial, onSelect, onClose }) {
  const [icon, setIcon] = reactExports.useState(initial?.icon || "♟");
  const [color, setColor] = reactExports.useState(initial?.color || COLORS[0]);
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "avatar-picker", ref, role: "dialog", "aria-label": "Chọn avatar", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "avatar-picker__title", children: "Chọn avatar của bạn" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "avatar-picker__preview", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "avatar-picker__icon", style: { background: color }, children: icon }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "avatar-picker__section", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "avatar-picker__label", children: "Biểu tượng" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "avatar-picker__icons", children: ICONS.map((i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `avatar-picker__icon-btn ${i === icon ? "is-active" : ""}`,
          onClick: () => setIcon(i),
          "aria-pressed": i === icon,
          children: i
        },
        i
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "avatar-picker__section", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "avatar-picker__label", children: "Màu nền" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "avatar-picker__colors", children: COLORS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `avatar-picker__color-btn ${c === color ? "is-active" : ""}`,
          style: { background: c },
          onClick: () => setColor(c),
          "aria-label": `Màu ${c}`,
          "aria-pressed": c === color
        },
        c
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "avatar-picker__actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "avatar-picker__btn avatar-picker__btn--ghost", onClick: onClose, children: "Huỷ" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "avatar-picker__btn avatar-picker__btn--primary",
          onClick: () => onSelect?.({ icon, color }),
          children: "Lưu"
        }
      )
    ] })
  ] });
}
const CARD_CLOUDINARY = {
  cards: {
    "back": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/back_knmzmp.svg",
    "attack": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/attack-1_mmeqna.svg",
    "attack-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/attack-1_mmeqna.svg",
    "bomb": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/bomb-1_beeqmk.svg",
    "bomb-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/bomb-1_beeqmk.svg",
    "defuse": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/defuse-1_kezwhy.svg",
    "defuse-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/defuse-1_kezwhy.svg",
    "favor": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/favor-1_wuf8qh.svg",
    "favor-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156350/favor-1_wuf8qh.svg",
    "future": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156351/future-1_spt8eo.svg",
    "future-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156351/future-1_spt8eo.svg",
    "nope": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/nope-1_nestwa.svg",
    "nope-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/nope-1_nestwa.svg",
    "robot": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/robot_admqff.svg",
    "shuffle": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/shuffle-1_qhmijp.svg",
    "shuffle-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/shuffle-1_qhmijp.svg",
    "skip": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/skip-1_bdunf1.svg",
    "skip-1": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/skip-1_bdunf1.svg",
    "ninja": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156353/ninja_geqbzr.svg",
    "superman": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156354/superman_by7urw.svg",
    "zombie": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156354/zombie_zlgrvj.svg",
    "hải tặc": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/h%E1%BA%A3i_t%E1%BA%B7c_psrudy.svg",
    "hải-tặc": "https://res.cloudinary.com/ssoic87m/image/upload/v1785156352/h%E1%BA%A3i_t%E1%BA%B7c_psrudy.svg"
  }
};
function cardImageUrl(key) {
  if (!key) return CARD_CLOUDINARY.cards.back;
  return CARD_CLOUDINARY.cards[key] || CARD_CLOUDINARY.cards.back;
}
const CARD_URLS = Object.entries(CARD_CLOUDINARY.cards || {}).filter(([key]) => key !== "back").map(([, url]) => url);
const CARD_BACK_URL = CARD_CLOUDINARY.cards?.back;
function readSessionRoomId() {
  try {
    const raw = sessionStorage.getItem("arcana.session.v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.roomId || null;
  } catch (_) {
    return null;
  }
}
const GAME_MODES = [
  {
    id: "exploding-cats",
    title: "Đừng rút lá đó",
    tagline: "",
    deckLabel: "ĐỪNG RÚT LÁ NÀY!",
    implemented: true
  },
  {
    id: "coming-soon-1",
    title: "Trò chơi đang phát triển",
    tagline: "",
    deckLabel: "COMING SOON",
    implemented: false
  },
  {
    id: "coming-soon-2",
    title: "Trò chơi đang phát triển",
    tagline: "",
    deckLabel: "COMING SOON",
    implemented: false
  }
];
function LobbyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const audio = useAudio();
  const toast = useToast();
  const { t } = useI18n();
  const settings = useSettings();
  const [codeVisible, setCodeVisible] = reactExports.useState(false);
  const [copyState, setCopyState] = reactExports.useState("idle");
  const [modeIndex, setModeIndex] = reactExports.useState(0);
  const mode = GAME_MODES[modeIndex];
  const [pickerOpen, setPickerOpen] = reactExports.useState(false);
  const pickerAnchorRef = reactExports.useRef(null);
  const [optimisticReady, setOptimisticReady] = reactExports.useState(null);
  const deckAnimation = useDeckAnimation({ cardImageUrls: CARD_URLS });
  const roomId = session.session?.roomId;
  const isPending = !roomId || typeof roomId === "string" && roomId.startsWith("PENDING-");
  const pollRoomId = isPending ? null : roomId;
  const myPlayerId = session.session?.playerId;
  const { room, error: roomError, refresh } = useRoomPolling(pollRoomId, { memberId: myPlayerId });
  const displayCode = room?.code || session.session?.roomCode || "";
  const isPlaceholderCode = displayCode && (displayCode.startsWith("PENDING") || !/^[A-Z0-9]{6}$/.test(displayCode));
  const hasRealCode = displayCode && displayCode.length === 6 && !isPlaceholderCode;
  const showCode = codeVisible && hasRealCode;
  const localAvatar = session.session?.avatar;
  const myIsHost = session.session?.isHost;
  const members = reactExports.useMemo(() => {
    const list = room?.members || [];
    const merged = list.map((m) => {
      if (m.id === myPlayerId) {
        const overlay = optimisticReady !== null ? { isReady: optimisticReady } : {};
        return { ...m, avatar: localAvatar, isHost: myIsHost, ...overlay };
      }
      return m;
    });
    if (myPlayerId && !merged.some((m) => m.id === myPlayerId) && (isPending || merged.length === 0)) {
      merged.push({
        id: myPlayerId,
        name: session.session?.playerName || "Bạn",
        isHost: !!session.session?.isHost,
        isReady: !!optimisticReady,
        joinedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return merged;
  }, [room, localAvatar, myIsHost, myPlayerId, isPending, session.session?.playerName, optimisticReady]);
  reactExports.useEffect(() => {
    const fromStorage = session.session?.roomId || readSessionRoomId();
    if (!fromStorage && location.pathname.startsWith(ROUTES.lobby)) {
      navigate(ROUTES.landing, { replace: true });
    }
    fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" }).catch(() => {
    });
  }, [session.session, location.pathname, navigate]);
  reactExports.useEffect(() => {
    if (!pollRoomId) return void 0;
    const myId = session.session?.playerId;
    if (!myId) return void 0;
    let cancelled = false;
    const ping = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      try {
        await roomsApi.heartbeat(pollRoomId, myId);
      } catch (_) {
      }
    };
    ping();
    const id = setInterval(ping, 15e3);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollRoomId, session.session?.playerId]);
  reactExports.useEffect(() => {
    if (!pollRoomId) return void 0;
    const myId = session.session?.playerId;
    if (!myId) return void 0;
    const leaveUrl = `${API_BASE_URL}/api/rooms/${pollRoomId}/members/${myId}/leave`;
    let sentLeave = false;
    const sendLeave = () => {
      if (sentLeave) return;
      sentLeave = true;
      try {
        const blob = new Blob([JSON.stringify({})], { type: "application/json" });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(leaveUrl, blob);
        }
      } catch (_) {
      }
    };
    const handleOnline = () => {
      refresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        roomsApi.heartbeat(pollRoomId, myId).then(() => refresh()).catch(() => {
        });
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", sendLeave);
    window.addEventListener("beforeunload", sendLeave);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", sendLeave);
      window.removeEventListener("beforeunload", sendLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pollRoomId, session.session?.playerId, refresh]);
  reactExports.useEffect(() => {
    const myMember2 = members?.find((m) => m.id === session.session?.playerId);
    const isHost2 = session.session?.isHost && myMember2?.isHost;
    if (!room || !isHost2) {
      settings.registerTabs([]);
      return;
    }
    settings.registerTabs([
      {
        id: "members",
        label: "Thành viên",
        render: () => /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "settings-member-list", children: members.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "settings-member", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            m.name,
            m.isHost ? " 👑" : ""
          ] }),
          !m.isHost && m.id !== session.session.playerId && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "settings-button-danger",
              "data-action": "kick",
              "data-payload": JSON.stringify({ memberId: m.id }),
              children: "Kick"
            }
          )
        ] }, m.id)) }),
        onAction: async (action, payload) => {
          if (action === "kick") {
            try {
              await roomsApi.kick(roomId, session.session.playerId, payload.memberId);
              refresh();
            } catch (e) {
              toast.error("Kick thất bại.");
            }
          }
        }
      }
    ]);
  }, [members, session.session, settings, roomId, refresh, toast]);
  reactExports.useEffect(() => {
    if (room?.status === "playing") {
      navigate(ROUTES.game(roomId), { replace: true });
    }
  }, [room, navigate, roomId]);
  reactExports.useEffect(() => {
    if (optimisticReady === null) return;
    const myId = session.session?.playerId;
    if (!myId) return;
    const me = room?.members?.find((m) => m.id === myId);
    if (!me) return;
    if (!!me.isReady === optimisticReady) {
      setOptimisticReady(null);
    }
  }, [room?.members, session.session?.playerId, optimisticReady]);
  const offlineAtRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!room || !session.session?.playerId) return;
    const me = room.members.find((m) => m.id === session.session.playerId);
    if (me) {
      offlineAtRef.current = null;
      return;
    }
    if (!offlineAtRef.current) offlineAtRef.current = Date.now();
    const stillOfflineAfter = Date.now() - offlineAtRef.current > 3e3;
    if (stillOfflineAfter) {
      session.clear();
      navigate(ROUTES.landing, { replace: true });
    }
  }, [room, session.session, session, navigate]);
  const handleCopy = reactExports.useCallback(async () => {
    const code = room?.code || session.session?.roomCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
      audio.playSfx("playerJoin");
      toast.success(t("lobby.copied"), { duration: 1500 });
      setTimeout(() => setCopyState("idle"), 1500);
    } catch (e) {
      toast.error("Không thể sao chép. Hãy copy thủ công.");
    }
  }, [room, session.session, audio, toast, t]);
  const handleLeave = reactExports.useCallback(async () => {
    audio.playSfx("buttonClick");
    try {
      const cur = loadSession();
      if (cur?.playerId && cur?.roomId && !cur.playerId.startsWith("pending-")) {
        await roomsApi.leave(cur.roomId, cur.playerId);
      }
    } catch (_) {
    }
    session.clear();
    navigate(ROUTES.landing);
  }, [audio, navigate, session]);
  const handleToggleReady = reactExports.useCallback(async () => {
    const myId = session.session?.playerId;
    if (!myId || !roomId) return;
    const me = members.find((m) => m.id === myId);
    const nextIsReady = me ? !me.isReady : true;
    setOptimisticReady(nextIsReady);
    audio.playSfx("buttonClick");
    try {
      await roomsApi.setReady(roomId, myId, nextIsReady);
      refresh();
    } catch (e) {
      setOptimisticReady(me?.isReady ?? false);
      toast.error(e.message || "Không cập nhật được trạng thái sẵn sàng.");
    }
  }, [audio, roomId, session.session, members, refresh, toast]);
  const allOtherPlayersReady = reactExports.useMemo(() => {
    if (!members || members.length <= 1) return false;
    const nonHost = members.filter((m) => !m.isHost);
    if (nonHost.length === 0) return false;
    return nonHost.every((m) => m.isReady);
  }, [members]);
  const handleStart = reactExports.useCallback(async () => {
    audio.playSfx("buttonClick");
    if (!allOtherPlayersReady) {
      toast.error("Tất cả người chơi phải sẵn sàng trước khi bắt đầu.");
      return;
    }
    try {
      await roomsApi.startGame(roomId, session.session.playerId);
      refresh();
    } catch (e) {
      toast.error(e.message || "Không bắt đầu được ván.");
    }
  }, [audio, roomId, session.session, refresh, toast, allOtherPlayersReady]);
  const handlePrevMode = reactExports.useCallback(() => {
    audio.playSfx("buttonClick");
    setModeIndex((i) => (i - 1 + GAME_MODES.length) % GAME_MODES.length);
  }, [audio]);
  const handleNextMode = reactExports.useCallback(() => {
    audio.playSfx("buttonClick");
    setModeIndex((i) => (i + 1) % GAME_MODES.length);
  }, [audio]);
  const handleAvatarSelect = reactExports.useCallback(
    (avatar) => {
      const cur = loadSession();
      if (!cur) return;
      saveSession({ ...cur, avatar });
      session.patch({ avatar });
      setPickerOpen(false);
      audio.playSfx("buttonClick");
      toast.success("Đã cập nhật avatar của bạn.", { duration: 1500 });
    },
    [audio, session, toast]
  );
  const myMember = reactExports.useMemo(
    () => members?.find((m) => m.id === session.session?.playerId),
    [members, session.session]
  );
  const isHost = myMember?.isHost || isPending && session.session?.isHost;
  const MIN_PLAYERS = 3;
  const canStart = isHost && room && room.status === "waiting" && (members?.length ?? 0) >= MIN_PLAYERS && allOtherPlayersReady;
  const playerCount = Math.max(members?.length ?? 0, 1);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "lobby-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "lobby-backdrop", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-one" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ambient ambient-two" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stars" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cards-scene", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-sun", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "☼" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "SOL" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-moon", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "☾" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "LUNA" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-eye", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "◉" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "ORACLE" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "floating-card card-star", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-glyph", children: "✦" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "card-title", children: "ASTRA" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: ROUTES.landing, className: "back-link", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "←" }),
      " Quay lại"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: "settings-button",
        "aria-label": "Cài đặt",
        onClick: () => {
          audio.unlock();
          settings.open();
        },
        children: "⚙"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "lobby-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "eyebrow", children: t("lobby.title") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "lobby-title", children: isPending ? "Đang khởi tạo phòng..." : room ? "Đang triệu hồi đồng đội..." : t("lobby.subtitle") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "invite-card", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "invite-label", children: t("lobby.inviteCode") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "invite-code-row", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "code-visibility",
              "aria-pressed": codeVisible,
              "aria-label": "Ẩn/hiện mã phòng",
              onClick: () => setCodeVisible((v) => !v),
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "eye-icon", "data-state": codeVisible ? "visible" : "hidden", "aria-hidden": "true", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 24 24", className: "eye-open", width: "20", height: "20", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinejoin: "round" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "3", fill: "currentColor" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 24 24", className: "eye-closed", width: "20", height: "20", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 3l18 18", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 12s3.5-7 10-7c2.4 0 4.4.9 6 1.9M22 12s-3.5 7-10 7c-2.4 0-4.4-.9-6-1.9", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinejoin: "round" })
                ] })
              ] })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "invite-code", id: "invite-code", children: showCode ? displayCode : "••••••" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              className: `copy-button ${copyState === "copied" ? "is-copied" : ""} ${!displayCode ? "is-error" : ""}`,
              onClick: handleCopy,
              disabled: !displayCode,
              title: displayCode ? "Sao chép mã phòng" : "Đang chờ mã phòng...",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "copy-button__label", children: copyState === "copied" ? t("lobby.copied") : t("lobby.copy") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "copy-button__check", "aria-hidden": "true", children: "✓" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "invite-hint", children: t("lobby.shareHint") })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "stage", "aria-label": "Sân khấu chính", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "seats seats-left", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Seats,
        {
          side: "left",
          members,
          myId: session.session?.playerId,
          onPickAvatar: () => setPickerOpen(true),
          onToggleReady: handleToggleReady
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "deck-area", ref: pickerAnchorRef, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "deck-arrow deck-arrow-prev",
            "aria-label": "Chế độ chơi trước",
            onClick: handlePrevMode,
            children: "‹"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "deck-stage", children: mode.implemented ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: `deck-pile ${deckAnimation.wiggleLevel ? `wiggle-${deckAnimation.wiggleLevel}` : "idle"}`,
              "data-flying": deckAnimation.isFlying ? "1" : "0",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "deck-stack", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 11 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 10 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 9 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 8 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 7 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 6 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 5 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 4 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 3 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 2 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer", style: { "--i": 1 } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-stack__layer deck-stack__layer--top", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "img",
                    {
                      src: CARD_BACK_URL,
                      alt: "",
                      draggable: "false"
                    }
                  ) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "deck-pile__glow", "aria-hidden": "true" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            FlyingCards,
            {
              refs: deckAnimation.flyingCardRefs,
              faceUrls: deckAnimation.flyingCardUrls,
              backUrl: CARD_BACK_URL
            }
          )
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "deck-coming-soon", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "deck-coming-soon__qmark", "aria-hidden": "true", children: "?" }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "deck-arrow deck-arrow-next",
            "aria-label": "Chế độ chơi tiếp theo",
            onClick: handleNextMode,
            children: "›"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "deck-caption", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "deck-label", children: mode.deckLabel }),
          mode.tagline && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "deck-subtitle", children: mode.tagline })
        ] }),
        pickerOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
          AvatarPicker,
          {
            initial: session.session?.avatar,
            onSelect: handleAvatarSelect,
            onClose: () => setPickerOpen(false)
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "seats seats-right", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Seats,
        {
          side: "right",
          members,
          myId: session.session?.playerId,
          onPickAvatar: () => setPickerOpen(true),
          onToggleReady: handleToggleReady
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "lobby-footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "player-count", children: t("lobby.playerCount", { count: playerCount }) }),
      isHost && (members?.length ?? 0) < 3 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "lobby-footer__hint", children: [
        "Cần ít nhất 3 người chơi để bắt đầu. Hiện có ",
        members?.length ?? 1,
        "/3."
      ] }),
      isHost && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "start-button",
          disabled: !canStart,
          onClick: handleStart,
          children: t("lobby.startGame")
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "leave-button", onClick: handleLeave, children: t("lobby.leave") })
    ] }),
    roomError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "lobby-error", role: "alert", children: String(roomError.message || roomError) })
  ] });
}
const GamePage = reactExports.lazy(() => __vitePreload(() => import("./GamePage-CKHhfxkF.js"), true ? __vite__mapDeps([0,1,2,3,4,5]) : void 0));
function App() {
  const location = useLocation();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(ErrorBoundary, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(AmbientBackdrop, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(RouteAnnouncer, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxRuntimeExports.jsx(LoadingScreen, {}), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Routes, { location, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { path: ROUTES.landing, element: /* @__PURE__ */ jsxRuntimeExports.jsx(LandingPage, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { path: ROUTES.lobby, element: /* @__PURE__ */ jsxRuntimeExports.jsx(LobbyPage, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { path: "/game/:roomId", element: /* @__PURE__ */ jsxRuntimeExports.jsx(GamePage, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { path: "*", element: /* @__PURE__ */ jsxRuntimeExports.jsx(Navigate, { to: ROUTES.landing, replace: true }) })
    ] }, location.pathname) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsModalRoot, {})
  ] });
}
function AppProviders({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(I18nProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ToastProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SessionProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsProvider, { children }) }) }) });
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      reg.unregister().catch(() => {
      });
    });
  });
}
const container = document.getElementById("root");
if (!container) {
  throw new Error("Arcana: #root not found in index.html");
}
createRoot(container).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(BrowserRouter, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(AppProviders, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(App, {}) }) }) })
);
export {
  API_BASE_URL as A,
  CARD_CLOUDINARY as C,
  ROUTES as R,
  useToast as a,
  useAudio as b,
  cardImageUrl as c,
  roomsApi as r,
  useSession as u
};
