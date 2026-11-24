const { test } = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const path = require("node:path");

const vm = require("node:vm");

const ts = require("typescript");

const {
  withErrorDoubles,
} = require("../../../packages/contracts/tests/support/errorTestDoubles.cjs");

function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.resolve(__dirname, "../src", file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }
    ).outputText,
    {
      exports,
      Date,
      Number,
      Map,
      require(name) {
        const shared = withErrorDoubles(name, mocks);
        if (shared) return shared;
        if (name in mocks) return mocks[name];
        throw new Error(`Unmocked import: ${name}`);
      },
    }
  );
  return exports;
}

function bookingView({
  automatic = true,
  reception = false,
  native = true,
  captured = true,
  fail = false,
  home = false,
  addressReady = true,
  reserveGate,
  paymentGate,
  refreshGate,
  // Outcomes for successive payments: "paid", "failed" (retryable, no money
  // taken) or "uncertain"; when empty, `fail` decides as before.
  payOutcomes = [],
} = {}) {
  const state = [],
    refs = [],
    events = [],
    toasts = [],
    routes = [];
  let index = 0,
    refIndex = 0;
  const options = {
    auto_accept: automatic,
    requires_payment: automatic,
    can_pay_reception: reception,
    policy_version: "policy-v1",
    policy_text: "Terms",
    hold_minutes: 10,
  };
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in state)) state[i] = initial;
      return [
        state[i],
        (next) => {
          state[i] = typeof next === "function" ? next(state[i]) : next;
        },
      ];
    },
    useRef(initial) {
      const i = refIndex++;
      return refs[i] ?? (refs[i] = { current: initial });
    },
    useEffect() {},
    useCallback: (fn) => fn,
    useTransition: () => [false, (fn) => fn()],
  };
  const { useDoctorBooking } = load(
    "features/doctors/hooks/useDoctorBooking.ts",
    {
      react,
      "expo-router": {
        router: { push: (route) => routes.push(route) },
        useFocusEffect() {},
      },
      "expo-crypto": { randomUUID: () => "request-key" },
      "expo-haptics": {
        notificationAsync: async () => {},
        NotificationFeedbackType: { Success: "success", Error: "error" },
      },
      "expo-location": {},
      "@tanstack/react-query": {
        useQueryClient: () => ({
          invalidateQueries: async () => {},
          setQueryData() {},
        }),
        useQuery({ queryKey }) {
          const data = {
            "public-practice": [
              {
                practice_id: "practice",
                practice_service_id: "service",
                service_code: reception
                  ? "clinic-consultation"
                  : home
                    ? "home-consultation"
                    : "online-consultation",
              },
            ],
            "clinic-slots": [
              {
                window_id: "window",
                practice_id: "practice",
                practice_service_id: "service",
                service_mode: reception ? "clinic" : home ? "home" : "online",
              },
            ],
            "my-family-profiles": [],
            "my-patient-locations": home
              ? [
                  {
                    id: "location",
                    selected: true,
                    latitude: addressReady ? 13 : null,
                    longitude: 80,
                    building: "12",
                    city: "Chennai",
                  },
                ]
              : [],
            "my-patient-profile-detail": { full_name: "Patient" },
            "appointment-booking-options": options,
          }[queryKey[0]];
          return { data, isError: false, refetch: async () => ({ data }) };
        },
        useMutation(config) {
          return {
            isPending: false,
            async mutateAsync(input) {
              try {
                const result = await config.mutationFn(input);
                await config.onSuccess(result);
                return result;
              } catch (error) {
                config.onError(error);
                throw error;
              }
            },
          };
        },
      },
      "@startup/data-access": {
        releaseAppointmentBooking: async (_, id) =>
          events.push(["release", id]),
        prepareAppointmentBooking: async (_, input) => {
          events.push(["reserve", input.paymentMethod]);
          if (home) events.push(["destination", input.locationId]);
          await reserveGate;
          return {
            appointment_id: "appointment",
            status:
              automatic && (!reception || input.paymentMethod === "online")
                ? "pending"
                : automatic
                  ? "confirmed"
                  : "pending",
            requires_payment: automatic && input.paymentMethod === "online",
            reservation_expires_at: "2026-11-01T10:10:00Z",
          };
        },
        listClinicAppointments: async () => {
          await refreshGate;
          return [
            {
              id: "appointment",
              status: automatic && captured ? "confirmed" : "pending",
              confirmation_payment_pending: automatic && !captured,
              visit_mode: home ? "home" : "online",
              facility_name: "Clinic",
            },
          ];
        },
      },
      "@startup/mobile-ui": {
        useToast: () => ({ showToast: (toast) => toasts.push(toast) }),
        useToastFeedback() {},
      },
      "../../../services/supabase": {
        supabase: {},
        useMobileSession: () => ({ profile: { patient_id: "self" } }),
      },
      "../../locations/utils/locationDisplay": {
        formatSavedLocation: () => "",
      },
      "../../../services/paymentCheckout": {
        isRetryablePaymentFailure: (error) => error?.retryablePayment === true,
        loadPaymentCheckout: async () => {
          events.push(["native"]);
          if (!native) throw new Error("Missing native module");
          return async () => {};
        },
        payForAppointment: async (_, input) => {
          events.push(["pay", input.releaseUnpaid]);
          input.onStageChange?.("checkout");
          await paymentGate;
          const outcome = payOutcomes.length ? payOutcomes.shift() : null;
          if (outcome === "failed") {
            captured = false;
            throw Object.assign(new Error("Payment failed"), {
              retryablePayment: true,
            });
          }
          if (outcome === "uncertain") {
            captured = false;
            throw new Error("Verification connection lost");
          }
          if (outcome === "paid") captured = true;
          if (!outcome && fail) throw new Error("Checkout cancelled");
          input.onStageChange?.("verifying");
        },
      },
    }
  );
  return {
    events,
    toasts,
    routes,
    render() {
      index = 0;
      refIndex = 0;
      return useDoctorBooking({
        practiceId: "practice",
        serviceId: "service",
        consultationType: reception
          ? "Clinic Visit"
          : home
            ? "Home Visit"
            : "Online",
      });
    },
  };
}

