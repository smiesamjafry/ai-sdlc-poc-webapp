export interface Product {
  id: string;
  name: string;
  priceCents: number;
  category: "Bags" | "Bottles" | "Notebooks";
}

// Seed data: the app is static, so the catalog ships with the bundle.
export const PRODUCTS: readonly Product[] = [
  { id: "p1", name: "Canvas Tote", priceCents: 2400, category: "Bags" },
  { id: "p2", name: "Steel Bottle", priceCents: 1800, category: "Bottles" },
  { id: "p3", name: "Dot Grid Notebook", priceCents: 950, category: "Notebooks" },
  { id: "p4", name: "Laptop Sleeve", priceCents: 3200, category: "Bags" },
  { id: "p5", name: "Glass Bottle", priceCents: 1500, category: "Bottles" },
  { id: "p6", name: "Pocket Notebook", priceCents: 450, category: "Notebooks" },
];

export function searchProducts(query: string): Product[] {
  const q = query.trim();
  if (!q) return [...PRODUCTS];
  return PRODUCTS.filter((p) => p.name.includes(q));
}

export const formatPrice = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
