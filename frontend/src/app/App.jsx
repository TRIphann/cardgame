import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ROUTES } from "@config/env.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { LoadingScreen } from "../components/LoadingScreen.jsx";
import { SettingsModalRoot } from "../components/SettingsModalRoot.jsx";
import { RouteAnnouncer } from "../components/RouteAnnouncer.jsx";
import { AmbientBackdrop } from "../components/AmbientBackdrop.jsx";

// Lazy-load heavy routes — Landing is the entry point and should be ready
// immediately, but Lobby and Game can wait until the user navigates.
const LandingPage = lazy(() => import("../pages/landing/LandingPage.jsx"));
const LobbyPage = lazy(() => import("../pages/lobby/LobbyPage.jsx"));
const GamePage = lazy(() => import("../pages/game/GamePage.jsx"));

export default function App() {
  const location = useLocation();

  return (
    <ErrorBoundary>
      <AmbientBackdrop />
      <RouteAnnouncer />
      <Suspense fallback={<LoadingScreen />}>
        <Routes location={location} key={location.pathname}>
          <Route path={ROUTES.landing} element={<LandingPage />} />
          <Route path={ROUTES.lobby} element={<LobbyPage />} />
          <Route path="/game/:roomId" element={<GamePage />} />
          <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
        </Routes>
      </Suspense>
      <SettingsModalRoot />
    </ErrorBoundary>
  );
}