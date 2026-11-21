import { expect, test } from "@playwright/test";

for (const path of ["/dashboard", "/appointments", "/bed-management"]) {
  test(`redirects signed-out visitors from ${path} to sign in`, async ({
    page,
  }) => {
    await page.goto(path);

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });
}

test("opens facility sign-up from sign-in and returns to sign-in", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign up" }).click();

  await expect(page).toHaveURL("/register");
  await expect(
    page.getByRole("heading", { name: "Facility account" })
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeEditable();
  await expect(page.getByLabel("Password")).toBeEditable();

  await page.getByRole("link", { name: "Back to sign in" }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("requires sign-up fields before submitting", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.getByLabel("Email")).toHaveJSProperty("required", true);
  await expect(page.getByLabel("Password")).toHaveJSProperty("required", true);
  await expect(page).toHaveURL("/register");
});

test("preserves the invitation when switching between sign-in and sign-up", async ({
  page,
}) => {
  const invitePath = "/invite/abc123def456ghi789";
  const query = `?next=${encodeURIComponent(invitePath)}`;

  await page.goto(`/login${query}`);
  await page.getByRole("link", { name: "Sign up" }).click();

  await expect(page).toHaveURL(`/register${query}`);
  await expect(
    page.getByText("Use the email address your invitation was sent to.")
  ).toBeVisible();

  await page.getByRole("link", { name: "Back to sign in" }).click();

  await expect(page).toHaveURL(`/login${query}`);
  await expect(page.locator('input[name="next"]')).toHaveValue(invitePath);
});

test("discards an invalid invitation return path", async ({ page }) => {
  await page.goto("/login?next=%2Fdashboard");
  await expect(page.locator('input[name="next"]')).toHaveCount(0);

  await page.getByRole("link", { name: "Sign up" }).click();

  await expect(page).toHaveURL("/register");
  await expect(
    page.getByRole("heading", { name: "Facility account" })
  ).toBeVisible();
});
