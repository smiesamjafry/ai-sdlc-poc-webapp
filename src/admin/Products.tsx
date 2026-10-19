import { formatPrice } from "@pocket/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiProblem } from "../lib/api";
import { useApi } from "../lib/store";
import { ErrorNote, Loading } from "../components/ui";
import { useIsAdmin } from "./AdminLayout";

interface Row { id: string; name: string; slug: string; status: string; category: string | null; priceCents: number; stock: number; variants: number }

export function ProductsAdminPage() {
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useApi<{ items: Row[] }>(`/admin/products?q=${encodeURIComponent(q)}`, [q]);
  const isAdmin = useIsAdmin();
  return (
    <section>
      <div className="row between"><h1>Products</h1>{isAdmin && <Link className="button" to="/admin/products/new">New product</Link>}</div>
      <label className="field">Search<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      <table className="cart">
        <thead><tr><th>Name</th><th>Status</th><th>Price</th><th>Stock</th></tr></thead>
        <tbody>{data?.items.map((p) => (
          <tr key={p.id}><td><Link to={`/admin/products/${p.id}`}>{p.name}</Link> <span className="muted small">{p.category}</span></td>
            <td><span className="badge">{p.status}</span></td><td>{formatPrice(p.priceCents ?? 0)}</td><td>{p.stock}</td></tr>))}
        </tbody>
      </table>
    </section>
  );
}

interface VariantForm { id?: string; sku: string; size: string | null; colour: string | null; priceCents: number; compareAtCents: number | null; stock?: number; lowStockThreshold: number | null }
interface ProductForm { name: string; slug: string; description: string; brand: string; categoryId: string | null; status: string; featured: boolean; images: { url: string; alt: string }[]; variants: VariantForm[] }

const blank: ProductForm = { name: "", slug: "", description: "", brand: "Pocket", categoryId: null, status: "draft", featured: false,
  images: [], variants: [{ sku: "", size: null, colour: null, priceCents: 0, compareAtCents: null, stock: 0, lowStockThreshold: null }] };

export function ProductEditPage() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const cats = useApi<{ items: { id: string; name: string }[] }>("/admin/categories");
  const [form, setForm] = useState<ProductForm | null>(isNew ? blank : null);
  const [error, setError] = useState<ApiProblem | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isNew) api<ProductForm>(`/admin/products/${id}`).then(setForm, setError);
  }, [id, isNew]);
  if (!form) return error ? <ErrorNote error={error} /> : <Loading />;

  const current = form;
  const setV = (i: number, patch: Partial<VariantForm>) => setForm({ ...current, variants: current.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
  const cents = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const body = { ...current, slug: current.slug || undefined, variants: current.variants.map((v) => ({ ...v, sku: v.sku.toUpperCase() })) };
      const res = await api<{ id: string }>(isNew ? "/admin/products" : `/admin/products/${id}`, { method: isNew ? "POST" : "PUT", body });
      setSaved(true);
      if (isNew) navigate(`/admin/products/${res.id}`);
    } catch (err) { if (err instanceof ApiProblem) setError(err); }
  }

  const ro = !isAdmin;
  return (
    <section>
      <h1>{isNew ? "New product" : form.name}</h1>
      {ro && <p className="notice">Only admins can do this: staff can view products but not edit them.</p>}
      <form onSubmit={save} className="stack wide">
        <fieldset disabled={ro}>
          <label className="field">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field">Slug<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="generated from the name" /></label>
          <label className="field">Description<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="row">
            <label className="field">Category
              <select value={form.categoryId ?? ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}>
                <option value="">None</option>{cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="field">Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
              </select></label>
            <label className="check"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />Featured</label>
          </div>
          <label className="field">Image URL<input value={form.images[0]?.url ?? ""} onChange={(e) => setForm({ ...form, images: e.target.value ? [{ url: e.target.value, alt: form.name || "Product" }] : [] })} placeholder="https://… or products/name.svg" /></label>
          <h2>Variants</h2>
          <table className="cart variants">
            <thead><tr><th>SKU</th><th>Size</th><th>Colour</th><th>Price $</th><th>Compare-at $</th><th>Low stock at</th><th /></tr></thead>
            <tbody>{form.variants.map((v, i) => (
              <tr key={v.id ?? i}>
                <td><input aria-label="SKU" value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} required /></td>
                <td><input aria-label="Size" value={v.size ?? ""} onChange={(e) => setV(i, { size: e.target.value || null })} /></td>
                <td><input aria-label="Colour" value={v.colour ?? ""} onChange={(e) => setV(i, { colour: e.target.value || null })} /></td>
                <td><input aria-label="Price" inputMode="decimal" defaultValue={dollars(v.priceCents)} onBlur={(e) => setV(i, { priceCents: cents(e.target.value) ?? 0 })} /></td>
                <td><input aria-label="Compare-at price" inputMode="decimal" defaultValue={dollars(v.compareAtCents)} onBlur={(e) => setV(i, { compareAtCents: cents(e.target.value) })} /></td>
                <td><input aria-label="Low stock threshold" inputMode="numeric" defaultValue={v.lowStockThreshold ?? ""} onBlur={(e) => setV(i, { lowStockThreshold: e.target.value ? Number(e.target.value) : null })} /></td>
                <td>{form.variants.length > 1 && <button type="button" className="link" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })}>Remove</button>}</td>
              </tr>))}
            </tbody>
          </table>
          <button type="button" className="link" onClick={() => setForm({ ...form, variants: [...form.variants, { ...blank.variants[0] }] })}>Add variant</button>
          <ErrorNote error={error} />
          {saved && <p role="status">Saved. The storefront shows the change on its next request.</p>}
          <button type="submit">Save product</button>
        </fieldset>
      </form>
      {!isNew && isAdmin && (
        <button type="button" className="link danger" onClick={async () => {
          if (!confirm("Archive this product? It disappears from the storefront.")) return;
          await api(`/admin/products/${id}`, { method: "DELETE" }); navigate("/admin/products");
        }}>Archive product</button>
      )}
    </section>
  );
}
