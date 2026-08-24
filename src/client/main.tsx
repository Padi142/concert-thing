import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import "../styles.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isPublicShare = /^\/share\/((?:[A-Za-z0-9]{6}|[a-f0-9]{64}))\/?$/.test(window.location.pathname);

function MissingClerkConfig() {
  return <main className="grid min-h-screen place-items-center px-5 text-center"><div><h1 className="font-display text-2xl">Authentication is not configured</h1><p className="mt-3 text-muted">Add VITE_CLERK_PUBLISHABLE_KEY and rebuild the app.</p></div></main>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPublicShare
      ? <App />
      : publishableKey
        ? <ClerkProvider publishableKey={publishableKey}><App /></ClerkProvider>
        : <MissingClerkConfig />}
  </React.StrictMode>,
);
