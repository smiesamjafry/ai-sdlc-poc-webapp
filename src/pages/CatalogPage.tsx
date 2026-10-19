import { useState } from "react";
import { PLACEHOLDER_IMAGE, PRODUCTS, formatPrice, searchProducts } from "../lib/catalog";
import { ProductPreview } from "../components/ProductPreview";

export function CatalogPage({ onAdd }: { onAdd: (productId: string) => void }) {
  const [query, setQuery] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const products = searchProducts(query);
  const previewed = PRODUCTS.find((p) => p.id === previewId);

  return (
    <section>
      <h1>Products</h1>
      <p className="lede">Bags, bottles and notebooks for every day.</p>
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
              <img src={PLACEHOLDER_IMAGE} alt={`${p.name} image`} className="card-image" width={320} height={200} />
              <h2>{p.name}</h2>
              <p className="muted">{p.category}</p>
              <p className="price">{formatPrice(p.priceCents)}</p>
              <div className="card-actions">
                <button type="button" onClick={() => onAdd(p.id)} aria-label={`Add ${p.name} to cart`}>
                  Add to cart
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPreviewId(p.id)}
                  aria-label={`Preview ${p.name}`}
                >
                  Preview
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {previewed && (
        <ProductPreview
          product={previewed}
          onAdd={onAdd}
          onSelect={setPreviewId}
          onClose={() => setPreviewId(null)}
        />
      )}
    </section>
  );
}
