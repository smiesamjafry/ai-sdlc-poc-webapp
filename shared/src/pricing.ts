import { roundHalfUp } from "./money";

// §7.1 Totals. The server is the only authoritative caller; the SPA may use it for display hints.
export interface PriceLine {
  variantId: string;
  productId: string;
  categoryId: string | null;
  unitPriceCents: number;
  quantity: number;
}

export type Promotion =
  | { type: "percentage"; value: number; scope: Scope; minSubtotalCents: number }
  | { type: "fixed"; value: number; scope: Scope; minSubtotalCents: number }
  | { type: "free_shipping"; value: 0; scope: Scope; minSubtotalCents: number };

export type Scope = { kind: "all" } | { kind: "categories"; ids: string[] } | { kind: "products"; ids: string[] };

export interface StoreSettings {
  taxRateBps: number;
  flatShippingCents: number;
  freeShippingThresholdCents: number;
}

export interface Totals {
  lines: Array<PriceLine & { lineTotalCents: number }>;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  freeShipping: boolean;
  taxCents: number;
  totalCents: number;
}

export function inScope(line: PriceLine, scope: Scope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "categories") return line.categoryId !== null && scope.ids.includes(line.categoryId);
  return scope.ids.includes(line.productId);
}

export function priceCart(lines: PriceLine[], settings: StoreSettings, promo: Promotion | null = null): Totals {
  const priced = lines.map((l) => ({ ...l, lineTotalCents: l.unitPriceCents * l.quantity }));
  const subtotalCents = priced.reduce((s, l) => s + l.lineTotalCents, 0);
  let discountCents = 0;
  let promoFreeShipping = false;
  if (promo && subtotalCents >= promo.minSubtotalCents) {
    const eligible = priced.filter((l) => inScope(l, promo.scope)).reduce((s, l) => s + l.lineTotalCents, 0);
    if (promo.type === "percentage") discountCents = roundHalfUp((eligible * promo.value) / 100);
    else if (promo.type === "fixed") discountCents = Math.min(promo.value, eligible);
    else promoFreeShipping = eligible > 0;
  }
  const afterDiscount = subtotalCents - discountCents;
  const freeShipping =
    subtotalCents === 0 || promoFreeShipping || afterDiscount >= settings.freeShippingThresholdCents;
  const shippingCents = freeShipping ? 0 : settings.flatShippingCents;
  const taxCents = roundHalfUp((afterDiscount * settings.taxRateBps) / 10000);
  return {
    lines: priced,
    subtotalCents,
    discountCents,
    shippingCents,
    freeShipping,
    taxCents,
    totalCents: afterDiscount + shippingCents + taxCents,
  };
}
