import { expect, test } from "@playwright/test";
import { API, signIn } from "./helpers";

test("admin price edit shows on the storefront: next fetch is a MISS with the new price, then a HIT", async ({ page, request }) => {
  const first = await request.get(`${API}/api/v1/products/linen-shirt`);
  const product = await first.json();
  await signIn(page, "admin@shop.test");
  await page.goto(`./#/admin/products/${product.id}`);
  const price = page.getByLabel("Price").first();
  await price.fill("12.34");
  await price.blur();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  const miss = await request.get(`${API}/api/v1/products/linen-shirt`);
  expect(miss.headers()["x-cache"]).toBe("MISS");
  expect((await miss.json()).variants.some((v: { priceCents: number }) => v.priceCents === 1234)).toBe(true);
  expect((await request.get(`${API}/api/v1/products/linen-shirt`)).headers()["x-cache"]).toBe("HIT");
  // The listing shows each product's lowest variant price.
  await page.goto("./#/products?q=Linen");
  await expect(page.getByText("$12.34").first()).toBeVisible();
});

test("staff can run fulfilment but sees the admin-only message on settings", async ({ page }) => {
  await signIn(page, "staff@shop.test");
  await page.goto("./#/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await page.goto("./#/admin/settings");
  await expect(page.getByText("Only admins can do this")).toBeVisible();
  await page.goto("./#/admin/orders");
  await page.getByLabel("Status").selectOption("paid");
  await page.getByRole("link", { name: /^PS-/ }).first().click();
  await page.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.getByText("packed", { exact: true }).first()).toBeVisible();
});

test("dashboard, inventory and outbox load for admins", async ({ page }) => {
  await signIn(page, "admin@shop.test");
  await page.goto("./#/admin");
  await expect(page.getByText("Last 30 days")).toBeVisible();
  await page.goto("./#/admin/inventory?filter=low");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.goto("./#/admin/outbox");
  await expect(page.getByRole("heading", { name: "Outbox" })).toBeVisible();
});
