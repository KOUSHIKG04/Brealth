import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadTestModule } from "../../scripts/load-test-module.mjs";

const { withErrorDoubles } = createRequire(import.meta.url)(
  "../../../../packages/contracts/tests/support/errorTestDoubles.cjs"
);

function harness(
  loadDay,
  { requiresPayment = false, checkoutError, verification } = {}
) {
  const states = [];
  let cursor = 0;
  const tasks = [];
  const requests = [];
  const routes = [];
  const payments = [],
    created = [],
    notices = [];
  const host = { exports: {} };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = {
    local_day: today,
    timezone: "Asia/Kolkata",
    walkin_remaining: 3,
    payment: {
      enabled: true,
      can_collect: true,
      policy_version: "v1",
      policy_text: "Terms",
      mode: "test",
    },
    slots: [
      {
        windowId: "window",
        practiceServiceId: "service",
        state: "open",
        feeMinor: requiresPayment ? 50000 : 0,
      },
    ],
  };
  const actions = {
    loadPortalWalkInPractices: async () => [],
    loadPortalWalkInSlots: loadDay || (async () => day),
    createPortalWalkInAppointment: async (input) => {
      requests.push(input);
      return {
        error: null,
        appointmentId: "registered-appointment",
        requiresPayment: requiresPayment && input.paymentMethod === "gateway",
        status:
          requiresPayment && input.paymentMethod === "gateway"
            ? "pending"
            : "confirmed",
      };
    },
    finishPortalWalkInBooking: async () => ({ checkedIn: true }),
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        new URL(
          "../../src/features/appointments/hooks/useNewAppointment.ts",
          import.meta.url
        ),
        "utf8"
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    {
      module: host,
      exports: host.exports,
      Date,
      Intl,
      crypto,
      require(name) {
        const shared = withErrorDoubles(name);
        if (shared) return shared;
        if (name === "react")
          return {
            useState(initial) {
              const index = cursor++;
              if (!(index in states))
                states[index] =
                  typeof initial === "function" ? initial() : initial;
              return [
                states[index],
                (value) => {
                  states[index] = value;
                },
              ];
            },
            useRef(initial) {
              const index = cursor++;
              return (states[index] ||= { current: initial });
            },
            useTransition() {
              return [false, (callback) => tasks.push(callback())];
            },
            useEffect() {},
          };
        if (name === "next/navigation")
          return {
            useRouter: () => ({
              refresh() {},
              push: (path) => routes.push(path),
            }),
          };
        if (name.includes("toast"))
          return { toast: { add: (note) => notices.push(note) } };
        if (name === "../server/actions") return actions;
        if (name === "@tanstack/react-query")
          return {
            useQueryClient: () => ({ invalidateQueries: async () => {} }),
          };
        if (name === "../server/paymentActions")
          return {
            executePortalAppointmentCheckout: async () => ({
              due_minor: 50000,
            }),
          };
        if (name === "../services/appointmentCheckout")
          return {
            payPortalAppointment: async (input) => {
              payments.push(input);
              if (checkoutError) throw checkoutError;
              return verification
                ? await verification
                : { due_minor: 0, captured_minor: 50000 };
            },
          };
        throw new Error(name);
      },
    }
  );
  return {
    day,
    requests,
    routes,
    payments,
    created,
    notices,
    render() {
      cursor = 0;
      return host.exports.useNewAppointment({
        onCreated: (id) => created.push(id),
      });
    },
    finish: () => Promise.all(tasks),
  };
}

test("reception only registers an open time with remaining walk-in capacity", async () => {
  for (const unavailable of ["quota", "booked"]) {
    const h = harness();
    if (unavailable === "quota") h.day.walkin_remaining = 0;
    else h.day.slots[0].state = "booked";
    await h.render().choosePractice("practice");
    let form = h.render();
    form.setPatientName("Patient");
    h.render().submit({ preventDefault() {} });
    await h.finish();
    assert.equal(h.requests.length, 0);
  }
});

