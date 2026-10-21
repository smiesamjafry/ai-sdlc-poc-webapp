export interface RatingSummary { average: number | null; count: number }

export const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/** "1 star", "4 stars": accessible name of each star choice. */
export const starsLabel = (n: number) => `${n} ${n === 1 ? "star" : "stars"}`;

/** Average to one decimal place ("4.5", "4.0"); null when nobody has rated yet. */
export function formatAverage(s: RatingSummary): string | null {
  return s.count > 0 && s.average !== null ? s.average.toFixed(1) : null;
}

export const ratingCountLabel = (n: number) => `${n} ${n === 1 ? "rating" : "ratings"}`;