const request = { patientId: "self", windowId: "window", reason: "Review" };

test("closed checkout releases only known unpaid reservations, never uncertain or verified payments", async () => {
  for (const attemptStatus of ["created", "authorized", "uncertain"]) {
    const events = [];
    const { payForAppointment } = load("services/paymentCheckout.ts", {
      "react-native": {},
      "@startup/design-tokens": { colors: {} },
      "@startup/contracts": {
        appointmentCheckoutSchema: { parse: (value) => value },
      },
      "@startup/data-access": {
        processAppointmentPayment: async (_, input) => {
          events.push(input.action);
          return input.action === "checkout"
            ? { attemptId: "attempt" }
            : { captured_minor: 0, attempts: [{ status: attemptStatus }] };
        },
        releaseAppointmentBooking: async () => events.push("release"),
      },
    });
    await assert.rejects(
      payForAppointment(
        {},
        {
          appointmentId: "appointment",
          policyVersion: "policy",
          patientName: "Patient",
          reservation: true,
          openCheckout: async () => {
            throw new Error("Closed");
          },
        }
      )
    );
    assert.equal(events.includes("release"), attemptStatus === "created");
    assert.equal(events[1], "reconcile");
  }
  const events = [];
  const { payForAppointment } = load("services/paymentCheckout.ts", {
    "react-native": {},
    "@startup/design-tokens": { colors: {} },
    "@startup/contracts": {
      appointmentCheckoutSchema: { parse: (value) => value },
    },
    "@startup/data-access": {
      processAppointmentPayment: async (_, input) => {
        events.push(input.action);
        if (input.action === "verify")
          throw new Error("Verification connection lost");
        return input.action === "checkout"
          ? { attemptId: "attempt" }
          : { captured_minor: 0, attempts: [{ status: "created" }] };
      },
      releaseAppointmentBooking: async () => events.push("release"),
    },
  });
  await assert.rejects(
    payForAppointment(
      {},
      {
        appointmentId: "appointment",
        policyVersion: "policy",
        patientName: "Patient",
        reservation: true,
        openCheckout: async () => ({
          razorpay_payment_id: "payment",
          razorpay_signature: "signature",
        }),
      }
    )
  );
  assert.deepEqual(events, ["checkout", "verify", "reconcile"]);
});

