import { formatPrice } from "@pocket/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiProblem } from "../lib/api";
import { useApi } from "../lib/store";
import { ErrorNote, Loading } from "../components/ui";
import { useIsAdmin } from "./AdminLayout";

// ---------- promotions ----------
interface Promo { id: string; name: string; code: string; type: string; value: number; minSubtotalCents: number; usageLimit: number | null; usedCount: number; active: boolean; endsAt: string | null }

export function PromotionsPage() {
  const { data, error, reload } = useApi<{ items: Promo[] }>("/admin/promotions");
  const [err, setErr] = useState<ApiProblem | null>(null);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const type = String(f.get("type"));
    const raw = Number(f.get("value") || 0);
    setErr(null);
    try {
      await api("/admin/promotions", { method: "POST", body: {
        name: String(f.get("name")), code: String(f.get("code")), type,
        value: type === "fixed" ? Math.round(raw * 100) : type === "percentage" ? raw : 0,
        minSubtotalCents: Math.round(Number(f.get("min") || 0) * 100),
        usageLimit: f.get("limit") ? Number(f.get("limit")) : null,
        endsAt: f.get("ends") ? new Date(String(f.get("ends"))).toISOString() : null,
      } });
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (x) { if (x instanceof ApiProblem) setErr(x); }
  }
  const describe = (p: Promo) => p.type === "percentage" ? `${p.value}% off` : p.type === "fixed" ? `${formatPrice(p.value)} off` : "Free shipping";
  return (
    <section>
      <h1>Promotions</h1>
      <ErrorNote error={error ?? err} />
      <table className="cart"><thead><tr><th>Code</th><th>Offer</th><th>Used</th><th /></tr></thead>
        <tbody>{data?.items.map((p) => (
          <tr key={p.id}><td><strong>{p.code}</strong> <span className="muted small">{p.name}</span> {!p.active && <span className="badge">inactive</span>}</td>
            <td>{describe(p)}{p.minSubtotalCents ? ` over ${formatPrice(p.minSubtotalCents)}` : ""}</td>
            <td>{p.usedCount}{p.usageLimit ? ` / ${p.usageLimit}` : ""}</td>
            <td><button type="button" className="link danger" onClick={async () => { await api(`/admin/promotions/${p.id}`, { method: "DELETE" }); reload(); }}>Remove</button></td></tr>))}
        </tbody></table>
      <h2>New promotion</h2>
      <form onSubmit={create} className="stack wide">
        <div className="row">
          <label className="field">Name<input name="name" required /></label>
          <label className="field">Code<input name="code" required pattern="[A-Za-z0-9_-]{3,40}" /></label>
        </div>
        <div className="row">
          <label className="field">Type<select name="type"><option value="percentage">Percent off</option><option value="fixed">Amount off ($)</option><option value="free_shipping">Free shipping</option></select></label>
          <label className="field">Value<input name="value" inputMode="decimal" /></label>
          <label className="field">Minimum subtotal ($)<input name="min" inputMode="decimal" /></label>
        </div>
        <div className="row">
          <label className="field">Usage limit<input name="limit" inputMode="numeric" /></label>
          <label className="field">Ends<input name="ends" type="datetime-local" /></label>
        </div>
        <button type="submit">Create promotion</button>
      </form>
    </section>
  );
}

// ---------- settings ----------
interface S { storeName: string; taxRateBps: number; flatShippingCents: number; freeShippingThresholdCents: number; lowStockThreshold: number }

