// RouteAnnouncer — updates document.title and announces page transitions to
// screen readers via the live region in <ToastProvider>.

import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

const TITLES = {
  "/": "Arcana — Card Battle",
  "/lobby": "Arcana — Phòng chờ",
};

export function RouteAnnouncer() {
  const location = useLocation();
  useEffect(() => {
    const match = Object.entries(TITLES).find(
      ([prefix]) => location.pathname === prefix || location.pathname.startsWith(prefix + "/"),
    );
    document.title = match ? match[1] : "Arcana";
  }, [location.pathname]);

  return null;
}