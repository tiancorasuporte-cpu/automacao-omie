import { useSession } from "@tanstack/react-start/server";

import "@/db/client";

export type AuthSessionData = {
  userId: number;
};

function sessionPassword() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return password;
}

export function getSessionConfig() {
  return {
    name: "omie-session",
    password: sessionPassword(),
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: process.env["NODE_ENV"] === "production",
    },
  };
}

export async function getAuthSession() {
  return useSession<AuthSessionData>(getSessionConfig());
}
