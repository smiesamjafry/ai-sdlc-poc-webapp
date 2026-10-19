import { formatPrice } from "@pocket/shared";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiProblem, newIdempotencyKey } from "../lib/api";
import { IS_PREVIEW } from "../lib/env";
import { useStore } from "../lib/store";
import { Empty, ErrorNote, Loading } from "../components/ui";

const PENDING_KEY = "ps.checkoutKey";

export function CheckoutPage() {
  const { cart, user, refreshCart } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState<ApiProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  if (IS_PREVIEW) return <section><h1>Checkout</h1><p>Preview builds are browse-only.</p></section>;
  if (!cart) return <Loading />;
  if (cart.items.length === 0) return <section><h1>Checkout</h1><Empty><p>Your cart is empty.</p><Link to="/products">Browse products</Link></Empty></section>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(form.current!);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    // One key per payment attempt; kept across a reload so a lost response replays instead of charging twice.
    let key = sessionStorage.getItem(PENDING_KEY);
    if (!key) { key = newIdempotencyKey(); sessionStorage.setItem(PENDING_KEY, key); }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ order: { number: string }; accessToken: string | null }>("/checkout", {
        method: "POST", headers: { "Idempotency-Key": key },
        body: {
          email: v("email"),
          shippingAddress: { name: v("name"), line1: v("line1"), line2: v("line2") || null, city: v("city"),
            region: v("region") || null, postcode: v("postcode"), country: v("country") || "US" },
          card: { number: v("cardNumber"), expiry: v("expiry"), cvc: v("cvc") },
        },
      });
      sessionStorage.removeItem(PENDING_KEY);
      if (res.accessToken) sessionStorage.setItem(`ps.order.${res.order.number}`, res.accessToken);
      await refreshCart();
      navigate(`/orders/${res.order.number}?placed=1`);
    } catch (err) {
      if (err instanceof ApiProblem) {
        // A definitive answer ends this attempt: the next try needs a new key.
        if (err.status !== 503 && err.status !== 0 && err.code !== "CHECKOUT_IN_PROGRESS") sessionStorage.removeItem(PENDING_KEY);
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  const fe = error?.fields ?? {};
  const t = cart.totals;
  return (
    <section>
      <h1>Checkout</h1>
      <div className="checkout">
        <form ref={form} onSubmit={submit} className="stack wide" noValidate>
          <h2>Contact</h2>
          <label className="field">Email<input name="email" type="email" defaultValue={user?.email ?? ""} required />{fe.email && <span className="field-error">{fe.email}</span>}</label>
          <h2>Shipping address</h2>
          <label className="field">Full name<input name="name" defaultValue={user?.name ?? ""} required /></label>
          <label className="field">Address<input name="line1" required />{fe["shippingAddress.line1"] && <span className="field-error">{fe["shippingAddress.line1"]}</span>}</label>
          <label className="field">Apartment, suite (optional)<input name="line2" /></label>
          <div className="row">
            <label className="field">City<input name="city" required /></label>
            <label className="field">State<input name="region" /></label>
            <label className="field">ZIP / postcode<input name="postcode" required />{fe["shippingAddress.postcode"] && <span className="field-error">{fe["shippingAddress.postcode"]}</span>}</label>
          </div>
          <input type="hidden" name="country" value="US" />
          <h2>Payment</h2>
          <p className="muted small">Test cards: 4242 4242 4242 4242 succeeds, 4000 0000 0000 0002 is declined. No real money moves.</p>
          <label className="field">Card number<input name="cardNumber" inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" required />{fe["card.number"] && <span className="field-error">{fe["card.number"]}</span>}</label>
          <div className="row">
            <label className="field">Expiry (MM/YY)<input name="expiry" placeholder="12/30" required />{fe["card.expiry"] && <span className="field-error">{fe["card.expiry"]}</span>}</label>
            <label className="field">CVC<input name="cvc" inputMode="numeric" placeholder="123" required /></label>
          </div>
          <ErrorNote error={error} />
          <button type="submit" className="place-order" disabled={busy}>{busy ? "Placing order…" : "Place order"}</button>
        </form>
        <aside className="summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <ul className="plain">
            {cart.items.map((i) => <li key={i.variantId}>{i.quantity} × {i.name} <span className="muted">({i.variantLabel})</span><span>{formatPrice(i.lineTotalCents)}</span></li>)}
          </ul>
          <dl className="totals">
            <dt>Subtotal</dt><dd>{formatPrice(t.subtotalCents)}</dd>
            {t.discountCents > 0 && (<><dt>Discount</dt><dd>-{formatPrice(t.discountCents)}</dd></>)}
            <dt>Shipping</dt><dd>{t.shippingCents === 0 ? "Free" : formatPrice(t.shippingCents)}</dd>
            <dt>Tax</dt><dd>{formatPrice(t.taxCents)}</dd>
            <dt>Total</dt><dd><strong data-testid="checkout-total">{formatPrice(t.totalCents)}</strong></dd>
          </dl>
        </aside>
      </div>
    </section>
  );
}
