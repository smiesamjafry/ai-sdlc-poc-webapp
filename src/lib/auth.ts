// Demo-only auth for a static site: one seeded account, session kept in localStorage.
// These are fixture credentials for the sample shop, not a real secret.
export const DEMO_USER = { email: "demo@shop.test", password: "demo1234" } as const;

const SESSION_KEY = "pocket-shop.session";

export type LoginResult = { ok: true } | { ok: false; error: string };

export function login(email: string, password: string): LoginResult {
  if (email.trim().toLowerCase() === DEMO_USER.email && password === DEMO_USER.password) {
    localStorage.setItem(SESSION_KEY, email.trim().toLowerCase());
    return { ok: true };
  }
  return { ok: false, error: "Email or password is incorrect." };
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function currentUser(): string | null {
  return localStorage.getItem(SESSION_KEY);
}
