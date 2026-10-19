import { PRODUCTS, type Product } from "./catalog";

export const CAROUSEL_SIZE = 5;
export const MAX_SIMILAR = 3;

const DEFAULT_COLORS = ["#eeede8", "#e3ece6", "#e6e8f0", "#f0e6e3", "#ece6f0"];

// Default carousel image n (0-based): inline SVG, so it ships with the bundle and never breaks.
export function defaultImage(n: number): string {
  const fill = DEFAULT_COLORS[n % DEFAULT_COLORS.length];
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">' +
        `<rect width="480" height="300" fill="${fill}"/>` +
        '<path d="M165 210l52-68 38 45 27-33 48 56z" fill="#c9c8c0"/>' +
        '<circle cx="308" cy="105" r="21" fill="#c9c8c0"/>' +
        `<text x="240" y="270" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#8a897f">${n + 1}</text>` +
        "</svg>",
    )
  );
}

// Exactly CAROUSEL_SIZE images: the product's own first, then default images.
export function carouselImages(product: Product): string[] {
  const own = (product.images ?? []).slice(0, CAROUSEL_SIZE);
  const defaults = Array.from({ length: CAROUSEL_SIZE - own.length }, (_, i) => defaultImage(own.length + i));
  return [...own, ...defaults];
}

// Wraps an image index into 0..size-1 so Previous on the first image goes to the last.
export const wrapIndex = (index: number, size: number = CAROUSEL_SIZE): number => ((index % size) + size) % size;

// Up to MAX_SIMILAR other products from the same category, never the product itself.
export function similarProducts(product: Product, all: readonly Product[] = PRODUCTS): Product[] {
  return all.filter((p) => p.id !== product.id && p.category === product.category).slice(0, MAX_SIMILAR);
}
