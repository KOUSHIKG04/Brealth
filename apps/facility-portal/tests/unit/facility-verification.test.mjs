import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadTestModule } from "../../scripts/load-test-module.mjs";

const jsx = (type, props) => ({ type, props: props ?? {} });

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}

test("verified facilities can open verification without a dashboard redirect", async () => {
  const facility = {
    facilityId: "facility",
    facilityName: "Test Clinic",
    facilityKind: "clinic",
  };
  const { default: Page } = loadTestModule(
    fileURLToPath(
      new URL(
        "../../src/app/(auth)/facility-verification/page.tsx",
        import.meta.url
      )
    ),
    {
      mocks: {
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "next/link": { default: "Link" },
        "next/navigation": {
          redirect() {
            throw new Error("Unexpected redirect");
          },
        },
        "@/server/auth/facilityAccess": {
          getFacilityAccess: async () => ({
            approved: true,
            facilities: [facility],
          }),
        },
        "@/features/facilities": {
          FacilityVerificationForm: "VerificationForm",
        },
        "@/features/auth": { signOut() {} },
      },
    }
  );
  const rendered = nodes(await Page());
  assert.equal(
    rendered.find((node) => node.type === "Link").props.href,
    "/dashboard"
  );
  assert.equal(
    rendered.find((node) => node.type === "VerificationForm").props
      .facilities[0].facility_name,
    "Test Clinic"
  );
});

test("approved status shows the document review and facility selector without a resubmission form", () => {
  const { FacilityVerificationForm } = loadTestModule(
    fileURLToPath(
      new URL(
        "../../src/features/facilities/components/FacilityVerificationForm.tsx",
        import.meta.url
      )
    ),
    {
      mocks: {
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "./FacilityAddressFields": { FacilityAddressFields: "AddressFields" },
        "../hooks/useFacilityVerification": {
          useFacilityVerification: () => ({
            activeFacilityId: "one",
            status: {
              status: "verified",
              documents: [
                {
                  kind: "registration_certificate",
                  status: "approved",
                  rejection_reason: null,
                },
              ],
            },
            checkStatus() {},
          }),
        },
        "@startup/web-ui/components/ui/button": { Button: "Button" },
        "@startup/web-ui/components/ui/input": { Input: "Input" },
        "@startup/web-ui/components/ui/label": { Label: "Label" },
        "@startup/web-ui/components/ui/skeleton": { Skeleton: "Skeleton" },
      },
    }
  );
  const rendered = nodes(
    FacilityVerificationForm({
      facilities: [
        {
          facility_id: "one",
          facility_name: "Test Clinic",
          facility_kind: "clinic",
        },
      ],
    })
  );
  assert.equal(
    rendered.some((node) => node.type === "form"),
    false
  );
  assert.equal(
    rendered.some((node) => node.props.children === "Facility verified"),
    true
  );
  assert.equal(
    rendered.find((node) => node.type === "select").props.value,
    "one"
  );
  assert.equal(
    rendered.some((node) => node.type === "li"),
    true
  );
});
