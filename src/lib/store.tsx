import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiProblem, cartToken, cleanupLegacyStorage, endSession, getUser, onAuthChange, refreshSession, setSession, type User } from "./api";
import type { Cart } from "./types";

interface Store {
  user: User | null;
  ready: boolean;
  cart: Cart | null;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshCart: () => Promise<void>;
  addToCart: (variantId: string, quantity?: number) => Promise<void>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  clearCart: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getUser());
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<Cart | null>(null);

  const refreshCart = useCallback(async () => {
    try { setCart(await api<Cart>("/cart")); } catch { /* cart is non-critical on load */ }
  }, []);

  useEffect(() => {
    cleanupLegacyStorage();
    const off = onAuthChange(setUser);
    refreshSession().finally(() => { setReady(true); void refreshCart(); });
    return () => { off(); };
  }, [refreshCart]);

  const afterAuth = useCallback(async (s: { user: User; accessToken: string; refreshToken: string }) => {
    setSession(s);
    const guest = cartToken.get();
    if (guest) {
      try { setCart(await api<Cart>("/cart/merge", { method: "POST", body: { cartToken: guest } })); } catch { /* best effort */ }
      cartToken.clear();
    }
    await refreshCart();
    return s.user;
  }, [refreshCart]);

  const mutateCart = useCallback(async (fn: () => Promise<Cart>) => {
    const next = await fn();
    if (next.cartToken) cartToken.set(next.cartToken);
    setCart(next);
  }, []);

  const value = useMemo<Store>(() => ({
    user, ready, cart,
    login: async (email, password) =>
      afterAuth(await api("/auth/login", { method: "POST", body: { email, password } })),
    register: async (name, email, password) =>
      afterAuth(await api("/auth/register", { method: "POST", body: { name, email, password } })),
    logout: async () => {
      const t = (() => { try { return sessionStorage.getItem("ps.refresh.staff") ?? localStorage.getItem("ps.refresh"); } catch { return null; } })();
      try { await api("/auth/logout", { method: "POST", body: { refreshToken: t ?? undefined } }); } catch { /* ignore */ }
      endSession();
      setCart(null);
    },
    refreshCart,
    addToCart: (variantId, quantity = 1) => mutateCart(() => api<Cart>("/cart/items", { method: "POST", body: { variantId, quantity } })),
    setQuantity: (variantId, quantity) => mutateCart(() => api<Cart>(`/cart/items/${variantId}`, { method: "PATCH", body: { quantity } })),
    removeItem: (variantId) => mutateCart(() => api<Cart>(`/cart/items/${variantId}`, { method: "DELETE" })),
    applyCoupon: (code) => mutateCart(() => api<Cart>("/cart/coupon", { method: "POST", body: { code } })),
    removeCoupon: () => mutateCart(() => api<Cart>("/cart/coupon", { method: "DELETE" })),
    clearCart: () => setCart(null),
  }), [user, ready, cart, afterAuth, refreshCart, mutateCart]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Load data for a page with loading and error states. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: ApiProblem | null; loading: boolean }>({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api<T>(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error: error instanceof ApiProblem ? error : new ApiProblem(0, "UNKNOWN", String(error), ""), loading: false }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
