import { Link } from "react-router-dom";
import { formatPrice } from "../lib/catalog";
import { cartTotalCents, productFor, type CartLine } from "../lib/cart";

export function CartPage({
  lines,
  onQuantity,
}: {
  lines: CartLine[];
  onQuantity: (productId: string, quantity: number) => void;
}) {
  if (lines.length === 0) {
    return (
      <section>
        <h1>Your cart</h1>
        <p>Your cart is empty.</p>
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
