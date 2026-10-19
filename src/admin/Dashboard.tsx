import { formatPrice } from "@pocket/shared";
import { Link } from "react-router-dom";
import { useApi } from "../lib/store";
import { ErrorNote, Loading } from "../components/ui";

interface Dash {
  revenue: { todayCents: number; last7Cents: number; last30Cents: number }; orders: { today: number; last30: number };
  aovCents: number; topProducts: { name: string; units: number; revenueCents: number }[];
  lowStock: { id: string; sku: string; name: string; stock: number }[]; cache: { hitRate: number | null };
}

export function DashboardPage() {
  const { data, error, loading, reload } = useApi<Dash>("/admin/dashboard");
  return (
    <section>
      <h1>Dashboard</h1>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      {data && (
        <>
          <div className="tiles">
            <Tile label="Revenue today" value={formatPrice(data.revenue.todayCents)} />
            <Tile label="Last 7 days" value={formatPrice(data.revenue.last7Cents)} />
            <Tile label="Last 30 days" value={formatPrice(data.revenue.last30Cents)} />
            <Tile label="Orders (30 days)" value={String(data.orders.last30)} />
            <Tile label="Average order" value={formatPrice(data.aovCents)} />
            <Tile label="Catalog cache hit rate" value={data.cache.hitRate === null ? "n/a" : `${data.cache.hitRate}%`} />
          </div>
          <div className="two-col">
            <div>
              <h2>Top products (30 days)</h2>
              <table className="cart"><thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
                <tbody>{data.topProducts.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.units}</td><td>{formatPrice(p.revenueCents)}</td></tr>)}</tbody></table>
            </div>
            <div>
              <h2>Low stock</h2>
              <table className="cart"><thead><tr><th>Variant</th><th>Stock</th></tr></thead>
                <tbody>{data.lowStock.map((v) => <tr key={v.id}><td>{v.name} <span className="muted small">{v.sku}</span></td><td>{v.stock}</td></tr>)}</tbody></table>
              <Link to="/admin/inventory?filter=low">Manage inventory</Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const Tile = ({ label, value }: { label: string; value: string }) => (
  <div className="tile"><span className="muted small">{label}</span><strong>{value}</strong></div>
);