test("booking dialog names the correct action and requires consent before Pay & Book", () => {
  const jsx = (type, props) => ({ type, props });
  const { BookingConfirmationDialog } = load(
    "features/doctors/components/BookingConfirmationDialog.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "react-native": {
        View: "View",
        ScrollView: "ScrollView",
        useWindowDimensions: () => ({ height: 844 }),
      },
      "@startup/mobile-ui": Object.fromEntries(
        [
          "AppText",
          "Button",
          "Checkbox",
          "Chip",
          "Loader",
          "ModalSurface",
          "PaymentDisclosure",
        ].map((name) => [name, name])
      ),
      "./DoctorProfile.styles": { styles: {} },
    }
  );
  function nodes(node) {
    if (!node) return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  const props = {
    confirmation: {
      windowId: "window",
      practiceId: "practice",
      mode: "online",
      startsAt: "2026-11-01T10:00:00Z",
      timezone: "Asia/Kolkata",
    },
    book: { isPending: false },
    practiceId: "practice",
    serviceMode: "online",
    slots: [{ window_id: "window" }],
    bookingOptions: {
      data: {
        auto_accept: true,
        requires_payment: true,
        policy_version: "policy",
        hold_minutes: 10,
      },
    },
    acceptedPolicy: "",
  };
  let tree = nodes(BookingConfirmationDialog(props));
  assert.equal(
    tree.find((node) => node.props?.label === "Pay & Book").props.disabled,
    true
  );
  tree = nodes(
    BookingConfirmationDialog({ ...props, acceptedPolicy: "policy" })
  );
  assert.equal(
    tree.find((node) => node.props?.label === "Pay & Book").props.disabled,
    false
  );
  tree = nodes(
    BookingConfirmationDialog({
      ...props,
      bookingOptions: { data: { auto_accept: false, requires_payment: false } },
    })
  );
  assert.ok(tree.some((node) => node.props?.label === "Request appointment"));
  tree = nodes(
    BookingConfirmationDialog({
      ...props,
      confirmation: { ...props.confirmation, mode: "clinic" },
      serviceMode: "clinic",
      bookingOptions: {
        data: { ...props.bookingOptions.data, can_pay_reception: true },
      },
      acceptedPolicy: "policy",
    })
  );
  assert.equal(
    tree.find((node) => node.props?.label === "Pay & Book").props.disabled,
    false
  );
  assert.equal(
    tree.some((node) =>
      ["Pay online", "Pay at reception", "Book appointment"].includes(
        node.props?.label
      )
    ),
    false
  );
});

test("auto-accept loads native checkout before reserving and pays before confirmation feedback", async () => {
  const view = bookingView();
  let controller = view.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = view.render();
  await controller.book.mutateAsync(request);
  assert.deepEqual(
    view.events.map((event) => event[0]),
    ["native", "reserve", "pay"]
  );
  assert.ok(
    view.toasts.some((toast) => toast.title === "Appointment confirmed")
  );
});

test("missing SDK or unaccepted policy cannot leave a reservation", async () => {
  const missing = bookingView({ native: false });
  let controller = missing.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = missing.render();
  await assert.rejects(controller.book.mutateAsync(request), /Missing native/);
  assert.ok(!missing.events.some((event) => event[0] === "reserve"));
  const consent = bookingView();
  await assert.rejects(
    consent.render().book.mutateAsync(request),
    /Accept the payment/
  );
  assert.equal(consent.events.length, 0);
});

test("manual acceptance sends only a request without checkout", async () => {
  const view = bookingView({ automatic: false, reception: true });
  await view.render().book.mutateAsync(request);
  assert.deepEqual(
    view.events.map((event) => event[0]),
    ["reserve"]
  );
  assert.ok(
    view.toasts.some((toast) => toast.title === "Appointment requested")
  );
  assert.ok(
    !view.toasts.some((toast) => toast.title === "Appointment confirmed")
  );
});

test("clinic app bookings always use online checkout even if an older backend advertises reception", async () => {
  const view = bookingView({ reception: true });
  let controller = view.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = view.render();
  await controller.book.mutateAsync(request);
  assert.deepEqual(view.events, [
    ["native"],
    ["reserve", "online"],
    ["pay", false],
  ]);
});

test("failed checkout and unverified capture never show confirmed feedback", async () => {
  for (const fail of [true, false]) {
    const view = bookingView({ captured: false, fail });
    let controller = view.render();
    controller.setAcceptedPolicy("policy-v1");
    controller = view.render();
    if (fail) await assert.rejects(controller.book.mutateAsync(request));
    else await controller.book.mutateAsync(request);
    assert.ok(
      !view.toasts.some((toast) => toast.title === "Appointment confirmed")
    );
    assert.equal(view.routes.at(-1).pathname, "/appointment-details/[id]");
    assert.equal(view.render().bookingStage, null);
  }
});

