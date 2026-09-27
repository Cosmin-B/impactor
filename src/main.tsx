import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import WorkplaceApp from "./workplace/WorkplaceApp";
import OpsApp from "./ops/OpsApp";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/bridge") ? (
      <App />
    ) : window.location.pathname.startsWith("/workplace") ? (
      <WorkplaceApp />
    ) : (
      <OpsApp />
    )}
  </React.StrictMode>,
);
