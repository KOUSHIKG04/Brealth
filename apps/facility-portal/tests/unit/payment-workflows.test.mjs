import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadTestModule } from "../../scripts/load-test-module.mjs";

const require = createRequire(import.meta.url);

const load = (file, mocks = {}, globals = {}) =>
  loadTestModule(
    fileURLToPath(new URL(`../../src/features/${file}`, import.meta.url)),
    { mocks, globals }
  );

// The shared loader supplies the real contracts date and queue-number helpers.
test("queue ordering uses numeric tokens, missing tokens last, and separates clinic dates", () => {
  const { compareAppointmentQueue } = load(
    "appointments/utils/appointmentOrder.ts"
  );
  const item = (id, ticket_number, starts_at = "2026-11-02T09:00:00Z") => ({
    id,
    ticket_number,
    starts_at,
    timezone: "Asia/Kolkata",
    doctor_name: "Doctor",
  });
  const rows = [
    item("ten", 10),
    item("request", null),
    item("two", 2),
    item("tomorrow", 1, "2026-11-03T09:00:00Z"),
  ];
  assert.deepEqual(
    rows.sort(compareAppointmentQueue).map((row) => row.id),
    ["two", "ten", "request", "tomorrow"]
  );
});

test("reserved hybrid-queue numbers order future bookings within their own clinic date", () => {
  const { compareAppointmentQueue, appointmentDayOffset } = load(
    "appointments/utils/appointmentOrder.ts"
  );
  const item = (id, planned, starts_at) => ({
    id,
    ticket_number: null,
    clinic_queue: { planned_number: planned },
    starts_at,
    timezone: "Asia/Kolkata",
    doctor_name: "Doctor",
  });
  const rows = [
    item("16th-2", 2, "2026-11-16T05:00:00Z"),
    item("15th-1", 1, "2026-11-15T05:00:00Z"),
    item("16th-1", 1, "2026-11-16T04:00:00Z"),
  ];
  assert.deepEqual(
    rows.sort(compareAppointmentQueue).map((row) => row.id),
    ["15th-1", "16th-1", "16th-2"]
  );
  // 23:30 UTC on the 15th is already the 16th in the clinic's timezone.
  const late = item("late", 3, "2026-11-15T23:30:00Z");
  assert.equal(
    appointmentDayOffset(late, Date.parse("2026-11-15T06:00:00Z")),
    1
  );
});

test("app checkout reservations are separate from the default appointments and counts", () => {
  const states = [];
  let index = 0;
  const react = {
    useState(value) {
      const i = index++;
      if (!(i in states))
        states[i] = typeof value === "function" ? value() : value;
      return [
        states[i],
        (next) => {
          states[i] = next;
        },
      ];
    },
    useMemo: (fn) => fn(),
    useEffect() {},
    useRef: () => ({ current: null }),
    useCallback: (fn) => fn,
    useTransition: () => [false, () => {}],
  };
  const { useAppointments: runAppointments } = load(
    "appointments/hooks/useAppointments.ts",
    {
      react,
      "next/navigation": { useRouter: () => ({}) },
      "../server/actions": {},
      "@startup/contracts": {
        formatDisplayDate: String,
        appointmentRecoveryView: () => ({ staffStatus: "Pending" }),
      },
      "@startup/web-ui/components/ui/toast": { toast: { add() {} } },
    }
  );
  const base = {
    starts_at: "2026-11-02T09:00:00Z",
    timezone: "Asia/Kolkata",
    doctor_name: "Doctor",
    patient_name: "Patient",
    status: "pending",
    request_expires_at: null,
  };
  const appointments = [
    {
      ...base,
      id: "hold",
      confirmation_payment_pending: true,
      ticket_number: 1,
    },
    { ...base, id: "ten", ticket_number: 10 },
    { ...base, id: "two", ticket_number: 2 },
  ];
  const render = () => {
    index = 0;
    return runAppointments({ appointments });
  };
  let api = render();
  api.setFilterPeriod("All");
  api = render();
  assert.deepEqual(
    Array.from(api.pageRows, (row) => row.id),
    ["two", "ten"]
  );
  assert.equal(api.appointmentsSummary.total, 2);
  assert.equal(api.paymentHoldCount, 1);
  api.setShowPaymentHolds(true);
  api = render();
  assert.deepEqual(
    Array.from(api.pageRows, (row) => row.id),
    ["hold"]
  );
});

test("Razorpay script loads once, timeout can retry, and checkout validates its order", async () => {
  const scripts = [];
  let timeout;
  let options;
  const browser = {
    setTimeout(fn) {
      timeout = fn;
      return 1;
    },
    clearTimeout() {},
  };
  const { loadPortalRazorpay, openPortalRazorpay } = load(
    "appointments/services/razorpayCheckout.ts",
    {
      "@startup/design-tokens": { colors: { patient: { primary: "#008877" } } },
    },
    {
      window: browser,
      document: {
        createElement: () => ({ remove() {} }),
        head: { appendChild: (script) => scripts.push(script) },
      },
    }
  );
  const failing = loadPortalRazorpay();
  assert.equal(failing, loadPortalRazorpay());
  timeout();
  await assert.rejects(failing, /could not load/);
  const loading = loadPortalRazorpay();
  browser.Razorpay = class {
    constructor(input) {
      options = input;
    }
    open() {}
  };
  scripts[1].onload();
  const Constructor = await loading;
  const checkout = {
    keyId: "rzp_test_key",
    orderId: "order_valid",
    amount: 50000,
    currency: "INR",
  };
  let result = openPortalRazorpay(Constructor, checkout, "Patient");
  assert.equal(options.amount, 50000);
  assert.equal(options.order_id, "order_valid");
  options.handler({ razorpay_order_id: "order_wrong" });
  await assert.rejects(result, /did not match/);
  result = openPortalRazorpay(Constructor, checkout, "Patient");
  options.modal.ondismiss();
  await assert.rejects(result, /No payment has been confirmed/);
  result = openPortalRazorpay(Constructor, checkout, "Patient");
  options.handler({
    razorpay_order_id: "order_valid",
    razorpay_payment_id: "pay_valid",
    razorpay_signature: "signature",
  });
  assert.equal((await result).razorpay_payment_id, "pay_valid");
});

