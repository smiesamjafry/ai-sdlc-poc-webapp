import { formatPrice } from "@pocket/shared";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, ApiProblem } from "../lib/api";
import { useApi, useStore } from "../lib/store";
import { Empty, ErrorNote, Loading } from "../components/ui";

interface Address { id: string; label: string; name: string; line1: string; line2: string | null; city: string; region: string | null; postcode: string; country: string }

export function AccountPage() {
  const { user, ready } = useStore();
  const orders = useApi<{ items: { number: string; status: string; totalCents: number; createdAt: string; itemCount: number }[] }>(user ? "/orders" : null, [user?.id]);
  const addresses = useApi<{ items: Address[] }>(user ? "/me/addresses" : null, [user?.id]);
  const [error, setError] = useState<ApiProblem | null>(null);
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login?next=account" replace />;

  async function addAddress(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    try {
      await api("/me/addresses", { method: "POST", body: { label: v("label") || "Home", name: v("name"), line1: v("line1"), city: v("city"), region: v("region") || null, postcode: v("postcode"), country: "US" } });
      (e.target as HTMLFormElement).reset();
      addresses.reload();
      setError(null);
    } catch (err) { if (err instanceof ApiProblem) setError(err); }
  }

  return (
    <section>
      <h1>Your account</h1>
      <p>{user.name} · {user.email}</p>
      <h2>Orders</h2>
      {orders.loading && <Loading />}
      {orders.data && orders.data.items.length === 0 && <Empty><p>No orders yet.</p><Link to="/products">Start shopping</Link></Empty>}
      {orders.data && orders.data.items.length > 0 && (
        <table className="cart">
          <thead><tr><th>Order</th><th>Status</th><th>Items</th><th>Total</th></tr></thead>
          <tbody>{orders.data.items.map((o) => (
            <tr key={o.number}><td><Link to={`/orders/${o.number}`}>{o.number}</Link> <span className="muted small">{new Date(o.createdAt).toLocaleDateString()}</span></td>
              <td><span className="badge">{o.status}</span></td><td>{o.itemCount}</td><td>{formatPrice(o.totalCents)}</td></tr>))}
          </tbody>
        </table>
      )}
      <h2>Addresses</h2>
      <ul className="plain">{addresses.data?.items.map((a) => (
        <li key={a.id}><strong>{a.label}</strong>: {a.name}, {a.line1}, {a.city} {a.postcode}{" "}
          <button type="button" className="link" onClick={async () => { await api(`/me/addresses/${a.id}`, { method: "DELETE" }); addresses.reload(); }}>Delete</button></li>))}
      </ul>
      <form onSubmit={addAddress} className="stack">
        <label className="field">Label<input name="label" placeholder="Home" /></label>
        <label className="field">Name<input name="name" required /></label>
        <label className="field">Address<input name="line1" required /></label>
        <label className="field">City<input name="city" required /></label>
        <label className="field">State<input name="region" /></label>
        <label className="field">ZIP<input name="postcode" required /></label>
        <ErrorNote error={error} />
        <button type="submit">Add address</button>
      </form>
    </section>
  );
}