export function SettingsPage() {
  const isAdmin = useIsAdmin();
  const [s, setS] = useState<S | null>(null);
  const [err, setErr] = useState<ApiProblem | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api<S>("/admin/settings").then(setS, setErr); }, []);
  if (!s) return err ? <ErrorNote error={err} /> : <Loading />;
  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null); setSaved(false);
    try { await api("/admin/settings", { method: "PUT", body: s }); setSaved(true); } catch (x) { if (x instanceof ApiProblem) setErr(x); }
  }
  return (
    <section>
      <h1>Settings</h1>
      {!isAdmin && <p className="notice">Only admins can do this.</p>}
      <form onSubmit={save} className="stack">
        <fieldset disabled={!isAdmin}>
          <label className="field">Store name<input value={s.storeName} onChange={(e) => setS({ ...s, storeName: e.target.value })} /></label>
          <label className="field">Tax rate (%)<input inputMode="decimal" defaultValue={(s.taxRateBps / 100).toString()} onBlur={(e) => setS({ ...s, taxRateBps: Math.round(Number(e.target.value) * 100) })} /></label>
          <label className="field">Flat shipping ($)<input inputMode="decimal" defaultValue={(s.flatShippingCents / 100).toFixed(2)} onBlur={(e) => setS({ ...s, flatShippingCents: Math.round(Number(e.target.value) * 100) })} /></label>
          <label className="field">Free shipping over ($)<input inputMode="decimal" defaultValue={(s.freeShippingThresholdCents / 100).toFixed(2)} onBlur={(e) => setS({ ...s, freeShippingThresholdCents: Math.round(Number(e.target.value) * 100) })} /></label>
          <label className="field">Default low-stock threshold<input inputMode="numeric" value={s.lowStockThreshold} onChange={(e) => setS({ ...s, lowStockThreshold: Number(e.target.value) })} /></label>
          <ErrorNote error={err} />
          {saved && <p role="status">Settings saved.</p>}
          <button type="submit">Save settings</button>
        </fieldset>
      </form>
    </section>
  );
}

// ---------- system & cache ----------
interface Sys {
  health: { db: string; redis: string; version: string; appEnv: string; uptimeSec: number };
  cache: { available: boolean; hit: number; miss: number; bypass: number; hitRate: number | null; keysByPrefix: Record<string, number>; invalidations: { at: string; what: string }[] };
}

export function SystemPage() {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const { data, error, reload } = useApi<Sys>("/admin/system");
  const [err, setErr] = useState<ApiProblem | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done: string) => { setErr(null); setMsg(null); try { await fn(); setMsg(done); reload(); } catch (e) { if (e instanceof ApiProblem) setErr(e); } };
  return (
    <section>
      <h1>System &amp; cache</h1>
      <ErrorNote error={error ?? err} />
      {msg && <p role="status">{msg}</p>}
      {data && (
        <>
          <div className="tiles">
            <div className="tile"><span className="muted small">Database</span><strong>{data.health.db}</strong></div>
            <div className="tile"><span className="muted small">Redis</span><strong>{data.health.redis}</strong></div>
            <div className="tile"><span className="muted small">Hit rate</span><strong>{data.cache.hitRate === null ? "n/a" : `${data.cache.hitRate}%`}</strong></div>
            <div className="tile"><span className="muted small">Hits / misses / bypass</span><strong>{data.cache.hit} / {data.cache.miss} / {data.cache.bypass}</strong></div>
            <div className="tile"><span className="muted small">Version</span><strong>{data.health.version.slice(0, 7)}</strong></div>
            <div className="tile"><span className="muted small">Uptime</span><strong>{Math.round(data.health.uptimeSec / 60)} min</strong></div>
          </div>
          <h2>Keys by prefix</h2>
          <ul className="plain">{Object.entries(data.cache.keysByPrefix).map(([k, n]) => <li key={k}><code>{k}</code>: {n}</li>)}</ul>
          <h2>Recent invalidations</h2>
          <ul className="plain">{data.cache.invalidations.map((i, n) => <li key={n}>{new Date(i.at).toLocaleTimeString()} · {i.what}</li>)}</ul>
        </>
      )}
      {isAdmin && (
        <div className="row">
          <button type="button" onClick={() => { const c = prompt('Type FLUSH to empty the catalog cache'); if (c) void run(() => api("/admin/cache/flush", { method: "POST", body: { confirm: c } }), "Catalog cache flushed."); }}>Flush catalog cache</button>
          <button type="button" className="secondary danger" onClick={() => { const c = prompt("Type RESET to restore the demo data. Everyone is signed out."); if (c) void run(async () => {
            await api("/admin/demo/reset", { method: "POST", body: { confirm: c } });
            // A reset ends every session, including this one; the sign-in page clears it on arrival.
            navigate("/login?reason=reset");
          }, ""); }}>Reset demo data</button>
        </div>
      )}
    </section>
  );
}
