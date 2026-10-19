import { formatPrice } from "@pocket/shared";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiProblem, newIdempotencyKey } from "../lib/api";
import { useApi } from "../lib/store";
import type { OrderDetail } from "../lib/types";
import { ErrorNote, Loading } from "../components/ui";
import { useIsAdmin } from "./AdminLayout";

// ---------- categories ----------
export function CategoriesPage() {
  const { data, error, reload } = useApi<{ items: { id: string; name: string; slug: string; productCount: number; featured: boolean; sort: number }[] }>("/admin/categories");
  const isAdmin = useIsAdmin();
  const [err, setErr] = useState<ApiProblem | null>(null);
  const [name, setName] = useState("");
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); reload(); } catch (e) { if (e instanceof ApiProblem) setErr(e); } };
  return (
    <section>
      <h1>Categories</h1>
      <ErrorNote error={error ?? err} />
      <table className="cart"><thead><tr><th>Name</th><th>Products</th><th /></tr></thead>
        <tbody>{data?.items.map((c) => (
          <tr key={c.id}><td>{c.name} <span className="muted small">/{c.slug}</span>{c.featured && <span className="badge">featured</span>}</td><td>{c.productCount}</td>
            <td>{isAdmin && <button type="button" className="link danger" onClick={() => run(() => api(`/admin/categories/${c.id}`, { method: "DELETE" }))}>Delete</button>}</td></tr>))}
        </tbody></table>
      {isAdmin && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); void run(() => api("/admin/categories", { method: "POST", body: { name, sort: data?.items.length ?? 0 } })).then(() => setName("")); }}>
          <label className="field">New category<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <button type="submit">Add</button>
        </form>
      )}
    </section>
  );
}

// ---------- inventory ----------
export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "all";
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useApi<{ items: { id: string; sku: string; name: string; stock: number; threshold: number }[] }>(
    `/admin/inventory?filter=${filter}&q=${encodeURIComponent(q)}`, [filter, q]);
  const [err, setErr] = useState<ApiProblem | null>(null);
  const [history, setHistory] = useState<{ id: string; items: { delta: number; reason: string; createdAt: string; actor: string | null }[] } | null>(null);
  async function adjust(id: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr(null);
    try {
      await api(`/admin/inventory/${id}/adjust`, { method: "POST", body: { delta: Number(f.get("delta")), reason: String(f.get("reason")) } });
      reload();
    } catch (x) { if (x instanceof ApiProblem) setErr(x); }
  }
  return (
    <section>
      <h1>Inventory</h1>
      <div className="row">
        {["all", "low", "out"].map((f) => <button key={f} type="button" className={f === filter ? "" : "secondary"} onClick={() => setParams({ filter: f })}>{f === "all" ? "All" : f === "low" ? "Low stock" : "Out of stock"}</button>)}
        <label className="field">Search<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {loading && <Loading />}
      <ErrorNote error={error ?? err} />
      <table className="cart"><thead><tr><th>Variant</th><th>Stock</th><th>Adjust</th></tr></thead>
        <tbody>{data?.items.map((v) => (
          <tr key={v.id}>
            <td>{v.name} <span className="muted small">{v.sku}</span> <button type="button" className="link small" onClick={async () => setHistory({ id: v.id, ...(await api<{ items: [] }>(`/admin/inventory/${v.id}/movements`)) })}>History</button></td>
            <td className={v.stock === 0 ? "danger" : v.stock <= v.threshold ? "warn" : ""}>{v.stock}</td>
            <td><form className="row tight" onSubmit={(e) => adjust(v.id, e)}>
              <input name="delta" aria-label={`Stock change for ${v.sku}`} type="number" required style={{ width: 80 }} />
              <input name="reason" aria-label="Reason" placeholder="reason" required minLength={2} style={{ width: 120 }} />
              <button type="submit">Apply</button></form></td>
          </tr>))}
        </tbody></table>
      {history && (
        <div className="panel"><h2>Movements</h2><button type="button" className="link" onClick={() => setHistory(null)}>Close</button>
          <ul className="plain">{history.items.map((m, i) => <li key={i}>{m.delta > 0 ? "+" : ""}{m.delta} · {m.reason} · {m.actor ?? "system"} · {new Date(m.createdAt).toLocaleString()}</li>)}</ul></div>
      )}
    </section>
  );
}

