import { expect, test } from "@playwright/test";

test("company review pages require a reviewer session", async ({ page }) => {
  await page.goto("/verification");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Reviewer sign in" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
