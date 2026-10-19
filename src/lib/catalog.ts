export interface Product {
  id: string;
  name: string;
  priceCents: number;
  category: "Bags" | "Bottles" | "Notebooks";
  description: string;
  // Image URLs for the preview carousel; missing ones are filled with default images.
  images?: readonly string[];
}

// Seed data: the app is static, so the catalog ships with the bundle.
export const PRODUCTS: readonly Product[] = [
  {
    id: "p1", name: "Canvas Tote", priceCents: 2400, category: "Bags",
    description: "Sturdy cotton tote with a roomy main pocket.",
  },
  {
    id: "p2", name: "Steel Bottle", priceCents: 1800, category: "Bottles",
    description: "Insulated bottle that keeps drinks cold all day.",
  },
  {
    id: "p3", name: "Dot Grid Notebook", priceCents: 950, category: "Notebooks",
    description: "A5 notebook with 120 dot grid pages.",
  },
  {
    id: "p4", name: "Laptop Sleeve", priceCents: 3200, category: "Bags",
    description: "Padded felt sleeve for laptops up to 14 inches.",
  },
  {
    id: "p5", name: "Glass Bottle", priceCents: 1500, category: "Bottles",
    description: "Clear glass bottle with a silicone grip.",
  },
  {
    id: "p6", name: "Pocket Notebook", priceCents: 450, category: "Notebooks",
    description: "Slim lined notebook that fits in any pocket.",
  },
];

export function searchProducts(query: string): Product[] {
  const q = query.trim();
  if (!q) return [...PRODUCTS];
  return PRODUCTS.filter((p) => p.name.includes(q));
}

export const formatPrice = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// Generic placeholder shown for every product until real photos exist. Inline SVG, so it ships with the bundle.
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
      '<rect width="320" height="200" fill="#eeede8"/>' +
      '<path d="M110 140l35-45 25 30 18-22 32 37z" fill="#c9c8c0"/>' +
      '<circle cx="205" cy="70" r="14" fill="#c9c8c0"/>' +
      "</svg>",
  );
