// Toast — React port of the previous vanilla toast.js. Uses a portal at
// document.body so toasts escape any container styling, and exposes the
// `useToast()` hook so any component can call toast.success(...) etc.
//
// API kept identical to the old module: toast.success / toast.error /
// toast.info / toast.warning. Plus a useToast() hook for components that
// want a stable reference inside useCallback.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { createPortal } from "react-dom";

const ICONS = {
  error: "⚠",
  success: "✓",
  info: "ℹ",
  warning: "!",
};

const DEFAULT_DURATION = 4500;

const ToastReactContext = createContext(null);

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

export function ToastProvider({ children }) {
  const [toasts, dispatch] = useReducer(reducer, []);
  const idCounter = useRef(0);
  const hostRef = useRef(null);

  useEffect(() => {
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

  const dismiss = useCallback((id) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  const show = useCallback(
    (message, options = {}) => {
      const tone = options.tone || "info";
      const duration = options.duration ?? DEFAULT_DURATION;
      const id = ++idCounter.current;
      const toast = {
        id,
        message,
        title: options.title,
        tone,
        duration,
        action: options.action,
        createdAt: Date.now(),
      };
      dispatch({ type: "ADD", toast });
      if (duration > 0) {
        setTimeout(() => dispatch({ type: "REMOVE", id }), duration);
      }
      return {
        id,
        dismiss: () => dispatch({ type: "REMOVE", id }),
      };
    },
    [],
  );

  const api = useMemo(
    () => ({
      show,
      success: (msg, opts) => show(msg, { ...opts, tone: "success" }),
      error: (msg, opts) => show(msg, { ...opts, tone: "error" }),
      info: (msg, opts) => show(msg, { ...opts, tone: "info" }),
      warning: (msg, opts) => show(msg, { ...opts, tone: "warning" }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastReactContext.Provider value={api}>
      {children}
      {hostRef.current ? createPortal(<ToastList toasts={toasts} onDismiss={dismiss} />, hostRef.current) : null}
    </ToastReactContext.Provider>
  );
}

function ToastList({ toasts, onDismiss }) {
  return (
    <ul className="arc-toast-stack" role="list">
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </ul>
  );
}

function ToastView({ toast, onDismiss }) {
  const handleClose = () => onDismiss(toast.id);
  return (
    <li
      className={`arc-toast arc-toast--${toast.tone} arc-toast--enter`}
      role={toast.tone === "error" ? "alert" : "status"}
    >
      <span className="arc-toast__icon" aria-hidden="true">{ICONS[toast.tone] || "·"}</span>
      <div className="arc-toast__body">
        {toast.title && <strong className="arc-toast__title">{toast.title}</strong>}
        <span className="arc-toast__message">{toast.message}</span>
      </div>
      <button
        type="button"
        className="arc-toast__close"
        aria-label="Đóng"
        onClick={handleClose}
      >
        ✕
      </button>
    </li>
  );
}

export function useToast() {
  const ctx = useContext(ToastReactContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// Back-compat named export for any non-component callers.
export const toast = {
  show: (msg, opts) => {
    console.warn("[arcana] toast.show() called outside React tree — ignored");
  },
};