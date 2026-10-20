import { expect, test, type Page } from "@playwright/test";

const RATING = /(\d) out of 5 stars?/;

async function slugs(page: Page) {
  await page.goto("/#/products");
  const links = page.locator("a.card-link");
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  return hrefs.map((h) => h.split("/products/")[1]);
}

async function openProduct(page: Page, slug: string) {
  await page.goto(`/#/products/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

const reviewItems = (page: Page) => page.getByRole("listitem").filter({ hasText: /out of 5 stars?/ });

async function reviewTexts(page: Page) {
  await expect(reviewItems(page).first()).toBeVisible();
  return (await reviewItems(page).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
}

test("C1: product page has a Reviews section heading below the product details", async ({ page }) => {
  const [slug] = await slugs(page);
  await openProduct(page, slug);
  const heading = page.getByRole("heading", { name: "Reviews" });
  await expect(heading).toBeVisible();
  const info = await page.getByRole("button", { name: /Add to cart|Choose options/ }).boundingBox();
  const box = await heading.boundingBox();
  expect(box!.y).toBeGreaterThan(info!.y);
});

test("C2: every product shows 3 to 5 reviews with name, picture and comment", async ({ page }) => {
  const all = await slugs(page);
  for (const slug of all.slice(0, 3)) {
    await openProduct(page, slug);
    await expect(reviewItems(page).first()).toBeVisible();
    const items = reviewItems(page);
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const item = items.nth(i);
      await expect(item.getByRole("img").first()).toBeVisible();
      const text = (await item.innerText()).replace(RATING, "").replace(/[★☆]/g, "");
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    }
  }
});

test("C3: each review has a whole-number star rating from 1 to 5 as text", async ({ page }) => {
  const [slug] = await slugs(page);
  await openProduct(page, slug);
  const texts = await reviewTexts(page);
  expect(texts.length).toBeGreaterThanOrEqual(3);
  for (const t of texts) {
    const m = t.match(RATING);
    expect(m).not.toBeNull();
    const n = Number(m![1]);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
  }
});

test("C4: reviews are stable across reloads and differ between products", async ({ page }) => {
  const [a, b] = await slugs(page);
  await openProduct(page, a);
  const first = await reviewTexts(page);
  await page.reload();
  const again = await reviewTexts(page);
  expect(again).toEqual(first);
  await openProduct(page, b);
  const other = await reviewTexts(page);
  expect(other.length).toBeGreaterThan(0);
  expect(other).not.toEqual(first);
});

test("C5: choosing colour and size and clicking Add to cart still adds the item", async ({ page }) => {
  const [slug] = await slugs(page);
  await openProduct(page, slug);
  for (const legend of ["Colour", "Size"]) {
    const group = page.getByRole("group", { name: legend });
    if (await group.count()) await group.getByRole("button", { disabled: false }).first().click();
  }
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your cart." })).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
});

test("C6: product page shows name, price and images and the catalog lists products", async ({ page }) => {
  const [slug] = await slugs(page);
  const name = await page.locator("a.card-link h3").first().innerText();
  await openProduct(page, slug);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText(/\$\d+\.\d{2}/).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /image$/ }).first()).toBeVisible();
  await page.goto("/#/products");
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name }).first()).toBeVisible();
});
