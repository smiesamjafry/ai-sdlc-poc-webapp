import { useState } from "react";
import { formatPrice } from "../lib/catalog";
import { cartTotalCents, type CartLine } from "../lib/cart";

export function CheckoutPage({ lines, onPlaced }: { lines: CartLine[]; onPlaced: () => void }) {
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return (
      <section>
        <h1>Thank you!</h1>
        <p role="status">Your order has been placed.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Checkout</h1>
      <p>
        Order total: <strong>{formatPrice(cartTotalCents(lines))}</strong>
      </p>
      <label className="field">
        Shipping address
        <textarea rows={3} placeholder="Street, city, postcode" />
      </label>
      <button
        type="button"
        className="place-order"
        disabled={lines.length === 0}
        onClick={() => {
          setPlaced(true);
          onPlaced();
        }}
      >
        Place order
      </button>
    </section>
  );
}
