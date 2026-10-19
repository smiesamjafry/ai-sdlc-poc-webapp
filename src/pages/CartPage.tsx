import { Link } from "react-router-dom";
import { formatPrice } from "../lib/catalog";
import { cartTotalCents, productFor, type CartLine } from "../lib/cart";

export function CartPage({
  lines,
  onQuantity,
  onRemove,
}: {
  lines: CartLine[];
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <section>
        <h1>Your cart</h1>
        <p>Your cart is empty.</p>
        <p className="total">
          Total: <strong data-testid="cart-total">{formatPrice(0)}</strong>
        </p>
        <Link to="/">Browse products</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>Your cart</h1>
      <table className="cart">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Qty</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const product = productFor(line);
            if (!product) return null;
            return (
              <tr key={line.productId}>
                <td>{product.name}</td>
                <td>{formatPrice(product.priceCents)}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    aria-label={`Quantity of ${product.name}`}
                    onChange={(e) => onQuantity(line.productId, Number(e.target.value))}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={() => onRemove(line.productId)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="total">
        Total: <strong data-testid="cart-total">{formatPrice(cartTotalCents(lines))}</strong>
      </p>
      <Link to="/checkout" className="button">
        Go to checkout
      </Link>
    </section>
  );
}