test("demographics reach registration and walk-ins are registered for today only", async () => {
  for (const future of [false, true]) {
    const h = harness();
    if (future) h.day.local_day = "2099-01-01";
    await h.render().choosePractice("practice");
    const form = h.render();
    form.setPatientName(" Patient ");
    form.setPatientAge("29");
    form.setPatientGender("Other");
    h.render().submit({ preventDefault() {} });
    await h.finish();
    if (future) {
      assert.equal(h.requests.length, 0, "no walk-in for another day");
      continue;
    }
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].patientName, "Patient");
    assert.equal(h.requests[0].patientAge, 29);
    assert.equal(h.requests[0].patientGender, "Other");
    assert.equal(h.requests[0].checkIn, true);
    assert.equal(
      "windowId" in h.requests[0],
      false,
      "the server picks the time"
    );
    assert.deepEqual(h.routes, ["/appointments"]);
  }
});

test("the next walk-in time is the first free time, skipping app-booked ones", async () => {
  const h = harness();
  h.day.slots = [
    {
      windowId: "one",
      practiceServiceId: "service",
      state: "past",
      feeMinor: 0,
    },
    {
      windowId: "two",
      practiceServiceId: "service",
      state: "booked",
      feeMinor: 0,
    },
    {
      windowId: "three",
      practiceServiceId: "service",
      state: "open",
      feeMinor: 0,
    },
    {
      windowId: "four",
      practiceServiceId: "service",
      state: "open",
      feeMinor: 0,
    },
  ];
  await h.render().choosePractice("practice");
  assert.equal(h.render().nextSlot.windowId, "three");
  h.day.slots = h.day.slots.map((slot) => ({ ...slot, state: "booked" }));
  await h.render().choosePractice("practice");
  assert.equal(h.render().nextSlot, null, "no free time left today");
});

test("a slower previous doctor request cannot replace the selected doctor's clinic day", async () => {
  const resolvers = {};
  const h = harness(
    (id) =>
      new Promise((resolve) => {
        resolvers[id] = resolve;
      })
  );
  const first = h.render().choosePractice("first");
  const second = h.render().choosePractice("second");
  resolvers.second({ ...h.day, local_day: "2099-02-02" });
  await second;
  resolvers.first({ ...h.day, local_day: "2099-01-01" });
  await first;
  assert.equal(h.render().practiceId, "second");
  assert.equal(h.render().clinicDay.local_day, "2099-02-02");
});

test("paid reception booking opens checkout after the dialog closes and reports a booking only after verification", async () => {
  let verify;
  const verification = new Promise((resolve) => {
    verify = resolve;
  });
  const h = harness(undefined, { requiresPayment: true, verification });
  await h.render().choosePractice("practice");
  const form = h.render();
  form.setPatientName("Patient");
  form.setTermsAccepted(true);
  h.render().submit({ preventDefault() {} });
  await h.finish();
  assert.equal(h.requests.length, 1);
  assert.equal(h.render().open, false);
  assert.equal(h.payments.length, 0);
  assert.deepEqual(h.created, []);
  h.render().onDialogClosed(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.payments.length, 1);
  assert.deepEqual(h.created, []);
  assert.deepEqual(h.routes, []);
  verify({ due_minor: 0, captured_minor: 50000 });
  await h.finish();
  assert.deepEqual(h.created, ["registered-appointment"]);
  assert.deepEqual(h.routes, ["/appointments"]);
});

test("cancelled checkout leaves a resumable payment reservation, never a confirmed-booking success", async () => {
  const h = harness(undefined, {
    requiresPayment: true,
    checkoutError: new Error("Checkout closed"),
  });
  await h.render().choosePractice("practice");
  const form = h.render();
  form.setPatientName("Patient");
  form.setTermsAccepted(true);
  h.render().submit({ preventDefault() {} });
  await h.finish();
  h.render().onDialogClosed(false);
  await h.finish();
  assert.deepEqual(h.created, []);
  assert.equal(
    h.notices.some((notice) => notice.type === "success"),
    false
  );
  assert.deepEqual(h.routes, [
    "/transactions?appointment=registered-appointment",
  ]);
});

