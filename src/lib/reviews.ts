// Mock customer reviews for the product page. Not stored anywhere: picked from fixed
// pools with a PRNG seeded by the product slug, so a product always shows the same reviews.

export interface Review {
  name: string;
  rating: number; // whole stars, 1 to 5
  comment: string;
  avatarColour: string;
}

const NAMES = [
  "Ava Thompson", "Liam Chen", "Sofia Rossi", "Noah Patel", "Maya Johnson", "Ethan Brooks",
  "Zoe Martin", "Lucas Silva", "Isla Murphy", "Omar Haddad", "Grace Kim", "Leo Novak",
  "Nina Petrova", "Sam Okafor", "Ruby Walsh", "Kai Tanaka",
];

const COMMENTS: Record<number, string[]> = {
  5: [
    "Exactly what I was hoping for. The quality is excellent and it arrived quickly.",
    "Love it! I've already recommended it to two friends.",
    "Great fit and feels really well made. Would buy again.",
    "Better than the photos. Very happy with this purchase.",
  ],
  4: [
    "Really nice overall. Took a few days longer to arrive than expected.",
    "Good quality for the price. The colour is slightly different in person.",
    "Comfortable and looks great. Sizing runs a little small.",
    "Very pleased with it, just wish there were more colour options.",
  ],
  3: [
    "It's fine. Does the job, but nothing special.",
    "Decent, though the material is thinner than I expected.",
    "Okay for everyday use. I'd wait for a sale next time.",
  ],
  2: [
    "Not quite what I expected. The stitching came loose after a few weeks.",
    "Sizing was off for me and the exchange took a while.",
  ],
  1: [
    "Disappointed. It didn't match the description at all.",
  ],
};

// Weighted towards good reviews, like a typical shop.
const RATINGS = [5, 5, 5, 4, 4, 4, 3, 3, 2, 1];

const COLOURS = ["#2f5d50", "#7a4e2d", "#3d5a80", "#8a3b5c", "#5c6b2f", "#6b4e8a"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// mulberry32: tiny deterministic PRNG returning [0, 1).
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockReviews(slug: string): Review[] {
  const rand = rng(hash(slug));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const count = 3 + Math.floor(rand() * 3);
  const names = [...NAMES];
  const used = new Set<string>();
  const reviews: Review[] = [];
  for (let i = 0; i < count; i++) {
    const name = names.splice(Math.floor(rand() * names.length), 1)[0];
    const rating = pick(RATINGS);
    const options = COMMENTS[rating].filter((c) => !used.has(c));
    const comment = options.length ? pick(options) : pick(COMMENTS[rating]);
    used.add(comment);
    reviews.push({ name, rating, comment, avatarColour: pick(COLOURS) });
  }
  return reviews;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Inline SVG avatar (initials on a coloured circle), so no image download is needed.
export function avatarSrc(review: Pick<Review, "name" | "avatarColour">): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
    `<circle cx="24" cy="24" r="24" fill="${review.avatarColour}"/>` +
    `<text x="24" y="30" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="#fff">${initials(review.name)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
