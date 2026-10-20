import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://localhost:4000/api/v1";

async function answered(request: APIRequestContext, slug: string): Promise<number> {
  const res = await request.get(`${API}/products/${slug}/questions`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { items: unknown[] }).items.length;
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email: "admin@shop.test", password: "demo1234" } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Ask a question through the public API; returns its id (found in the admin queue) so it can be answered. */
async function ask(request: APIRequestContext, token: string, slug: string, text: string): Promise<string> {
  const res = await request.post(`${API}/products/${slug}/questions`, { data: { question: text } });
  expect(res.ok()).toBeTruthy();
  const list = await request.get(`${API}/admin/questions`, { headers: { Authorization: `Bearer ${token}` } });
  const items = ((await list.json()) as { items: { id: string; question: string }[] }).items;
  const found = items.find((q) => q.question === text);
  expect(found).toBeTruthy();
  return found!.id;
}

async function reply(request: APIRequestContext, token: string, id: string, answer: string) {
  const res = await request.post(`${API}/admin/questions/${id}/answer`, {
    data: { answer },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
}

async function addAnswered(request: APIRequestContext, slug: string, n: number, tag: string) {
  const token = await adminToken(request);
  for (let i = 1; i <= n; i++) {
    const id = await ask(request, token, slug, `${tag} question ${i}`);
    await reply(request, token, id, `${tag} answer ${i}`);
  }
}

test("C1: product page with no answered questions shows \"Questions (0)\"", async ({ page, request }) => {
  // glass-bottle is never given answers by these tests
  expect(await answered(request, "glass-bottle")).toBe(0);
  await page.goto("./#/products/glass-bottle");
  await expect(page.getByRole("heading", { name: "Questions & Answers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions (0)", exact: true })).toBeVisible();
});

test("C2: product page with 3 answered questions shows \"Questions (3)\" and lists them", async ({ page, request }) => {
  const before = await answered(request, "pocket-notebook");
  expect(before).toBe(0);
  const tag = `C2-${Date.now()}`;
  await addAnswered(request, "pocket-notebook", 3, tag);
  await page.goto("./#/products/pocket-notebook");
  await expect(page.getByText(`${tag} question 3`)).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await expect(page.getByText(`${tag} question ${i}`)).toBeVisible();
    await expect(page.getByText(`${tag} answer ${i}`)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Questions (3)", exact: true })).toBeVisible();
});

test("C3: count ignores unanswered questions and grows by 1 once answered", async ({ page, request }) => {
  const slug = "dot-grid-notebook";
  const base = await answered(request, slug);
  const text = `C3 question ${Date.now()}`;
  const token = await adminToken(request);
  await page.goto(`./#/products/${slug}`);
  await page.getByRole("textbox", { name: /question/i }).fill(text);
  await page.getByRole("button", { name: "Ask a question" }).click();
  await expect(page.getByText("Thanks! Your question will appear once it has been answered.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Questions & Answers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: `Questions (${base})`, exact: true })).toBeVisible();
  const list = await request.get(`${API}/admin/questions`, { headers: { Authorization: `Bearer ${token}` } });
  const id = ((await list.json()) as { items: { id: string; question: string }[] }).items.find((q) => q.question === text)!.id;
  await reply(request, token, id, "C3 answer");
  await page.reload();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Questions (${base + 1})`, exact: true })).toBeVisible();
});

test("C4: count only includes that product's questions", async ({ page, request }) => {
  const baseA = await answered(request, "steel-bottle");
  const baseB = await answered(request, "laptop-sleeve");
  const tag = `C4-${Date.now()}`;
  await addAnswered(request, "steel-bottle", 2, `${tag}a`);
  await addAnswered(request, "laptop-sleeve", 4, `${tag}b`);
  await page.goto("./#/products/steel-bottle");
  await expect(page.getByText(`${tag}a question 2`)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Questions (${baseA + 2})`, exact: true })).toBeVisible();
  await page.goto("./#/products/laptop-sleeve");
  await expect(page.getByText(`${tag}b question 4`)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Questions (${baseB + 4})`, exact: true })).toBeVisible();
});

test("C5: visitor can still ask a question and answered questions show their answer", async ({ page, request }) => {
  const tag = `C5-${Date.now()}`;
  await addAnswered(request, "oxford-shirt", 1, tag);
  await page.goto("./#/products/oxford-shirt");
  await expect(page.getByText(`${tag} question 1`)).toBeVisible();
  await expect(page.getByText(`${tag} answer 1`)).toBeVisible();
  await page.getByRole("textbox", { name: /question/i }).fill(`${tag} new one`);
  await page.getByRole("button", { name: "Ask a question" }).click();
  await expect(page.getByText("Thanks! Your question will appear once it has been answered.")).toBeVisible();
});
