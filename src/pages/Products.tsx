import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/store";
import type { ProductCard, ProductList } from "../lib/types";
import { Empty, ErrorNote, Loading, Price, imgSrc } from "../components/ui";

export function ProductGrid({ items }: { items: ProductCard[] }) {
  return (
    <ul className="grid">
      {items.map((p) => (
        <li key={p.id} className="card">
          <Link to={`/products/${p.slug}`} className="card-link">
            <img src={imgSrc(p.image)} alt={`${p.imageAlt} image`} className="card-image" width={320} height={240} loading="lazy" />
            <h3>{p.name}</h3>
          </Link>
          <p className="muted">{p.categoryName}</p>
          <p><Price cents={p.priceCents} compareAt={p.compareAtCents} /></p>
          {!p.inStock && <p className="badge">Out of stock</p>}
          {p.compareAtCents ? <p className="badge sale">Sale</p> : null}
        </li>
      ))}
    </ul>
  );
}

const SIZES = ["XS", "S", "M", "L", "XL"];

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const cats = useApi<{ items: { slug: string; name: string; productCount: number }[] }>("/categories");
  useEffect(() => setSearch(params.get("q") ?? ""), [params]);

  const query = new URLSearchParams();
  for (const k of ["category", "size", "colour", "minPrice", "maxPrice", "inStock", "sort", "q", "page"]) {
    const v = params.get(k);
    if (v) query.set(k, v);
  }
  query.set("pageSize", "24");
  const { data, error, loading, reload } = useApi<ProductList>(`/products?${query.toString()}`);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next);
  };
  const q = params.get("q") ?? "";
  // Show results whose name matches what the shopper typed.
  const items = data ? (q ? data.items.filter((p) => p.name.includes(q)) : data.items) : [];
  const page = Number(params.get("page") ?? 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section>
      <h1>Products</h1>
      <p className="lede">Apparel and accessories for every day.</p>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); set("q", search.trim() || null); }}>
        <label className="field">
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. hoodie" />
        </label>
        <label className="field">
          Category
          <select value={params.get("category") ?? ""} onChange={(e) => set("category", e.target.value || null)}>
            <option value="">All</option>
            {cats.data?.items.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          Size
          <select value={params.get("size") ?? ""} onChange={(e) => set("size", e.target.value || null)}>
            <option value="">Any</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          Max price
          <select value={params.get("maxPrice") ?? ""} onChange={(e) => set("maxPrice", e.target.value || null)}>
            <option value="">Any</option>
            {[2500, 5000, 10000, 20000].map((c) => <option key={c} value={c}>Up to ${c / 100}</option>)}
          </select>
        </label>
        <label className="field">
          Sort
          <select value={params.get("sort") ?? "newest"} onChange={(e) => set("sort", e.target.value)}>
            <option value="newest">Newest</option>
            <option value="best_selling">Best selling</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={params.get("inStock") === "true"} onChange={(e) => set("inStock", e.target.checked ? "true" : null)} />
          In stock only
        </label>
        <button type="submit">Search</button>
      </form>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      {data && items.length === 0 && (
        <Empty>
          <p>No products match{q ? ` "${q}"` : ""}.</p>
          <button type="button" className="link" onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
        </Empty>
      )}
      {data && items.length > 0 && <ProductGrid items={items} />}
      {data && pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button type="button" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Next</button>
        </nav>
      )}
    </section>
  );
}
