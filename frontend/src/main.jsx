import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App.jsx";
import { AppProviders } from "./app/providers.jsx";
import { bootDiagnostics } from "./app/boot.js";
import "./styles/index.css";

bootDiagnostics();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Arcana: #root not found in index.html");
}

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>,
);