test("the loading screen covers checkout preparation and the delayed appointment refresh before navigation", async () => {
  let reserveDone, paymentDone, refreshDone;
  const view = bookingView({
    reserveGate: new Promise((resolve) => {
      reserveDone = resolve;
    }),
    paymentGate: new Promise((resolve) => {
      paymentDone = resolve;
    }),
    refreshGate: new Promise((resolve) => {
      refreshDone = resolve;
    }),
  });
  let controller = view.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = view.render();
  const result = controller.book.mutateAsync(request);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  await flush();
  assert.equal(view.render().bookingStage, "preparing");
  assert.equal(view.routes.length, 0);
  reserveDone();
  await flush();
  assert.equal(view.render().bookingStage, "checkout");
  paymentDone();
  await flush();
  assert.equal(view.render().bookingStage, "finishing");
  assert.equal(view.routes.length, 0);
  refreshDone();
  await result;
  assert.equal(view.render().bookingStage, null);
  assert.equal(view.routes.at(-1), "/appointments");
});

test("checkout progress changes to verification before the verification response arrives", async () => {
  const stages = [];
  let verificationDone;
  const verifyGate = new Promise((resolve) => {
    verificationDone = resolve;
  });
  const { payForAppointment } = load("services/paymentCheckout.ts", {
    "react-native": {},
    "@startup/design-tokens": { colors: {} },
    "@startup/contracts": {
      appointmentCheckoutSchema: { parse: (value) => value },
    },
    "@startup/data-access": {
      processAppointmentPayment: async (_, input) =>
        input.action === "checkout"
          ? { attemptId: "attempt" }
          : await verifyGate,
    },
  });
  const payment = payForAppointment(
    {},
    {
      appointmentId: "appointment",
      policyVersion: "policy",
      patientName: "Patient",
      onStageChange: (stage) => stages.push(stage),
      openCheckout: async () => ({
        razorpay_payment_id: "payment",
        razorpay_signature: "signature",
      }),
    }
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(stages, ["preparing", "checkout", "verifying"]);
  verificationDone({ captured_minor: 500 });
  await payment;
});

test("booking progress fills the page without creating a native modal above Razorpay", () => {
  const jsx = (type, props) => ({ type, props });
  const { BookingProgress } = load(
    "features/doctors/components/BookingProgress.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "react-native": {
        View: "View",
        StyleSheet: { create: (styles) => styles },
      },
      "@startup/mobile-ui": { AppText: "Text", Loader: "Loader" },
      "@startup/design-tokens": {
        colors: {
          patient: { background: "white", text: "ink", textSecondary: "muted" },
        },
        fontFamilies: {},
      },
    }
  );
  assert.equal(BookingProgress({ stage: null }), null);
  for (const stage of [
    "booking",
    "preparing",
    "checkout",
    "verifying",
    "reconciling",
    "finishing",
  ]) {
    const tree = BookingProgress({ stage });
    assert.equal(tree.type, "View");
    assert.equal(tree.props.style.position, "absolute");
    for (const edge of ["top", "right", "bottom", "left"])
      assert.equal(tree.props.style[edge], 0);
    assert.equal(tree.props.accessibilityViewIsModal, true);
  }
});

test("home visits pass the confirmed saved destination through Pay & Book", async () => {
  const view = bookingView({ home: true });
  let controller = view.render();
  controller.setConfirmation({ windowId: "window", locationId: "location" });
  controller.setAcceptedPolicy("policy-v1");
  controller = view.render();
  await controller.book.mutateAsync(request);
  assert.deepEqual(view.events, [
    ["native"],
    ["reserve", "online"],
    ["destination", "location"],
    ["pay", false],
  ]);
});

test("home manual requests wait for approval; missing map pins never open checkout", async () => {
  const view = bookingView({ home: true, automatic: false });
  let controller = view.render();
  controller.setConfirmation({ windowId: "window", locationId: "location" });
  controller = view.render();
  await controller.book.mutateAsync(request);
  assert.deepEqual(view.events, [
    ["reserve", "online"],
    ["destination", "location"],
  ]);
  const missing = bookingView({ home: true, addressReady: false });
  controller = missing.render();
  controller.setConfirmation({ windowId: "window", locationId: "location" });
  controller = missing.render();
  await assert.rejects(controller.book.mutateAsync(request), /map pin/);
  assert.equal(missing.events.length, 0);
});

