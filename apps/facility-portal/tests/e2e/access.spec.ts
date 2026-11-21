import { expect } from "@playwright/test";
import { facility, test, verification } from "./support/portal";

test("rejects an incorrect password and signs in with valid credentials", async ({
  page,
  portal,
  isMobile,
}) => {
  await portal.configure();
  await page.goto("/login");
  await portal.submitSignIn("wrong-password");
  await expect(
    page.getByText("Sign-in failed. Check your credentials and try again.")
  ).toBeVisible();
  await expect(page).toHaveURL("/login");

  await portal.submitSignIn();
  await expect(
    page.getByRole("heading", { name: "Hospital Dashboard" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Total capacity: 10 beds")).toBeVisible();

  if (isMobile)
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("link", { name: "Appointments" }).click();
  await expect(page).toHaveURL("/appointments");
  if (isMobile)
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "Logout" }).press("Enter");
  await expect(page).toHaveURL("/login");
  await page.goto("/appointments");
  await expect(page).toHaveURL("/login");
});

test("redirects unapproved facilities to verification and shows the review status", async ({
  page,
  portal,
}) => {
  await portal.configure({
    responses: {
      get_my_verification_case: {
        body: { ...verification, status: "under_review" },
      },
    },
  });
  await page.goto("/login");
  await portal.submitSignIn();

  await expect(page).toHaveURL("/facility-verification");
  await expect(
    page.getByRole("heading", { name: "Facility verification" })
  ).toBeVisible();
  await expect(page.getByText(/under review/i).first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/facility-verification");
});

test("keeps facility administration routes out of receptionist access", async ({
  page,
  portal,
  isMobile,
}) => {
  await portal.signIn({ role: "receptionist" });
  await page.goto("/team");
  await expect(page).toHaveURL("/appointments");
  await page.goto("/transactions");
  await expect(page).toHaveURL("/appointments");
  if (isMobile)
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Bed Management" })).toHaveCount(
    0
  );
});

test("submits both facility documents and shows the pending review state", async ({
  page,
  portal,
}) => {
  await portal.configure({
    responses: {
      get_my_verification_case: { body: null },
      submit_my_facility_verification: {
        body: null,
        after: {
          get_my_verification_case: {
            body: { ...verification, status: "pending" },
          },
        },
      },
    },
  });
  await page.goto("/login");
  await portal.submitSignIn();
  await expect(page).toHaveURL("/facility-verification");
  await page.getByLabel("Registration number").fill("REG-E2E-123");
  const pdf = Buffer.from("%PDF-1.4\nFixture document\n%%EOF");
  await page.getByLabel("Registration certificate").setInputFiles({
    name: "certificate.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByLabel("Operating licence").setInputFiles({
    name: "licence.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByRole("button", { name: "Submit for verification" }).click();

  await expect(
    page.getByRole("heading", { name: "Awaiting company approval" })
  ).toBeVisible();
  const uploads = await portal.calls("upload_facility_evidence");
  expect(uploads.map(({ args }) => args.path)).toEqual([
    expect.stringContaining(
      `/${facility.facility_id}/registration-certificate-`
    ),
    expect.stringContaining(`/${facility.facility_id}/operating-licence-`),
  ]);
  expect(
    (await portal.calls("submit_my_facility_verification")).map(
      ({ args }) => args
    )
  ).toEqual([
    {
      p_facility_id: facility.facility_id,
      p_registration_number: "REG-E2E-123",
      p_certificate_path: uploads[0].args.path,
      p_operating_licence_path: uploads[1].args.path,
    },
  ]);
});
