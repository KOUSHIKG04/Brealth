const { test } = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");

const jsx = (type, props) => ({ type, props: props ?? {} });

function load(relative, mocks, globals = {}) {
  const file = path.resolve(__dirname, relative),
    exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Date,
      Intl,
      Math,
      Array,
      ...globals,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        throw Error("Unmocked import: " + name);
      },
    }
  );
  return exports;
}

function nodesOf(tree) {
  const result = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    result.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return result;
}

const id = "65d508a2-4a3f-4e6c-8594-02045f04a3dc";

const item = {
  id,
  public_code: "APT-LONG-12345678",
  visit_mode: "clinic",
  status: "confirmed",
  queue_state: "awaiting_arrival",
  starts_at: "2026-10-23T00:30:00+05:30",
  timezone: "Asia/Kolkata",
  ticket_number: 14,
  ahead_count: 3,
};

const helpers = load("../src/features/appointments/utils/clinicVisit.ts", {
  "@startup/contracts": load(
    "../../../packages/contracts/src/appointment-recovery.ts",
    {
      zod: require("zod"),
      "./validation": { uuidSchema: require("zod").z.uuid() },
    }
  ),
  "./clinicAppointmentCard": {
    clinicAppointmentCard: (entry) => ({
      backendId: entry.id,
      id: entry.public_code,
    }),
  },
});

test("QR entry appears on the clinic's local day and retains the full backend ID in navigation", () => {
  assert.equal(
    helpers.canOpenClinicVisit(item, new Date("2026-10-22T18:59:00Z")),
    true
  );
  assert.equal(
    helpers.canOpenClinicVisit(item, new Date("2026-10-22T18:00:00Z")),
    false
  );
  assert.equal(
    helpers.canOpenClinicVisit(
      { ...item, status: "cancelled" },
      new Date("2026-10-22T18:59:00Z")
    ),
    false
  );
  const route = helpers.clinicVisitRoute(item);
  assert.equal(route.pathname, "/visit-session");
  assert.equal(route.params.backendId, id);
  assert.equal(route.params.mode, "clinic-check-in");
});

function clinicPage({ state = "awaiting_arrival", status = "confirmed" } = {}) {
  let refreshes = 0,
    completions = 0;
  const current = { ...item, queue_state: state, status };
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useRef: () => ({ current: false }), useEffect: () => {} },
    "react-native": { View: "View", StyleSheet: { create: (style) => style } },
    "lucide-react-native": { MapPin: "MapPin" },
    "react-qr-code": { __esModule: true, default: "QRCode" },
    "@startup/design-tokens": {
      colors: { white: "white", patient: {} },
      fontFamilies: {},
      radius: {},
      spacing: {},
    },
    "@startup/mobile-ui": {
      AppText: "Text",
      Button: "Button",
      Card: "Card",
      FadedScrollView: "Scroll",
      Loader: "Loader",
    },
    "../hooks/useClinicCheckIn": {
      useClinicCheckIn: () => ({
        live: true,
        item: current,
        appointments: {
          isLoading: false,
          isError: false,
          refetch: () => {
            refreshes++;
          },
        },
        canShowQr: state === "awaiting_arrival",
        qr: "signed-single-use-token",
        issueQr: { isPending: false, isError: false },
        refreshQr() {},
      }),
    },
    "./ScheduleSummary": { ScheduleSummary: "Summary" },
    "./QueueStatus": { QueueStatus: "Queue" },
  };
  const { ClinicVisitFlow } = load(
    "../src/features/consultations/components/ClinicVisitFlow.tsx",
    mocks
  );
  return {
    render: () =>
      nodesOf(
        ClinicVisitFlow({
          appointment: { backendId: id, id: item.public_code },
          onComplete: () => {
            completions++;
          },
        })
      ),
    get refreshes() {
      return refreshes;
    },
    get completions() {
      return completions;
    },
  };
}

test("the separate QR page renders the signed token and checking arrival refreshes server state", () => {
  const page = clinicPage();
  let nodes = page.render();
  assert.equal(
    nodes.find((n) => n.type === "QRCode").props.value,
    "signed-single-use-token"
  );
  nodes.find((n) => n.props.label === "I’ve checked in").props.onPress();
  nodes = page.render();
  assert.equal(page.refreshes, 1);
  assert.equal(page.completions, 0);
  assert.equal(
    nodes.find((n) => n.type === "Queue"),
    undefined
  );
  assert.doesNotMatch(JSON.stringify(nodes), /BK12454OPY/);
});

test("confirmed arrival replaces the QR with the real queue entry", () => {
  const nodes = clinicPage({ state: "waiting" }).render();
  assert.equal(
    nodes.find((n) => n.type === "QRCode"),
    undefined
  );
  assert.equal(
    nodes.find((n) => n.type === "Queue").props.appointment.ticket_number,
    14
  );
});