test("a failed payment keeps the reservation and offers retry or cancel instead of leaving", async () => {
  const view = bookingView({ payOutcomes: ["failed", "paid"] });
  let controller = view.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = view.render();
  await assert.rejects(controller.book.mutateAsync(request), /Payment failed/);
  controller = view.render();
  assert.equal(controller.paymentFailure.appointmentId, "appointment");
  assert.equal(controller.paymentFailure.holdUntil, "2026-11-01T10:10:00Z");
  assert.ok(view.toasts.some((toast) => toast.title === "Payment failed"));
  assert.ok(!view.events.some((event) => event[0] === "release"));
  assert.deepEqual(view.routes, [], "stays on the doctor page");
  assert.equal(controller.bookingStage, null);
  // Retry pays the same reservation and confirms it.
  await controller.retryPayment();
  controller = view.render();
  assert.equal(controller.paymentFailure, null);
  assert.deepEqual(
    view.events.filter((event) => event[0] === "pay"),
    [
      ["pay", false],
      ["pay", false],
    ]
  );
  assert.ok(
    view.toasts.some((toast) => toast.title === "Appointment confirmed")
  );
  assert.equal(view.routes.at(-1), "/appointments");
});

test("a retry that fails again asks again; cancel releases the reservation", async () => {
  const view = bookingView({ payOutcomes: ["failed", "failed"] });
  let controller = view.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = view.render();
  await assert.rejects(controller.book.mutateAsync(request));
  await view.render().retryPayment();
  controller = view.render();
  assert.equal(controller.paymentFailure.appointmentId, "appointment");
  assert.equal(
    view.toasts.filter((toast) => toast.title === "Payment failed").length,
    2
  );
  await controller.cancelFailedBooking();
  controller = view.render();
  assert.equal(controller.paymentFailure, null);
  assert.deepEqual(
    view.events.filter((event) => event[0] === "release"),
    [["release", "appointment"]]
  );
  assert.ok(view.toasts.some((toast) => toast.title === "Booking cancelled"));
  assert.ok(
    !view.toasts.some((toast) => toast.title === "Appointment confirmed")
  );
});

test("an uncertain payment is not offered as a retry; closing the prompt keeps the reservation", async () => {
  const uncertain = bookingView({ payOutcomes: ["uncertain"] });
  let controller = uncertain.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = uncertain.render();
  await assert.rejects(controller.book.mutateAsync(request));
  assert.equal(uncertain.render().paymentFailure, null);
  assert.equal(
    uncertain.routes.at(-1).pathname,
    "/appointment-details/[id]",
    "money may be in flight: check status instead"
  );
  const closed = bookingView({ payOutcomes: ["failed"] });
  controller = closed.render();
  controller.setAcceptedPolicy("policy-v1");
  controller = closed.render();
  await assert.rejects(controller.book.mutateAsync(request));
  closed.render().dismissPaymentFailure();
  assert.equal(closed.render().paymentFailure, null);
  assert.ok(!closed.events.some((event) => event[0] === "release"));
  assert.equal(closed.routes.at(-1).pathname, "/appointment-details/[id]");
});

test("checkout can keep an unpaid reservation and marks only known-unpaid failures as retryable", async () => {
  for (const attemptStatus of ["created", "uncertain"]) {
    const events = [];
    const { payForAppointment, isRetryablePaymentFailure } = load(
      "services/paymentCheckout.ts",
      {
        "react-native": {},
        "@startup/design-tokens": { colors: {} },
        "@startup/contracts": {
          appointmentCheckoutSchema: { parse: (value) => value },
        },
        "@startup/data-access": {
          processAppointmentPayment: async (_, input) =>
            input.action === "checkout"
              ? { attemptId: "attempt" }
              : { captured_minor: 0, attempts: [{ status: attemptStatus }] },
          releaseAppointmentBooking: async () => events.push("release"),
        },
      }
    );
    const error = await payForAppointment(
      {},
      {
        appointmentId: "appointment",
        policyVersion: "policy",
        patientName: "Patient",
        reservation: true,
        releaseUnpaid: false,
        openCheckout: async () => {
          throw new Error("Payment failed");
        },
      }
    ).catch((cause) => cause);
    assert.deepEqual(events, [], "the reservation is kept");
    assert.equal(isRetryablePaymentFailure(error), attemptStatus === "created");
  }
});
