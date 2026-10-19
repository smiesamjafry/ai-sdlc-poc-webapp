import { useEffect, useState } from "react";
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { API_URL, BUILD_SHA, IS_PREVIEW, debugRequested } from "./lib/env";
import { lastCache } from "./lib/api";
import { StoreProvider, useStore } from "./lib/store";
import { HomePage } from "./pages/Home";
import { ProductsPage } from "./pages/Products";
import { ProductDetailPage } from "./pages/ProductDetail";
import { CartPage } from "./pages/Cart";
import { CheckoutPage } from "./pages/Checkout";
import { OrderPage } from "./pages/Order";
import { LoginPage, RegisterPage } from "./pages/Auth";
import { AccountPage } from "./pages/Account";
import { AdminLayout } from "./admin/AdminLayout";
import { DashboardPage } from "./admin/Dashboard";
import { ProductEditPage, ProductsAdminPage } from "./admin/Products";
import { CategoriesPage, CustomersPage, InventoryPage, OrderAdminPage, OrdersPage, OutboxPage } from "./admin/Operations";
import { PromotionsPage, SettingsPage, SystemPage } from "./admin/Settings";

function Header() {
  const { user, cart, logout } = useStore();
  return (
    <header className="topbar">
      <Link to="/" className="brand">Pocket Shop</Link>
      <nav>
        <NavLink to="/products">Shop</NavLink>
        {!IS_PREVIEW && <NavLink to="/cart">Cart ({cart?.itemCount ?? 0})</NavLink>}
        {user && user.role !== "customer" && <NavLink to="/admin">Admin</NavLink>}
        {user && <NavLink to="/account">Account</NavLink>}
        {!IS_PREVIEW && (user
          ? <button type="button" className="link" onClick={() => void logout()}>Sign out</button>
          : <NavLink to="/login">Sign in</NavLink>)}
      </nav>
    </header>
  );
}

/** Non-blocking notice while the storefront and API are on different releases (e.g. mid-deploy). */
function VersionBanner() {
  const [mismatch, setMismatch] = useState(false);
  useEffect(() => {
    if (BUILD_SHA === "dev") return;
    fetch(`${API_URL}/healthz`).then((r) => r.json()).then((h) => setMismatch(h.version !== "dev" && h.version !== BUILD_SHA)).catch(() => {});
  }, []);
  return mismatch ? <div className="banner" role="status">The store is updating. If something looks off, refresh in a minute.</div> : null;
}

function CacheBadge() {
  const loc = useLocation();
  const [s, setS] = useState("");
  useEffect(() => { const t = setTimeout(() => setS(lastCache.status), 400); return () => clearTimeout(t); }, [loc]);
  if (!debugRequested() || !s) return null;
  return <div className={`cache-badge ${s.toLowerCase()}`} title={lastCache.key}>Served from {s === "HIT" ? "cache" : s === "MISS" ? "database (cached now)" : "database"}: X-Cache {s}</div>;
}

export function App() {
  return (
    <HashRouter>
      <StoreProvider>
        {IS_PREVIEW && <div className="banner" role="status">Pull request preview: browsing only, using the live store's catalog.</div>}
        <VersionBanner />
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:slug" element={<ProductDetailPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders/:number" element={<OrderPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="products" element={<ProductsAdminPage />} />
              <Route path="products/:id" element={<ProductEditPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:number" element={<OrderAdminPage />} />
              <Route path="promotions" element={<PromotionsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="outbox" element={<OutboxPage />} />
              <Route path="system" element={<SystemPage />} />
            </Route>
            <Route path="*" element={<section><h1>Page not found</h1><Link to="/">Back to the shop</Link></section>} />
          </Routes>
        </main>
        <CacheBadge />
        <footer className="footer"><span className="muted small">Pocket Shop demo store · test payments only</span></footer>
      </StoreProvider>
    </HashRouter>
  );
}