test("portal checkout authorizes money access, rejects client amounts, and revalidates after verified actions", async () => {
  const { z } = require("zod");
  const contracts = loadTestModule(
    fileURLToPath(
      new URL(
        "../../../../packages/contracts/src/appointment-payments.ts",
        import.meta.url
      )
    ),
    { mocks: { zod: { z } } }
  );
  const events = [];
  let manage = false,
    payable = true;
  const { executePortalAppointmentCheckout } = load(
    "appointments/server/paymentActions.ts",
    {
      "server-only": {},
      zod: { z },
      "@startup/contracts": { ...contracts, uuidSchema: z.string().uuid() },
      "next/cache": { revalidatePath: (path) => events.push(path) },
      "next/navigation": { unstable_rethrow() {} },
      "@/server/auth/facilityAccess": {
        requireApprovedFacility: async () => events.push("authorize"),
      },
      "@/lib/supabase/server": { createClient: async () => ({}) },
      "@startup/data-access": {
        getAppointmentBilling: async () => ({
          can_manage: manage,
          can_pay: payable,
        }),
        processAppointmentPayment: async (_, body) => {
          events.push(body.action);
          return { captured_minor: 50000, due_minor: 0 };
        },
      },
    }
  );
  const command = {
    action: "checkout",
    appointmentId: "00000000-0000-4000-8000-000000000001",
    policyVersion: "v1",
  };
  await assert.rejects(
    executePortalAppointmentCheckout(command),
    /Financial approval/
  );
  manage = true;
  await assert.rejects(
    executePortalAppointmentCheckout({ ...command, amount: 1 })
  );
  payable = false;
  await assert.rejects(executePortalAppointmentCheckout(command), /no payable/);
  payable = true;
  await executePortalAppointmentCheckout(command);
  assert.ok(events.includes("checkout"));
  assert.ok(events.includes("/transactions"));
  assert.ok(events.includes("/appointments"));
});

test("checkout success feedback waits for verified capture; unpaid verification never reports success", async () => {
  for (const captured of [true, false]) {
    let index = 0,
      finishVerification;
    const state = [],
      notices = [],
      actions = [];
    const verification = new Promise((resolve) => {
      finishVerification = resolve;
    });
    const jsx = (type, props) => ({ type, props });
    const { PortalCheckoutButton } = load(
      "appointments/components/PortalCheckoutButton.tsx",
      {
        react: {
          useState(initial) {
            const i = index++;
            if (!(i in state)) state[i] = initial;
            return [
              state[i],
              (next) => {
                state[i] = next;
              },
            ];
          },
        },
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "next/navigation": { useRouter: () => ({ refresh() {} }) },
        "@tanstack/react-query": {
          useQueryClient: () => ({ invalidateQueries: async () => {} }),
        },
        "@startup/contracts": {
          appointmentMoney: String,
          appointmentCheckoutSchema: { parse: (value) => value },
          appointmentBillingSchema: { parse: (value) => value },
        },
        "@startup/web-ui/components/ui/button": { Button: "Button" },
        "@startup/web-ui/components/ui/toast": {
          toast: { add: (note) => notices.push(note) },
        },
        "./PaymentTermsDialog": { PaymentTermsDialog: "PaymentTermsDialog" },
        "./razorpayCheckout": {
          loadPortalRazorpay: async () => ({}),
          openPortalRazorpay: async () => ({
            razorpay_payment_id: "pay_example",
            razorpay_signature: "signature",
          }),
        },
        "../server/paymentActions": {
          executePortalAppointmentCheckout: async (input) => {
            actions.push(input.action);
            return input.action === "verify"
              ? verification
              : { attemptId: "attempt" };
          },
        },
      }
    );
    const props = {
      billing: {
        appointment_id: "appointment",
        due_minor: 50000,
        policy_version: "v1",
      },
      patientName: "Patient",
      onBusyChange() {},
    };
    const render = () => {
      index = 0;
      return PortalCheckoutButton(props);
    };
    const nodes = (node) =>
      !node
        ? []
        : Array.isArray(node)
          ? node.flatMap(nodes)
          : typeof node !== "object"
            ? []
            : [node, ...nodes(node.props?.children)];
    nodes(render())
      .find((node) => node.type === "input")
      .props.onChange({ target: { checked: true } });
    const paying = nodes(render())
      .find((node) => node.type === "Button")
      .props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(actions, ["checkout", "verify"]);
    assert.equal(notices.length, 0);
    finishVerification({
      due_minor: captured ? 0 : 50000,
      captured_minor: captured ? 50000 : 0,
    });
    await paying;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      notices[0].title,
      captured ? "Payment received" : "Payment verification pending"
    );
    assert.equal(notices[0].type, captured ? "success" : "info");
  }
});
