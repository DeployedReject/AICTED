import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { lazy, Suspense } from "react";
const Workspace = lazy(() => import("./workspace/Workspace"));
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname.startsWith("/workspace") ? (
      <Suspense
        fallback={<div style={{ padding: 40 }}>Loading workspace…</div>}
      >
        <Workspace />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
