import { priceCart, type PriceLine } from "./pricing";

const settings = { taxRateBps: 825, flatShippingCents: 599, freeShippingThresholdCents: 7500 };
const line = (o: Partial<PriceLine>): PriceLine => ({
  variantId: "v1", productId: "p1", categoryId: "c1", unitPriceCents: 1000, quantity: 1, ...o,
});

describe("priceCart (§7.1)", () => {
  it.each([
    // [label, lines, promo, expected {subtotal, discount, shipping, tax, total}]
    ["quantity multiplies", [line({ quantity: 3 })], null, { s: 3000, d: 0, sh: 599, t: 248, tot: 3847 }],
    ["threshold equality ships free", [line({ unitPriceCents: 7500 })], null, { s: 7500, d: 0, sh: 0, t: 619, tot: 8119 }],
    ["percentage rounds half up", [line({ unitPriceCents: 1050 })], { type: "percentage", value: 5, scope: { kind: "all" }, minSubtotalCents: 0 }, { s: 1050, d: 53, sh: 599, t: 82, tot: 1678 }],
    ["fixed capped at eligible", [line({ unitPriceCents: 500 })], { type: "fixed", value: 900, scope: { kind: "all" }, minSubtotalCents: 0 }, { s: 500, d: 500, sh: 599, t: 0, tot: 599 }],
    ["min subtotal not met", [line({})], { type: "fixed", value: 200, scope: { kind: "all" }, minSubtotalCents: 5000 }, { s: 1000, d: 0, sh: 599, t: 83, tot: 1682 }],
    ["scoped to other category", [line({})], { type: "percentage", value: 50, scope: { kind: "categories", ids: ["c2"] }, minSubtotalCents: 0 }, { s: 1000, d: 0, sh: 599, t: 83, tot: 1682 }],
    ["free shipping coupon", [line({})], { type: "free_shipping", value: 0, scope: { kind: "all" }, minSubtotalCents: 0 }, { s: 1000, d: 0, sh: 0, t: 83, tot: 1083 }],
    ["empty cart", [], null, { s: 0, d: 0, sh: 0, t: 0, tot: 0 }],
  ] as const)("%s", (_label, lines, promo, e) => {
    const t = priceCart([...lines], settings, promo as never);
    expect([t.subtotalCents, t.discountCents, t.shippingCents, t.taxCents, t.totalCents]).toEqual([e.s, e.d, e.sh, e.t, e.tot]);
  });
});