test("cash booking requires both patient terms and confirmation that cash was received", async () => {
  const h = harness(undefined, { requiresPayment: true });
  await h.render().choosePractice("practice");
  const form = h.render();
  form.setPatientName("Patient");
  form.setPaymentMethod("cash");
  form.setTermsAccepted(true);
  h.render().submit({ preventDefault() {} });
  await h.finish();
  assert.equal(h.requests.length, 0);
  h.render().setCashReceived(true);
  h.render().submit({ preventDefault() {} });
  await h.finish();
  assert.equal(h.requests[0].cashReceived, true);
  assert.equal(h.requests[0].paymentMethod, "cash");
  assert.equal(h.payments.length, 0);
  assert.deepEqual(h.created, ["registered-appointment"]);
});

const jsx = (type, props) => ({ type, props: props ?? {} });

const { AppointmentsTable } = loadTestModule(
  fileURLToPath(
    new URL(
      "../../src/features/appointments/components/AppointmentsTable.tsx",
      import.meta.url
    )
  ),
  {
    mocks: {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@startup/web-ui/components/data-table": {
        DataTable: "DataTable",
        createDisplayColumns: () => [],
      },
      "./PatientDetailsDrawer": {
        PatientDetailsDrawer: "PatientDetailsDrawer",
      },
      "@startup/contracts": {
        appointmentRecoveryView: () => ({ staffStatus: "Confirmed" }),
      },
      "lucide-react": {},
      "@startup/web-ui/components/ui/avatar": {
        Avatar: "Avatar",
        AvatarImage: "AvatarImage",
        AvatarFallback: "AvatarFallback",
      },
    },
  }
);

function render(queueState, metadata) {
  const actions = [];
  const item = {
    id: "appointment",
    patient_name: "Patient",
    patient_public_code: "PAT-1",
    doctor_name: "Doctor",
    service_name: "Clinic",
    visit_mode: "clinic",
    source: "patient_online",
    public_code: "APT-1",
    starts_at: "2026-10-29T10:00:00Z",
    ends_at: "2026-10-29T10:10:00Z",
    timezone: "UTC",
    status: "confirmed",
    queue_state: queueState,
    ticket_number: 8,
    ahead_count: 0,
    clinic_queue: metadata,
    fee_minor: "10000",
    currency: "INR",
  };
  const tree = AppointmentsTable({
    now: Date.parse(item.starts_at),
    pageRows: [item],
    pending: false,
    onManage() {},
    onAct: (_item, action) => actions.push(action),
    pagination: {
      range: "1",
      total: 1,
      currentPage: 1,
      nextPages: [],
      lastPage: 1,
    },
    onPageChange() {},
    displayedCount: 1,
    filterPeriod: "Today",
    onFilterPeriodChange() {},
    bookingDateLabel: "Today",
  });
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    walk(node.props?.children);
    if (node.type === "DataTable")
      walk(node.props.data.flatMap((row) => row.cells));
  }
  walk(tree);
  return { nodes, actions };
}

test("reception cannot call a zero-ahead patient when the server reports the doctor unavailable", () => {
  const { nodes } = render("waiting", { can_call: false });
  assert.equal(
    nodes.find(
      (node) => node.type === "button" && node.props.children === "Call next"
    ),
    undefined
  );
});

test("reception can call the eligible patient and explicitly admit a reviewed late arrival", () => {
  const ready = render("waiting", { can_call: true });
  ready.nodes
    .find(
      (node) => node.type === "button" && node.props.children === "Call next"
    )
    .props.onClick();
  assert.deepEqual(ready.actions, ["call"]);
  const late = render("held", { late_review_required: true });
  late.nodes
    .find(
      (node) =>
        node.type === "button" &&
        node.props.children === "Admit to next opening"
    )
    .props.onClick();
  assert.deepEqual(late.actions, ["resume"]);
});

test("patient details are delegated to a drawer and IDs show the final segment", () => {
  const { nodes } = render("waiting", { can_call: false });
  assert.equal(
    nodes.some((node) => node.type === "details"),
    false
  );
  const drawer = nodes.find((node) => node.type === "PatientDetailsDrawer");
  assert.equal(drawer.props.item.patient_public_code, "PAT-1");
  const id = nodes.find(
    (node) => node.type === "span" && node.props.title === "PAT-1"
  );
  assert.equal(id.props.children, "1");
});
