import { beforeEach, describe, expect, it } from "vitest";
import { PRODUCTS } from "./catalog";
import { addToCart, cartTotalCents, itemCount, removeFromCart, setQuantity } from "./cart";

describe("cart", () => {
  beforeEach(() => localStorage.clear());

  it("adds a new product with quantity 1", () => {
    expect(addToCart([], "p1")).toEqual([{ productId: "p1", quantity: 1 }]);
  });

  it("increments an existing line instead of duplicating it", () => {
    expect(addToCart([{ productId: "p1", quantity: 1 }], "p1")).toEqual([{ productId: "p1", quantity: 2 }]);
  });

  it("never sets a quantity below 1", () => {
    expect(setQuantity([{ productId: "p1", quantity: 2 }], "p1", 0)).toEqual([{ productId: "p1", quantity: 1 }]);
  });

  it("counts items across lines", () => {
    expect(itemCount([{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 3 }])).toBe(5);
  });

  it("multiplies each line's unit price by its quantity in the total", () => {
    const [a, b] = PRODUCTS;
    const lines = [
      { productId: a.id, quantity: 3 },
      { productId: b.id, quantity: 2 },
    ];
    expect(cartTotalCents(lines)).toBe(a.priceCents * 3 + b.priceCents * 2);
  });

  it("totals an empty cart as zero", () => {
    expect(cartTotalCents([])).toBe(0);
  });

  it("removes only the matching line", () => {
    expect(removeFromCart([{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }], "p1")).toEqual([
      { productId: "p2", quantity: 1 },
    ]);
  });
});