// ---------- orders ----------
export function OrdersPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useApi<{ items: { number: string; email: string; status: string; paymentStatus: string; totalCents: number; createdAt: string }[]; total: number }>(
    `/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`, [status, q]);
  return (
    <section>
      <h1>Orders</h1>
      <div className="row">
        <label className="field">Status<select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>{["paid", "packed", "shipped", "delivered", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field">Search (number or email)<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      <p className="muted small">{data?.total ?? 0} orders</p>
      <table className="cart"><thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
        <tbody>{data?.items.map((o) => (
          <tr key={o.number}><td><Link to={`/admin/orders/${o.number}`}>{o.number}</Link> <span className="muted small">{o.email} · {new Date(o.createdAt).toLocaleDateString()}</span></td>
            <td><span className="badge">{o.status}</span></td><td>{o.paymentStatus}</td><td>{formatPrice(o.totalCents)}</td></tr>))}
        </tbody></table>
    </section>
  );
}

const NEXT: Record<string, string> = { paid: "packed", packed: "shipped", shipped: "delivered" };

export function OrderAdminPage() {
  const { number } = useParams();
  const { data, error, reload } = useApi<OrderDetail>(`/admin/orders/${number}`, [number]);
  const isAdmin = useIsAdmin();
  const [err, setErr] = useState<ApiProblem | null>(null);
  const [tracking, setTracking] = useState("");
  const [refundQty, setRefundQty] = useState<Record<string, number>>({});
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); reload(); } catch (e) { if (e instanceof ApiProblem) setErr(e); } };
  if (!data) return error ? <ErrorNote error={error} /> : <Loading />;
  const next = NEXT[data.status];
  return (
    <section>
      <h1>Order {data.number}</h1>
      <p>{data.email} · <span className="badge">{data.status}</span> · payment {data.paymentStatus} {data.trackingNumber && `· tracking ${data.trackingNumber}`}</p>
      <ErrorNote error={err} />
      <div className="row">
        {next && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); void run(() => api(`/admin/orders/${number}/transition`, { method: "POST", body: { to: next, trackingNumber: next === "shipped" ? tracking : undefined } })); }}>
            {next === "shipped" && <label className="field">Tracking number<input value={tracking} onChange={(e) => setTracking(e.target.value)} required /></label>}
            <button type="submit">Mark {next}</button>
          </form>
        )}
        {["paid", "packed"].includes(data.status) && (
          <button type="button" className="secondary" onClick={() => { if (confirm("Cancel this order and refund the customer in full?")) void run(() => api(`/admin/orders/${number}/cancel`, { method: "POST", body: { operationId: newIdempotencyKey() } })); }}>Cancel order</button>
        )}
      </div>
      <table className="cart"><thead><tr><th>Item</th><th>Qty</th><th>Refunded</th><th>Total</th>{isAdmin && <th>Refund qty</th>}</tr></thead>
        <tbody>{data.items.map((i) => (
          <tr key={i.id}><td>{i.name} <span className="muted small">{i.variantLabel} · {i.sku}</span></td><td>{i.quantity}</td><td>{i.refundedQuantity}</td><td>{formatPrice(i.lineTotalCents)}</td>
            {isAdmin && <td><input type="number" min={0} max={i.quantity - i.refundedQuantity} aria-label={`Refund quantity for ${i.name}`} value={refundQty[i.id] ?? 0}
              onChange={(e) => setRefundQty({ ...refundQty, [i.id]: Number(e.target.value) })} disabled={i.refundedQuantity >= i.quantity} /></td>}
          </tr>))}
        </tbody></table>
      {isAdmin && (
        <button type="button" disabled={!Object.values(refundQty).some((n) => n > 0)} onClick={() => void run(async () => {
          await api(`/admin/orders/${number}/refund`, { method: "POST", body: { operationId: newIdempotencyKey(), restock: true,
            lines: Object.entries(refundQty).filter(([, n]) => n > 0).map(([itemId, quantity]) => ({ itemId, quantity })) } });
          setRefundQty({});
        })}>Refund selected items</button>
      )}
      <dl className="totals">
        <dt>Total</dt><dd>{formatPrice(data.totals.totalCents)}</dd>
        <dt>Refunded</dt><dd>{formatPrice(data.totals.refundedCents)}</dd>
      </dl>
      <h2>Timeline</h2>
      <ol className="timeline">{data.events.map((e, i) => <li key={i}><strong>{e.type}</strong> {e.detail ?? ""} <span className="muted small">{new Date(e.createdAt).toLocaleString()}</span></li>)}</ol>
    </section>
  );
}

// ---------- customers ----------
export function CustomersPage() {
  const [q, setQ] = useState("");
  const { data, error, reload } = useApi<{ items: { id: string; email: string; name: string; status: string; orders: number; lifetimeValueCents: number }[] }>(`/admin/customers?q=${encodeURIComponent(q)}`, [q]);
  const isAdmin = useIsAdmin();
  const [err, setErr] = useState<ApiProblem | null>(null);
  const toggle = async (id: string, action: string) => { setErr(null); try { await api(`/admin/customers/${id}/${action}`, { method: "POST" }); reload(); } catch (e) { if (e instanceof ApiProblem) setErr(e); } };
  return (
    <section>
      <h1>Customers</h1>
      <label className="field">Search<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <ErrorNote error={error ?? err} />
      <table className="cart"><thead><tr><th>Customer</th><th>Orders</th><th>Lifetime value</th><th /></tr></thead>
        <tbody>{data?.items.map((c) => (
          <tr key={c.id}><td>{c.name} <span className="muted small">{c.email}</span> {c.status === "disabled" && <span className="badge">disabled</span>}</td>
            <td>{c.orders}</td><td>{formatPrice(c.lifetimeValueCents)}</td>
            <td>{isAdmin && <button type="button" className="link" onClick={() => toggle(c.id, c.status === "active" ? "disable" : "enable")}>{c.status === "active" ? "Disable" : "Enable"}</button>}</td></tr>))}
        </tbody></table>
    </section>
  );
}

// ---------- outbox ----------
export function OutboxPage() {
  const { data, error } = useApi<{ items: { id: string; to: string; subject: string; body: string; kind: string; createdAt: string }[] }>("/admin/outbox");
  return (
    <section>
      <h1>Outbox</h1>
      <p className="muted">Emails the store would have sent. Nothing leaves this demo.</p>
      <ErrorNote error={error} />
      <table className="cart"><thead><tr><th>To</th><th>Subject</th><th>When</th></tr></thead>
        <tbody>{data?.items.map((m) => <tr key={m.id}><td>{m.to}</td><td>{m.subject}<div className="muted small">{m.body}</div></td><td>{new Date(m.createdAt).toLocaleString()}</td></tr>)}</tbody></table>
    </section>
  );
}
