import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ROUTES } from "@config/env.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { LoadingScreen } from "../components/LoadingScreen.jsx";
import { SettingsModalRoot } from "../components/SettingsModalRoot.jsx";
import { RouteAnnouncer } from "../components/RouteAnnouncer.jsx";
import { AmbientBackdrop } from "../components/AmbientBackdrop.jsx";

// Static imports for all routes — eliminates the lazy-loading chunk-404 problem
// on Netlify where the fallback (index.html) may be served for stale chunks.
import LandingPage from "../pages/landing/LandingPage.jsx";
import LobbyPage from "../pages/lobby/LobbyPage.jsx";
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