import { Link } from "react-router-dom";
import { useApi } from "../lib/store";
import type { ProductCard as Card } from "../lib/types";
import { ErrorNote, Loading } from "../components/ui";
import { ProductGrid } from "./Products";

interface HomeData { featuredCategories: { slug: string; name: string }[]; featured: Card[]; newArrivals: Card[]; onSale: Card[] }

export function HomePage() {
  const { data, error, loading, reload } = useApi<HomeData>("/home");
  return (
    <section>
      <div className="hero">
        <h1>Everyday clothes, made to last.</h1>
        <p className="lede">Tees, outerwear, bags and the small things you carry every day.</p>
        <Link to="/products" className="button">Shop all products</Link>
      </div>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      {data && (
        <>
          <nav className="chips" aria-label="Featured categories">
            {data.featuredCategories.map((c) => <Link key={c.slug} className="chip" to={`/products?category=${c.slug}`}>{c.name}</Link>)}
          </nav>
          <h2>Featured</h2>
          <ProductGrid items={data.featured.slice(0, 4)} />
          <h2>New arrivals</h2>
          <ProductGrid items={data.newArrivals.slice(0, 4)} />
          {data.onSale.length > 0 && (<><h2>On sale</h2><ProductGrid items={data.onSale.slice(0, 4)} /></>)}
        </>
      )}
    </section>
  );
}
