import { expect, test, type Browser, type Page } from "@playwright/test";

const API = "http://localhost:4000/api/v1";

async function rate(page: Page, slug: string, stars: number) {
  await page.goto(`./#/products/${slug}`);
  const star = page.getByRole("radio", { name: new RegExp(`^${stars} stars?$`) });
  await expect(star).toBeVisible();
  await star.check();
  await page.getByRole("button", { name: /submit rating/i }).click();
  await expect(page.getByText(/rating (was |has been )?saved/i)).toBeVisible();
}

async function rateAsNewVisitor(browser: Browser, baseURL: string | undefined, slug: string, stars: number) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await rate(page, slug, stars);
  await context.close();
}

test("C1: signed-out visitor sees five stars, rates 4 and sees a saved confirmation", async ({ page }) => {
  await page.goto("./#/products/canvas-tote");
  await expect(page.getByRole("radio", { name: /^\d stars?$/ })).toHaveCount(5);
  await page.getByRole("radio", { name: "4 stars" }).check();
  await page.getByRole("button", { name: /submit rating/i }).click();
  await expect(page.getByText(/rating (was |has been )?saved/i)).toBeVisible();
});

test("C2: product with no ratings shows \"No ratings yet\"", async ({ page }) => {
  await page.goto("./#/products/laptop-sleeve");
  await expect(page.getByRole("heading", { name: "Questions & Answers" })).toBeVisible();
  await expect(page.getByText("No ratings yet")).toBeVisible();
});

test("C3: ratings of 5 and 4 show average 4.5 and 2 ratings", async ({ browser, baseURL }) => {
  await rateAsNewVisitor(browser, baseURL, "steel-bottle", 5);
  await rateAsNewVisitor(browser, baseURL, "steel-bottle", 4);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("./#/products/steel-bottle");
  await expect(page.getByText("4.5", { exact: false })).toBeVisible();
  await expect(page.getByText("2 ratings")).toBeVisible();
  await context.close();
});

test("C4: average and count persist after reload and for another visitor", async ({ page, browser, baseURL }) => {
  await rate(page, "zip-hoodie", 5);
  await rateAsNewVisitor(browser, baseURL, "zip-hoodie", 4);
  await page.reload();
  await expect(page.getByText("4.5", { exact: false })).toBeVisible();
  await expect(page.getByText("2 ratings")).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await other.goto("./#/products/zip-hoodie");
  await expect(other.getByText("4.5", { exact: false })).toBeVisible();
  await expect(other.getByText("2 ratings")).toBeVisible();
  await context.close();
});

test("C5: Q&A section shows heading with count and answered questions", async ({ page, request }) => {
  const slug = "pocket-tee";
  const login = await request.post(`${API}/auth/login`, { data: { email: "admin@shop.test", password: "demo1234" } });
  expect(login.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}` };
  const tag = `T9-${Date.now()}`;
  for (let i = 1; i <= 3; i++) {
    const q = `${tag} question ${i}`;
    const asked = await request.post(`${API}/products/${slug}/questions`, { data: { question: q } });
    expect(asked.status(), await asked.text()).toBe(201);
    const list = await request.get(`${API}/admin/questions`, { headers });
    const found = ((await list.json()) as { items: { id: string; question: string }[] }).items.find((x) => x.question === q);
    expect(found).toBeTruthy();
    const ans = await request.post(`${API}/admin/questions/${found!.id}/answer`, { data: { answer: `${tag} answer ${i}` }, headers });
    expect(ans.ok()).toBeTruthy();
  }
  const res = await request.get(`${API}/products/${slug}/questions`);
  const n = ((await res.json()) as { items: unknown[] }).items.length;
  await page.goto(`./#/products/${slug}`);
  await expect(page.getByRole("heading", { name: "Questions & Answers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: `Questions (${n})`, exact: true })).toBeVisible();
  await expect(page.getByText(`${tag} question 3`)).toBeVisible();
  await expect(page.getByText(`${tag} answer 3`)).toBeVisible();
});

test("C6: choosing colour and size and clicking Add to cart adds the item", async ({ page }) => {
  await page.goto("./#/products/everyday-tee");
  await page.getByRole("button", { name: "White", exact: true }).click();
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
});
