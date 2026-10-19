export interface ProductCard {
  id: string; slug: string; name: string; category: string | null; categoryName: string | null;
  priceCents: number; compareAtCents: number | null; inStock: boolean; image: string | null; imageAlt: string;
}
export interface ProductList { items: ProductCard[]; page: number; pageSize: number; total: number }
export interface Variant {
  id: string; sku: string; size: string | null; colour: string | null; priceCents: number;
  compareAtCents: number | null; stock: number; inStock: boolean; lowStock: boolean;
}
export interface Product {
  id: string; slug: string; name: string; description: string; brand: string; category: string | null;
  categoryName: string | null; images: { url: string; alt: string }[]; variants: Variant[];
}
export interface Totals {
  subtotalCents: number; discountCents: number; shippingCents: number; freeShipping: boolean; taxCents: number; totalCents: number;
}
export interface CartItem {
  variantId: string; productSlug: string; name: string; variantLabel: string; sku: string; image: string | null;
  unitPriceCents: number; quantity: number; lineTotalCents: number; stock: number; overStock: boolean;
}
export interface Cart {
  id: string | null; items: CartItem[]; itemCount: number; totals: Totals;
  coupon: { code: string; applied: boolean; error: string | null; label: string | null } | null;
  settings: { freeShippingThresholdCents: number }; cartToken?: string;
}
export interface OrderDetail {
  number: string; email: string; status: string; paymentStatus: string; createdAt: string; trackingNumber: string | null;
  couponCode: string | null; shippingAddress: Record<string, string>;
  items: { id: string; name: string; variantLabel: string; sku: string; unitPriceCents: number; quantity: number; lineTotalCents: number; refundedQuantity: number }[];
  events: { type: string; detail: string | null; createdAt: string }[];
  refunds: { amountCents: number; reason: string | null; createdAt: string }[];
  totals: Totals & { refundedCents: number };
}
