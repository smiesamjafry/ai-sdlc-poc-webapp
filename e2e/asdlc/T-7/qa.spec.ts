import { expect, test, type Page } from "@playwright/test";

const CONFIRMATION = "Thanks! Your question will appear once it has been answered.";

async function ask(page: Page, slug: string, text: string) {
  await page.goto(`./#/products/${slug}`);
  await expect(page.getByRole("heading", { name: "Questions & Answers" })).toBeVisible();
  await page.getByRole("textbox", { name: /question/i }).fill(text);
  await page.getByRole("button", { name: "Ask a question" }).click();
  await expect(page.getByText(CONFIRMATION)).toBeVisible();
}

async function adminSignIn(page: Page) {
  await page.goto("./#/login");
  await page.getByLabel("Email").fill("admin@shop.test");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page).not.toHaveURL(/#\/login/);
}

async function answer(page: Page, question: string, reply: string) {
  await adminSignIn(page);
  await page.goto("./#/admin/questions");
  const item = page.getByRole("listitem").filter({ hasText: question });
  await expect(item).toBeVisible();
  await item.getByLabel("Answer").fill(reply);
  await item.getByRole("button", { name: /save/i }).click();
  await expect(item).toHaveCount(0);
}

test("C1: guest asks a question and sees the confirmation", async ({ page }) => {
  await ask(page, "linen-shirt", "Does this run true to size?");
});

test("C2: empty or whitespace question shows an error and creates nothing", async ({ page }) => {
  await page.goto("./#/products/linen-shirt");
  await expect(page.getByRole("heading", { name: "Questions & Answers" })).toBeVisible();
  await page.getByRole("textbox", { name: /question/i }).fill("   ");
  await page.getByRole("button", { name: "Ask a question" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText(CONFIRMATION)).toHaveCount(0);
});

test("C3: unanswered question is not shown to other visitors", async ({ page, browser }) => {
  const text = `Unanswered question ${Date.now()}`;
  await ask(page, "linen-shirt", text);
  const other = await browser.newPage();
  await other.goto("./#/products/linen-shirt");
  await expect(other.getByRole("heading", { name: "Questions & Answers" })).toBeVisible();
  await expect(other.getByText(text)).toHaveCount(0);
  await other.close();
});

test("C4: admin lists unanswered questions and answering removes it from the list", async ({ page, browser }) => {
  const text = `Admin list question ${Date.now()}`;
  const guest = await browser.newPage();
  await ask(guest, "linen-shirt", text);
  await guest.close();
  await adminSignIn(page);
  await page.goto("./#/admin/questions");
  const item = page.getByRole("listitem").filter({ hasText: text });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Linen Shirt");
  await item.getByLabel("Answer").fill("Yes, it fits true to size.");
  await item.getByRole("button", { name: /save/i }).click();
  await expect(item).toHaveCount(0);
});

test("C5: answered question and answer are visible to visitors on that product only", async ({ page, browser }) => {
  const text = `Answered question ${Date.now()}`;
  const reply = `Answer ${Date.now()}`;
  const guest = await browser.newPage();
  await ask(guest, "linen-shirt", text);
  await answer(page, text, reply);
  await guest.goto("./#/products/linen-shirt");
  await expect(guest.getByText(text)).toBeVisible();
  await expect(guest.getByText(reply)).toBeVisible();
  await guest.goto("./#/products/canvas-tote");
  await expect(guest.getByRole("heading", { name: "Canvas Tote" })).toBeVisible();
  await expect(guest.getByText(text)).toHaveCount(0);
  await guest.close();
});

test("C6: choosing colour and size and clicking Add to cart still adds the item", async ({ page }) => {
  await page.goto("./#/products/linen-shirt");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const legend of ["Colour", "Size"]) {
    const group = page.getByRole("group", { name: legend });
    if (await group.count()) await group.getByRole("button").and(page.locator(":enabled")).first().click();
  }
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
});
