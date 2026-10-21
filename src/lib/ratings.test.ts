import { formatAverage, ratingCountLabel, starsLabel } from "./ratings";

describe("rating display helpers", () => {
  it.each([
    [{ average: 4.5, count: 2 }, "4.5"],
    [{ average: 4, count: 3 }, "4.0"],
    [{ average: 3.67, count: 3 }, "3.7"],
    [{ average: null, count: 0 }, null],
  ])("formats %o as %s", (summary, expected) => {
    expect(formatAverage(summary)).toBe(expected);
  });

  it("pluralises star and rating labels", () => {
    expect(starsLabel(1)).toBe("1 star");
    expect(starsLabel(4)).toBe("4 stars");
    expect(ratingCountLabel(1)).toBe("1 rating");
    expect(ratingCountLabel(2)).toBe("2 ratings");
  });
});
