import { describe, expect, it } from "vitest";
import { PRODUCTS, type Product } from "./catalog";
import { CAROUSEL_SIZE, carouselImages, defaultImage, similarProducts, wrapIndex } from "./preview";

const tote = PRODUCTS.find((p) => p.id === "p1")!;

describe("carouselImages", () => {
  it("uses 5 default images when a product has none", () => {
    const images = carouselImages(tote);
    expect(images).toHaveLength(CAROUSEL_SIZE);
    expect(images).toEqual([0, 1, 2, 3, 4].map(defaultImage));
  });

  it("keeps the product's own images first and fills the rest", () => {
    const images = carouselImages({ ...tote, images: ["a.png", "b.png"] });
    expect(images).toEqual(["a.png", "b.png", defaultImage(2), defaultImage(3), defaultImage(4)]);
  });

  it("never returns more than 5 images", () => {
    expect(carouselImages({ ...tote, images: ["1", "2", "3", "4", "5", "6"] })).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("wrapIndex", () => {
  it("wraps past both ends", () => {
    expect(wrapIndex(-1)).toBe(4);
    expect(wrapIndex(5)).toBe(0);
    expect(wrapIndex(2)).toBe(2);
  });
});

describe("similarProducts", () => {
  it("returns other products from the same category", () => {
    expect(similarProducts(tote).map((p) => p.name)).toEqual(["Laptop Sleeve"]);
  });

  it("caps the list at 3 and excludes the current product", () => {
    const many: Product[] = Array.from({ length: 6 }, (_, i) => ({ ...tote, id: `x${i}` }));
    const result = similarProducts(many[0], many);
    expect(result.map((p) => p.id)).toEqual(["x1", "x2", "x3"]);
  });
});
