import { beforeEach, describe, expect, it } from "vitest";
import { addToCart, itemCount, setQuantity } from "./cart";

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
});
