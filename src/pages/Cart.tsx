import { formatPrice } from "@pocket/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiProblem } from "../lib/api";
import { useStore } from "../lib/store";
import { Empty, ErrorNote, Loading } from "../components/ui";

export function CartPage() {
  const { cart, setQuantity, applyCoupon, removeCoupon } = useStore();
  const [error, setError] = useState<ApiProblem | null>(null);
  const [code, setCode] = useState("");

  if (!cart) return <Loading />;
  if (cart.items.length === 0) {
    return (
      <section>
        <h1>Your cart</h1>
        <Empty><p>Your cart is empty.</p><Link to="/products">Browse products</Link></Empty>
      </section>
    );
  }
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { if (e instanceof ApiProblem) setError(e); }
  };
  const total = cart.items.reduce((sum, item) => sum + item.unitPriceCents, 0);
  const toFree = cart.settings.freeShippingThresholdCents - (cart.totals.subtotalCents - cart.totals.discountCents);

  return (
    <section>
      <h1>Your cart</h1>
      <ErrorNote error={error} />
      <table className="cart">
        <thead><tr><th>Item</th><th>Price</th><th>Qty</th></tr></thead>
        <tbody>
          {cart.items.map((item) => (
            <tr key={item.variantId}>
              <td>
                <Link to={`/products/${item.productSlug}`}>{item.name}</Link>
                <div className="muted small">{item.variantLabel}</div>
                {item.overStock && <div role="alert" className="small">Only {item.stock} left; lower the quantity.</div>}
              </td>
              <td>{formatPrice(item.unitPriceCents)}</td>
              <td>
                <input type="number" min={1} max={99} value={item.quantity} aria-label={`Quantity of ${item.name}`}
                  onChange={(e) => { const q = Number(e.target.value); if (q >= 1) void run(() => setQuantity(item.variantId, q)); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="coupon" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void run(() => applyCoupon(code.trim())).then(() => setCode("")); }}>
        {cart.coupon ? (
          <p>
            Code <strong>{cart.coupon.code}</strong>{cart.coupon.applied ? ` applied: ${cart.coupon.label}` : `: ${cart.coupon.error}`}{" "}
            <button type="button" className="link" onClick={() => void run(removeCoupon)}>Remove</button>
          </p>
        ) : (
          <label className="field inline">
            Discount code
            <span className="row"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. WELCOME10" /><button type="submit">Apply</button></span>
          </label>
        )}
      </form>
      {toFree > 0 && <p className="muted">Add {formatPrice(toFree)} more for free shipping.</p>}
      <p className="total">Total: <strong data-testid="cart-total">{formatPrice(total)}</strong></p>
      <Link to="/checkout" className="button">Go to checkout</Link>
    </section>
  );
}
