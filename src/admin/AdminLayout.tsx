import { NavLink, Navigate, Outlet } from "react-router-dom";
import { IS_PREVIEW } from "../lib/env";
import { useStore } from "../lib/store";
import { Loading } from "../components/ui";

const LINKS: Array<[string, string, boolean]> = [
  ["", "Dashboard", false], ["products", "Products", false], ["categories", "Categories", false], ["inventory", "Inventory", false],
  ["orders", "Orders", false], ["promotions", "Promotions", true], ["customers", "Customers", false], ["settings", "Settings", true],
  ["questions", "Questions", true], ["outbox", "Outbox", false], ["system", "System & cache", false],
];

export function AdminLayout() {
  const { user, ready } = useStore();
  if (IS_PREVIEW) return <section><h1>Admin</h1><p>Admin is not available on preview builds that use the production store.</p></section>;
  if (!ready) return <Loading />;
  if (!user || user.role === "customer") return <Navigate to="/login?next=admin&reason=admin" replace />;
  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Admin">
        <p className="muted small">Signed in as {user.role}</p>
        {LINKS.filter(([, , adminOnly]) => !adminOnly || user.role === "admin").map(([to, label]) => (
          <NavLink key={to} to={`/admin/${to}`} end={to === ""}>{label}</NavLink>
        ))}
      </nav>
      <div className="admin-main"><Outlet /></div>
    </div>
  );
}

/** Wraps an admin-only action: staff see the reason instead of a broken button. */
export function useIsAdmin() {
  return useStore().user?.role === "admin";
}
