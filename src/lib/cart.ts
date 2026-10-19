import { PRODUCTS, type Product } from "./catalog";

export interface CartLine {
  productId: string;
  quantity: number;
}

const STORAGE_KEY = "pocket-shop.cart";

export function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
}

export function addToCart(lines: CartLine[], productId: string): CartLine[] {
  const existing = lines.find((l) => l.productId === productId);
  if (existing) {
    return lines.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l));
  }
  return [...lines, { productId, quantity: 1 }];
}

export function setQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  return lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, quantity) } : l));
}

export function removeFromCart(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((l) => l.productId !== productId);
}

export function productFor(line: CartLine): Product | undefined {
  return PRODUCTS.find((p) => p.id === line.productId);
}

export function cartTotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + (productFor(line)?.priceCents ?? 0) * line.quantity, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
