import { expect } from "@playwright/test";
import { bed, test } from "./support/portal";

const updateBed = "update_facility_bed_inventory";

test("rejects invalid initial counts and creates inventory with version zero", async ({
  page,
  portal,
}) => {
  const unconfigured = {
    ...bed,
    inventory_id: null,
    configured: false,
    total: 0,
    occupied: 0,
    maintenance: 0,
    available: 0,
    row_version: null,
  };
  const saved = { ...bed, row_version: "1" };
  await portal.signIn({
    responses: {
      list_facility_bed_inventory: { body: [unconfigured] },
      [updateBed]: {
        body: saved,
        after: { list_facility_bed_inventory: { body: [saved] } },
      },
    },
  });
  await page.goto("/bed-management");
  const row = page.getByRole("row").filter({ hasText: "General Ward" });
  await row.getByRole("spinbutton", { name: "total", exact: true }).fill("10");
  await row
    .getByRole("spinbutton", { name: "occupied", exact: true })
    .fill("10");
  await row
    .getByRole("spinbutton", { name: "maintenance", exact: true })
    .fill("1");
  await row.getByRole("button", { name: "Set initial counts" }).click();
  await expect(
    page.getByText(/Occupied and maintenance cannot exceed total/)
  ).toBeVisible();
  expect(await portal.calls(updateBed)).toHaveLength(0);
  await row
    .getByRole("spinbutton", { name: "occupied", exact: true })
    .fill("3");
  await row.getByRole("button", { name: "Set initial counts" }).click();
  await expect(
    row.getByLabel("Available beds for General Ward", { exact: true })
  ).toHaveValue("6");
  expect((await portal.calls(updateBed)).map(({ args }) => args)).toEqual([
    {
      p_facility_id: bed.facility_id,
      p_bed_type_id: bed.bed_type_id,
      p_total: 10,
      p_occupied: 3,
      p_maintenance: 1,
      p_expected_version: "0",
    },
  ]);
});

test("saves an occupied bed and recalculates availability without changing capacity", async ({
  page,
  portal,
}) => {
  const saved = { ...bed, occupied: 4, available: 5, row_version: "8" };
  await portal.signIn({
    responses: {
      [updateBed]: {
        body: saved,
        after: { list_facility_bed_inventory: { body: [saved] } },
      },
    },
  });
  await page.goto("/bed-management");

  const row = page.getByRole("row").filter({ hasText: "General Ward" });
  await expect(
    row.getByRole("spinbutton", { name: "Available beds for General Ward" })
  ).toHaveValue("6");
  await row
    .getByRole("button", { name: "Increase Occupied beds for General Ward" })
    .click();
  await expect(page.getByText("Bed counts updated")).toBeVisible();
  await expect(
    row.getByRole("spinbutton", { name: "Available beds for General Ward" })
  ).toHaveValue("5");
  await page.getByRole("button", { name: "Count", exact: true }).click();
  await expect(row.getByText("4/10", { exact: true })).toBeVisible();
  expect(await portal.calls(updateBed)).toEqual([
    {
      name: updateBed,
      args: {
        p_facility_id: bed.facility_id,
        p_bed_type_id: bed.bed_type_id,
        p_total: 10,
        p_occupied: 4,
        p_maintenance: 1,
        p_expected_version: "7",
      },
    },
  ]);
  await page.reload();
  await expect(
    row.getByRole("spinbutton", { name: "Occupied beds for General Ward" })
  ).toHaveValue("4");
});

test("reloads the latest bed counts after a stale edit without retrying the write", async ({
  page,
  portal,
}) => {
  const latest = { ...bed, occupied: 2, available: 7, row_version: "8" };
  await portal.signIn({
    responses: {
      [updateBed]: {
        status: 409,
        body: { code: "PT409", message: "Bed inventory changed" },
        after: { list_facility_bed_inventory: { body: [latest] } },
      },
    },
  });
  await page.goto("/bed-management");
  await page
    .getByRole("button", { name: "Increase Occupied beds for General Ward" })
    .click();

  await expect(page.getByText("Could not update beds")).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "Occupied beds for General Ward" })
  ).toHaveValue("2");
  await expect(
    page.getByRole("spinbutton", { name: "Available beds for General Ward" })
  ).toHaveValue("7");
  expect(await portal.calls(updateBed)).toHaveLength(1);
});