test("queue panels use server ticket and people ahead without a made-up wait time or completion button", () => {
  const { QueueStatus } = load(
    "../src/features/consultations/components/QueueStatus.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "react-native": {
        Image: "Image",
        View: "View",
        StyleSheet: { create: (style) => style },
      },
      "lucide-react-native": { Info: "Info", UserRound: "Avatar" },
      "@startup/design-tokens": {
        colors: { white: "white", patient: {} },
        fontFamilies: {},
        radius: {},
      },
      "@startup/mobile-ui": { AppText: "Text", Card: "Card" },
      "../utils/queueConstants": { queueSeatsImage: "seats.png" },
    }
  );
  const nodes = nodesOf(
    QueueStatus({ appointment: { ...item, queue_state: "waiting" } })
  );
  assert.ok(nodes.some((n) => n.props.children === 14));
  assert.ok(nodes.some((n) => n.props.children === 3));
  assert.doesNotMatch(
    JSON.stringify(nodes),
    /ESTIMATED TIME|Preview completed visit|MIN\./
  );
  const metadata = {
    planned_number: 14,
    position: 4,
    patients_ahead: 3,
    currently_serving: 9,
    late_review_required: false,
    can_call: false,
    grace_minutes: 10,
    estimated_start: "2026-10-23T05:00:00Z",
    estimated_end: "2026-10-23T05:15:00Z",
  };
  const live = nodesOf(
    QueueStatus({
      appointment: { ...item, queue_state: "waiting", clinic_queue: metadata },
    })
  );
  assert.match(JSON.stringify(live), /Estimated consultation/);
  assert.match(JSON.stringify(live), /Your token stays the same/);
  const late = nodesOf(
    QueueStatus({
      appointment: {
        ...item,
        queue_state: "held",
        clinic_queue: { ...metadata, late_review_required: true },
      },
    })
  );
  assert.match(JSON.stringify(late), /Reception will help/);
});

test("the focused clinic page requests one secure QR, expires it, and stops polling when left", async () => {
  let clock = Date.now(),
    cursor = 0,
    mutationOptions,
    focusCleanup;
  const slots = [],
    effects = [],
    requests = [],
    pending = [],
    timeouts = new Map(),
    intervals = new Map();
  let timerId = 0;
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
    static now() {
      return clock;
    }
  }
  const current = { ...item, starts_at: new Date(clock).toISOString() };
  const query = {
    data: [current],
    refetch: async () => {},
    isLoading: false,
    isError: false,
  };
  function same(a, b) {
    return (
      a &&
      b &&
      a.length === b.length &&
      a.every((value, index) => Object.is(value, b[index]))
    );
  }
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initial === "function" ? initial() : initial;
      return [
        slots[i],
        (value) => {
          slots[i] = value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ||= { current: initial });
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => {
          slots[i].cleanup = callback();
        });
      }
    },
  };
  const mutate = (id) =>
    pending.push(
      (async () => {
        const result = await mutationOptions.mutationFn(id);
        mutationOptions.onSuccess(result);
      })()
    );
  let queryOptions;
  const { useClinicCheckIn } = load(
    "../src/features/consultations/hooks/useClinicCheckIn.ts",
    {
      react,
      "expo-router": {
        useFocusEffect(callback) {
          if (!focusCleanup) focusCleanup = callback();
        },
      },
      "@tanstack/react-query": {
        useQuery(options) {
          queryOptions = options;
          return query;
        },
        useMutation(options) {
          mutationOptions = options;
          return { mutate, isPending: false };
        },
      },
      "@startup/contracts": {
        uuidSchema: { safeParse: (value) => ({ success: value === id }) },
      },
      "@startup/data-access": {
        listClinicAppointments: async () => [current],
        issueClinicCheckinToken: async (_client, value) => {
          requests.push(value);
          return "secure-token";
        },
      },
      "../../../services/supabase": { supabase: {} },
      "../../appointments/utils/clinicVisit": helpers,
    },
    {
      Date: Clock,
      setTimeout: (fn, delay) => {
        timeouts.set(++timerId, { fn, delay });
        return timerId;
      },
      clearTimeout: (id) => timeouts.delete(id),
      setInterval: (fn) => {
        intervals.set(++timerId, fn);
        return timerId;
      },
      clearInterval: (id) => intervals.delete(id),
    }
  );
  function render() {
    cursor = 0;
    const result = useClinicCheckIn(id);
    while (effects.length) effects.shift()();
    return result;
  }
  render();
  render();
  await Promise.all(pending);
  let view = render();
  assert.deepEqual(requests, [id]);
  assert.equal(view.qr, "secure-token");
  assert.equal(queryOptions.refetchInterval, 15000);
  render();
  assert.equal(requests.length, 1);
  assert.equal(timeouts.size, 1);
  const expiry = [...timeouts.values()][0];
  assert.equal(expiry.delay, 300000);
  clock += 300001;
  expiry.fn();
  view = render();
  assert.equal(view.qr, null);
  view.refreshQr();
  await Promise.all(pending);
  view = render();
  assert.equal(requests.length, 2);
  assert.equal(view.qr, "secure-token");
  current.queue_state = "waiting";
  assert.equal(render().qr, null);
  focusCleanup();
  render();
  assert.equal(queryOptions.refetchInterval, false);
  assert.equal(intervals.size, 0);
});
