import { useState } from "react";
import { formatPrice, searchProducts } from "../lib/catalog";

export function CatalogPage({ onAdd }: { onAdd: (productId: string) => void }) {
  const [query, setQuery] = useState("");
  const products = searchProducts(query);

  return (
    <section>
      <h1>Products</h1>
      <label className="field">
        Search
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. bottle" />
      </label>
      {products.length === 0 ? (
        <p>No products match "{query}".</p>
      ) : (
        <ul className="grid">
          {products.map((p) => (
            <li key={p.id} className="card">
              <h2>{p.name}</h2>
              <p className="muted">{p.category}</p>
              <p className="price">{formatPrice(p.priceCents)}</p>
              <button type="button" onClick={() => onAdd(p.id)} aria-label={`Add ${p.name} to cart`}>
                Add to cart
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
