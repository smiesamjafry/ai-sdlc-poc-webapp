import { avatarSrc, initials, mockReviews } from "./reviews";

describe("mock product reviews", () => {
  const slugs = ["linen-shirt", "canvas-tote", "wool-beanie", "trail-runner", "denim-jacket", "a", ""];

  it.each(slugs)("gives %j 3 to 5 complete reviews with whole-star ratings", (slug) => {
    const reviews = mockReviews(slug);
    expect(reviews.length).toBeGreaterThanOrEqual(3);
    expect(reviews.length).toBeLessThanOrEqual(5);
    for (const r of reviews) {
      expect(r.name).not.toBe("");
      expect(r.comment).not.toBe("");
      expect(Number.isInteger(r.rating)).toBe(true);
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
    expect(new Set(reviews.map((r) => r.name)).size).toBe(reviews.length);
  });

  it("returns the same reviews for the same product every time", () => {
    expect(mockReviews("linen-shirt")).toEqual(mockReviews("linen-shirt"));
  });

  it("gives different products different reviews", () => {
    expect(mockReviews("linen-shirt")).not.toEqual(mockReviews("canvas-tote"));
  });

  it("builds an initials avatar as an inline SVG", () => {
    expect(initials("Ava Thompson")).toBe("AT");
    const src = avatarSrc({ name: "Ava Thompson", avatarColour: "#2f5d50" });
    expect(src.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(src)).toContain(">AT</text>");
  });
});
