import { API_URL, noCacheRequested } from "./env";

/** An application/problem+json error from the API. */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly fix: string,
    readonly fields: Record<string, string> = {},
    readonly body: Record<string, unknown> = {},
  ) {
    super(detail);
  }
}

export type Role = "customer" | "staff" | "admin";
export interface User { id: string; email: string; name: string; role: Role }

const REFRESH_KEY = { customer: "ps.refresh", staff: "ps.refresh.staff" } as const;
const CART_KEY = "ps.cartToken";

let accessToken: string | null = null;
let currentUser: User | null = null;
const listeners = new Set<(u: User | null) => void>();
export const lastCache = { status: "", key: "" };

export const onAuthChange = (fn: (u: User | null) => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(currentUser));

const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
// Staff and admin sessions live in sessionStorage (one tab); customers stay signed in across tabs.
const storeFor = (role: Role) => (role === "customer" ? localStorage : sessionStorage);
const keyFor = (role: Role) => (role === "customer" ? REFRESH_KEY.customer : REFRESH_KEY.staff);

function storedRefresh(): string | null {
  return safe(() => sessionStorage.getItem(REFRESH_KEY.staff) ?? localStorage.getItem(REFRESH_KEY.customer), null);
}
function clearRefresh() {
  safe(() => { sessionStorage.removeItem(REFRESH_KEY.staff); localStorage.removeItem(REFRESH_KEY.customer); }, undefined);
}

export const cartToken = {
  get: () => safe(() => localStorage.getItem(CART_KEY), null),
  set: (t: string) => safe(() => localStorage.setItem(CART_KEY, t), undefined),
  clear: () => safe(() => localStorage.removeItem(CART_KEY), undefined),
};

/** Old static-site keys are ignored and removed on first load. */
export function cleanupLegacyStorage() {
  safe(() => { localStorage.removeItem("pocket-shop.cart"); localStorage.removeItem("pocket-shop.session"); }, undefined);
}

export function setSession(s: { user: User; accessToken: string; refreshToken: string }) {
  accessToken = s.accessToken;
  currentUser = s.user;
  clearRefresh();
  safe(() => storeFor(s.user.role).setItem(keyFor(s.user.role), s.refreshToken), undefined);
  emit();
}

export function endSession() {
  accessToken = null;
  currentUser = null;
  clearRefresh();
  emit();
}

export const getUser = () => currentUser;

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh per tab; across tabs, navigator.locks serialises rotations of the shared token. */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const run = async () => {
    const token = storedRefresh();
    if (!token) return false;
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: token }),
    }).catch(() => null);
    if (!res) return false;
    if (!res.ok) { endSession(); return false; }
    setSession(await res.json());
    return true;
  };
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  const p: Promise<boolean> = locks ? (locks.request("ps-refresh", run) as unknown as Promise<boolean>) : run();
  refreshing = p.finally(() => { refreshing = null; });
  return refreshing;
}

export interface RequestOpts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  retried?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const ct = cartToken.get();
  if (ct && !accessToken) headers["X-Cart-Token"] = ct;
  let url = `${API_URL}/api/v1${path}`;
  if (noCacheRequested() && (opts.method ?? "GET") === "GET") url += (url.includes("?") ? "&" : "?") + "nocache=1";
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    throw new ApiProblem(0, "NETWORK", "Can't reach the store right now.", "Check your connection and try again.");
  }
  if (res.headers.get("X-Cache")) { lastCache.status = res.headers.get("X-Cache")!; lastCache.key = res.headers.get("X-Cache-Key") ?? ""; }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.ok) return data as T;
  if (res.status === 401 && data.code === "TOKEN_EXPIRED" && !opts.retried) {
    if (await refreshSession()) return api<T>(path, { ...opts, retried: true });
  }
  if (res.status === 401 && ["TOKEN_REVOKED", "AUTH_EPOCH_CHANGED", "ACCOUNT_DISABLED"].includes(data.code)) endSession();
  throw new ApiProblem(res.status, data.code ?? "HTTP_" + res.status, data.detail ?? data.title ?? res.statusText,
    data.fix ?? "", data.fields ?? {}, data);
}

export const newIdempotencyKey = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-key`).replace(/[^A-Za-z0-9-]/g, "");
