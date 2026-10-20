import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiProblem } from "../lib/api";
import { IS_PREVIEW } from "../lib/env";
import { useApi, useStore } from "../lib/store";
import { avatarSrc, mockReviews } from "../lib/reviews";
import type { Product } from "../lib/types";
import { ErrorNote, Loading, Price, imgSrc } from "../components/ui";

export function ProductDetailPage() {
  const { slug } = useParams();
  const { data: p, error, loading, reload } = useApi<Product>(`/products/${slug}`, [slug]);
  const { addToCart } = useStore();
  const [colour, setColour] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const colours = useMemo(() => [...new Set(p?.variants.map((v) => v.colour).filter(Boolean) as string[])], [p]);
  const sizes = useMemo(() => [...new Set(p?.variants.map((v) => v.size).filter(Boolean) as string[])], [p]);
  const chosen = p?.variants.find((v) =>
    (colours.length === 0 || v.colour === (colour ?? (colours.length === 1 ? colours[0] : null))) &&
    (sizes.length === 0 || v.size === (size ?? (sizes.length === 1 ? sizes[0] : null))));

  if (loading) return <Loading />;
  if (error) return error.status === 404 ? <section><h1>Product not found</h1><Link to="/products">Back to products</Link></section> : <ErrorNote error={error} onRetry={reload} />;
  if (!p) return null;

  const available = (pred: (v: Product["variants"][number]) => boolean) => p.variants.some((v) => pred(v) && v.inStock);

  async function add() {
    if (!chosen) return;
    setBusy(true);
    setMsg(null);
    try {
      await addToCart(chosen.id, 1);
      setMsg({ ok: true, text: "Added to your cart." });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiProblem ? `${e.detail} ${e.fix}` : "Couldn't add to cart." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pdp">
      <div className="gallery">
        {p.images.map((img) => <img key={img.url} src={imgSrc(img.url)} alt={`${img.alt} image`} width={640} height={480} />)}
      </div>
      <div className="pdp-info">
        <p className="muted"><Link to={`/products?category=${p.category}`}>{p.categoryName}</Link></p>
        <h1>{p.name}</h1>
        <p><Price cents={chosen?.priceCents ?? p.variants[0].priceCents} compareAt={chosen?.compareAtCents ?? p.variants[0].compareAtCents} /></p>
        <p>{p.description}</p>
        {colours.length > 0 && (
          <fieldset className="options">
            <legend>Colour</legend>
            {colours.map((c) => (
              <button key={c} type="button" className={`option${(colour ?? (colours.length === 1 ? c : null)) === c ? " selected" : ""}`}
                aria-pressed={colour === c} disabled={!available((v) => v.colour === c)} onClick={() => setColour(c)}>{c}</button>
            ))}
          </fieldset>
        )}
        {sizes.length > 0 && (
          <fieldset className="options">
            <legend>Size</legend>
            {sizes.map((s) => (
              <button key={s} type="button" className={`option${size === s ? " selected" : ""}`} aria-pressed={size === s}
                disabled={!available((v) => v.size === s && (!colour || v.colour === colour))} onClick={() => setSize(s)}>{s}</button>
            ))}
          </fieldset>
        )}
        {chosen && !chosen.inStock && <p className="badge">Out of stock</p>}
        {chosen?.lowStock && <p className="badge low">Only {chosen.stock} left</p>}
        {IS_PREVIEW ? <p className="muted">Preview build: adding to cart is disabled.</p> : (
          <button type="button" disabled={!chosen || !chosen.inStock || busy} onClick={add}>
            {chosen ? "Add to cart" : "Choose options"}
          </button>
        )}
        {msg && <p role={msg.ok ? "status" : "alert"}>{msg.text} {msg.ok && <Link to="/cart">View cart</Link>}</p>}
      </div>
      <Reviews slug={p.slug} />
    </section>
  );
}

function Reviews({ slug }: { slug: string }) {
  const reviews = useMemo(() => mockReviews(slug), [slug]);
  return (
    <section className="reviews" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Reviews</h2>
      <ul>
        {reviews.map((r) => (
          <li key={r.name} className="review">
            <img src={avatarSrc(r)} alt={`Profile picture of ${r.name}`} width={48} height={48} />
            <div>
              <p className="review-name">{r.name}</p>
              <p className="stars">
                <span aria-hidden="true">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>{" "}
                <span className="muted">{r.rating} out of 5 stars</span>
              </p>
              <p>{r.comment}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
