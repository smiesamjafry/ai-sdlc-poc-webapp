import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:4100";

export async function signIn(page: Page, email: string, password = "demo1234") {
  await page.goto("./#/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // Sign-in finishes by redirecting away from the form; wait so later navigation isn't overridden.
  await expect(page).not.toHaveURL(/#\/login/);
}

/** Add one unit of the first in-stock variant of a product via its page. */
export async function addProduct(page: Page, slug: string) {
  await page.goto(`./#/products/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const legend of ["Colour", "Size"]) {
    const group = page.getByRole("group", { name: legend });
    if (await group.count()) await group.getByRole("button").and(page.locator(":enabled")).first().click();
  }
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
}

export async function fillCheckout(page: Page, cardNumber = "4242 4242 4242 4242") {
  await page.getByLabel("Email").fill("e2e-buyer@example.com");
  await page.getByLabel("Full name").fill("E2E Buyer");
  await page.getByLabel("Address", { exact: true }).fill("1 Test Street");
  await page.getByLabel("City").fill("Portland");
  await page.getByLabel("ZIP / postcode").fill("97201");
  await page.getByLabel("Card number").fill(cardNumber);
  await page.getByLabel("Expiry (MM/YY)").fill("12/30");
  await page.getByLabel("CVC").fill("123");
}
