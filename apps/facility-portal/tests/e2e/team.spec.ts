import { expect } from "@playwright/test";
import { doctor, facility, test } from "./support/portal";

const token = "abc123def456ghi789";

const invitationId = "50000000-0000-4000-8000-000000000001";

test("signs in from an invitation and opens appointments after a receptionist accepts", async ({
  page,
  portal,
}) => {
  await portal.configure({
    role: "receptionist",
    responses: {
      get_member_invitation: {
        body: {
          status: "pending",
          role: "receptionist",
          facility_name: facility.facility_name,
        },
      },
      accept_member_invitation: {
        body: {
          organization_id: invitationId,
          facility_id: facility.facility_id,
          role: "receptionist",
        },
      },
    },
  });
  await page.goto(`/invite/${token}`);
  await page.getByRole("link", { name: "Sign in" }).click();
  await portal.submitSignIn();
  await expect(page).toHaveURL(`/invite/${token}`);
  await expect(
    page.getByText(/Join Cedar Hospital as Receptionist/)
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL("/appointments");
  expect(
    (await portal.calls("accept_member_invitation")).map(({ args }) => args)
  ).toEqual([{ p_token: token }]);
});

test("requires doctor assignment before creating a receptionist invitation", async ({
  page,
  portal,
}) => {
  await portal.signIn({
    responses: {
      create_member_invitation: {
        body: { id: invitationId, token, expires_at: "2099-01-01T00:00:00Z" },
      },
    },
  });
  await page.goto("/team");

  await page.getByLabel("Email").fill("new-receptionist@example.com");
  await page.getByLabel("Role").selectOption("receptionist");
  const createLink = page.getByRole("button", { name: "Create invite link" });
  await expect(createLink).toBeDisabled();
  await page.getByRole("checkbox", { name: doctor.name }).check();
  await createLink.click();
  await expect(page.getByText(/Share this link with/)).toBeVisible();
  const link = page.getByRole("status").getByRole("textbox");
  await expect(link).toHaveValue(new RegExp(`/invite/${token}$`));
  expect(await portal.calls("create_member_invitation")).toEqual([
    {
      name: "create_member_invitation",
      args: {
        p_facility_id: facility.facility_id,
        p_role: "receptionist",
        p_email: "new-receptionist@example.com",
        p_doctor_practice_ids: [doctor.practice_id],
      },
    },
  ]);
});

test("blocks accepting a team invitation sent to a different account", async ({
  page,
  portal,
}) => {
  await portal.signIn({
    responses: {
      get_member_invitation: {
        body: { status: "wrong_email", invited_email: "invitee@example.com" },
      },
    },
  });
  await page.goto(`/invite/${token}`);

  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "invitee@example.com"
  );
  await expect(
    page.getByRole("button", { name: "Accept invitation" })
  ).toHaveCount(0);
  expect(await portal.calls("accept_member_invitation")).toHaveLength(0);
});
