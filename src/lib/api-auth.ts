// Shared session resolver. Reads the signed session cookie set by /api/auth,
// verifies the HMAC, then loads the user from app_users in Supabase.
// Used by every API route that needs an authenticated identity.
import type { NextRequest } from "next/server";
import { verifySessionToken, getUserById, type SafeUser } from "./auth";

export type AuthedUser = SafeUser;
export type Role = SafeUser["role"];

// Async because the user record now lives in Supabase, not memory.
export async function getRequestUser(
  request: NextRequest
): Promise<AuthedUser | null> {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  try {
    return await getUserById(session.userId);
  } catch {
    return null;
  }
}

export function isAdmin(user: AuthedUser | null): boolean {
  return !!user && user.role === "admin";
}

// Convenience: admin OR editor — the two roles allowed to mutate content.
export function isWriter(user: AuthedUser | null): boolean {
  return !!user && (user.role === "admin" || user.role === "editor");
}
