import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { installDomMutationGuard } from "./lib/domMutationGuard";
import "./styles/app.css";

installDomMutationGuard();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
