// Top-level providers. Order matters: outer providers are visible to inner
// ones, so put the deepest primitives first.

import React from "react";
import { I18nProvider } from "@shared/i18n/i18n.jsx";
import { ToastProvider } from "@shared/ui/toast.jsx";
import { SessionProvider } from "./session.jsx";
import { SettingsProvider } from "./settings.jsx";

export function AppProviders({ children }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <SessionProvider>
          <SettingsProvider>{children}</SettingsProvider>
        </SessionProvider>
      </ToastProvider>
    </I18nProvider>
  );
}