// Stand-in for @clerk/react so README screenshots render without a real session.
import React from "react";

export async function getToken(): Promise<string> {
  return "demo-session";
}

export function useAuth() {
  return { userId: "user_demo" };
}

export function UserButton() {
  return <span aria-label="Account" style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 999, background: "linear-gradient(135deg, #2166f3, #9b5cf6)", color: "#fff", fontSize: 13, fontWeight: 600 }}>MK</span>;
}
