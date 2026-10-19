import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Runs last (serial project): a reset signs everyone out.
test("admin demo reset restores seed data and signs everyone out", async ({ page }) => {
  await signIn(page, "admin@shop.test");
  await page.goto("./#/admin/system");
  await expect(page.getByText("Database")).toBeVisible();
  page.once("dialog", (d) => d.accept("RESET"));
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo data restored" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
