// Shared session resolver for the new Supabase-backed routes.
// Reads the existing dummy-auth cookie until Supabase Auth is wired in.
import type { NextRequest } from "next/server";
import { verifySessionToken, getUserById } from "./auth";

export type AuthedUser = NonNullable<ReturnType<typeof getUserById>>;

export function getRequestUser(request: NextRequest): AuthedUser | null {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  return getUserById(session.userId);
}

export function isAdmin(user: AuthedUser | null): boolean {
  return !!user && user.role === "admin";
}
