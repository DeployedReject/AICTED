import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { lazy, Suspense } from "react";
const IdentityPages = lazy(() => import("./IdentityPages"));
const Workspace = lazy(() => import("./workspace/Workspace"));
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname === "/reset" || location.pathname === "/it/setup" ? (
      <Suspense
        fallback={
          <div className="boot-skeleton" aria-label="Loading" role="status">
            <i />
            <i />
          </div>
        }
      >
        <IdentityPages />
      </Suspense>
    ) : location.pathname.startsWith("/workspace") ||
      location.pathname.startsWith("/it/workspace") ? (
      <Suspense
        fallback={
          <div className="boot-skeleton" role="status" aria-label="Loading">
            <i />
            <i />
            <i />
          </div>
        }
      >
        <Workspace />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
