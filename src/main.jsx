import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App.jsx";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

function MissingConvexConfig() {
  return (
    <main className="config-screen">
      <section className="config-panel">
        <div className="brand-mark">H</div>
        <h1>Hyperchat needs a Convex deployment</h1>
        <p>Run <code>npx convex dev</code> in this repo, then restart <code>npm run dev</code>.</p>
        <div className="command-stack">
          <code>npm install</code>
          <code>npx convex dev</code>
          <code>npm run dev</code>
        </div>
      </section>
    </main>
  );
}

const root = createRoot(document.getElementById("root"));

if (!convexUrl) {
  root.render(<MissingConvexConfig />);
} else {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <React.StrictMode>
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </React.StrictMode>
  );
}
