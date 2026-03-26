// Dummy authentication system - will be replaced with Supabase
// Users are hardcoded for now

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  email: string;
  avatar?: string;
}

export const USERS: User[] = [
  {
    id: "1",
    username: "admin",
    password: "admin123",
    name: "مدير النظام",
    role: "admin",
    email: "admin@zto.com",
  },
  {
    id: "2",
    username: "writer1",
    password: "writer123",
    name: "أحمد الكاتب",
    role: "editor",
    email: "ahmed@zto.com",
  },
  {
    id: "3",
    username: "writer2",
    password: "writer123",
    name: "سارة المحررة",
    role: "editor",
    email: "sara@zto.com",
  },
  {
    id: "4",
    username: "viewer1",
    password: "viewer123",
    name: "خالد المراجع",
    role: "viewer",
    email: "khaled@zto.com",
  },
];

export function authenticateUser(
  username: string,
  password: string
): Omit<User, "password"> | null {
  const user = USERS.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return null;
  const { password: _, ...safeUser } = user;
  return safeUser;
}

export function getUserById(id: string): Omit<User, "password"> | null {
  const user = USERS.find((u) => u.id === id);
  if (!user) return null;
  const { password: _, ...safeUser } = user;
  return safeUser;
}

export function createSessionToken(userId: string): string {
  // Simple token for dummy auth - will be replaced with JWT/Supabase
  const payload = { userId, exp: Date.now() + 24 * 60 * 60 * 1000 };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function verifySessionToken(
  token: string
): { userId: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
