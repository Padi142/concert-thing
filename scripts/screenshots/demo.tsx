import React from "react";
import { createRoot } from "react-dom/client";
import Archive from "../../src/client/Archive";
import Landing from "../../src/client/Landing";
import PublicShow from "../../src/client/PublicShow";
import "../../src/styles.css";

const shareToken = /^\/share\/([A-Za-z0-9]{6})\/?$/.exec(window.location.pathname)?.[1];
const isAdmin = new URLSearchParams(window.location.search).has("admin");

const isLanding = window.location.pathname === "/landing";

createRoot(document.getElementById("root")!).render(
  isLanding ? <Landing /> : shareToken ? <PublicShow token={shareToken} /> : <Archive report={() => undefined} isAdmin={isAdmin} />,
);
