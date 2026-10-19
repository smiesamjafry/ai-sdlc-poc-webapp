import { formatPrice } from "@pocket/shared";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiProblem } from "../lib/api";
import type { OrderDetail } from "../lib/types";
import { ErrorNote, Loading } from "../components/ui";

export function OrderPage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<ApiProblem | null>(null);
  useEffect(() => {
    const token = sessionStorage.getItem(`ps.order.${number}`);
    api<OrderDetail>(`/orders/${number}`, { headers: token ? { "X-Order-Token": token } : {} }).then(setOrder, setError);
  }, [number]);
  if (error) return <section><h1>Order {number}</h1><ErrorNote error={error} /><Link to="/">Back to the shop</Link></section>;
  if (!order) return <Loading />;
  return (
    <section>
      {params.get("placed") ? <><h1>Thank you!</h1><p role="status">Your order has been placed.</p></> : <h1>Order {order.number}</h1>}
      <p>Order <strong>{order.number}</strong> · {new Date(order.createdAt).toLocaleString()} · <span className="badge">{order.status}</span></p>
      {order.trackingNumber && <p>Tracking: {order.trackingNumber}</p>}
      <table className="cart">
        <thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead>
        <tbody>{order.items.map((i) => <tr key={i.id}><td>{i.name} <span className="muted small">{i.variantLabel}</span></td><td>{i.quantity}</td><td>{formatPrice(i.lineTotalCents)}</td></tr>)}</tbody>
      </table>
      <dl className="totals">
        <dt>Subtotal</dt><dd>{formatPrice(order.totals.subtotalCents)}</dd>
        {order.totals.discountCents > 0 && (<><dt>Discount</dt><dd>-{formatPrice(order.totals.discountCents)}</dd></>)}
        <dt>Shipping</dt><dd>{formatPrice(order.totals.shippingCents)}</dd>
        <dt>Tax</dt><dd>{formatPrice(order.totals.taxCents)}</dd>
        <dt>Total</dt><dd><strong>{formatPrice(order.totals.totalCents)}</strong></dd>
        {order.totals.refundedCents > 0 && (<><dt>Refunded</dt><dd>{formatPrice(order.totals.refundedCents)}</dd></>)}
      </dl>
      <h2>Timeline</h2>
      <ol className="timeline">{order.events.map((e, i) => <li key={i}><strong>{e.type}</strong> {e.detail ?? ""} <span className="muted small">{new Date(e.createdAt).toLocaleString()}</span></li>)}</ol>
      <Link to="/products">Continue shopping</Link>
    </section>
  );
}
