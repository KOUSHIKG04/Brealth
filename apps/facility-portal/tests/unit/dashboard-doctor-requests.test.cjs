const { test } = require("node:test");

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");

function compile(file, mocks) {
  const absolute = path.resolve(__dirname, "../../src", file),
    exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (!name.startsWith(".")) throw Error("Unmocked import: " + name);
        const target = path.resolve(path.dirname(absolute), name),
          resolved = [target, target + ".ts", target + ".tsx"].find(
            (file) => fs.existsSync(file) && fs.statSync(file).isFile()
          );
        if (!resolved) throw Error("Unresolved import: " + name);
        return compile(
          path.relative(path.resolve(__dirname, "../../src"), resolved),
          mocks
        );
      },
      Date,
      Set,
    }
  );
  return exports;
}

const { incomingDoctorRequests } = compile(
  "features/doctors/utils/incomingDoctorRequests.ts",
  {}
);

const request = (
  id,
  status = "pending",
  initiated_by = "doctor",
  created_at = "2026-10-13T09:00:00Z"
) => ({
  id,
  status,
  initiated_by,
  created_at,
  doctor_name: "Test Doctor",
  facility_name: "Test Clinic",
});

test("dashboard includes incoming associations only, newest first", () => {
  const rows = [
    request("old"),
    request("approved", "approved"),
    request("invite", "pending", "facility"),
    request("new", "pending", "doctor", "2026-10-13T10:00:00Z"),
  ];
  assert.deepEqual(
    Array.from(incomingDoctorRequests(rows), (row) => row.id),
    ["new", "old"]
  );
});

test("dashboard alerts once for a new incoming request and keeps its query facility-scoped", () => {
  let data = [request("old")],
    index = 0;
  const refs = [],
    effects = [],
    messages = [],
    queryKeys = [];
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: {
      useRef: (initial) => {
        const slot = index++;
        refs[slot] ??= { current: initial };
        return refs[slot];
      },
      useEffect: (fn) => effects.push(fn),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { __esModule: true, default: "Link" },
    "@tanstack/react-query": {
      useQuery: (options) => {
        queryKeys.push(options.queryKey);
        assert.equal(options.refetchInterval, undefined);
        assert.equal(options.staleTime, Infinity);
        return { data, isLoading: false, isError: false };
      },
    },
    "@startup/web-ui/components/ui/toast": {
      toast: { add: (message) => messages.push(message) },
    },
    "../utils/incomingDoctorRequests": { incomingDoctorRequests },
    "@startup/web-ui/components/ui/skeleton": {},
    "@startup/data-access": {},
    "@/lib/supabase/browser": {},
    "../hooks/useFacilityDoctorRequestEvents": {
      useFacilityDoctorRequestEvents() {},
    },
    "./useFacilityDoctorRequestEvents": { useFacilityDoctorRequestEvents() {} },
  };
  const { DashboardDoctorRequests } = compile(
    "features/doctors/components/DashboardDoctorRequests.tsx",
    mocks
  );
  const render = () => {
    index = 0;
    effects.length = 0;
    const tree = DashboardDoctorRequests({
      scope: "facility-a",
      initialRequests: [request("old")],
    });
    effects.forEach((fn) => fn());
    return tree;
  };
  render();
  assert.equal(messages.length, 0);
  data = [request("old"), request("new")];
  render();
  assert.equal(messages.length, 1);
  assert.match(messages[0].title, /New doctor association/);
  render();
  assert.equal(messages.length, 1);
  data = [request("old"), request("invite", "pending", "facility")];
  render();
  assert.equal(messages.length, 1);
  data = [request("old"), request("new")];
  render();
  assert.equal(messages.length, 2);
  assert.deepEqual(Array.from(queryKeys[0]), [
    "facility-doctor-requests",
    "facility-a",
  ]);
});

test("dashboard hides unconfigured beds, retains full wards and puts both actions in its header", () => {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { default: DashboardScreen } = compile(
    "features/dashboard/screens/DashboardScreen.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/link": "Link",
      "lucide-react": new Proxy({}, { get: (_target, key) => key }),
      "@startup/contracts": {
        formatDisplayDate: () => "30 Oct 2026",
        formatDisplayDateTime: (value) => value,
      },
      "../components/AcceptPendingAppointmentButton": {
        AcceptPendingAppointmentButton: "Accept",
      },
      "../components/DashboardErrorToast": { DashboardErrorToast: "Toast" },
      "../components/WeeklyDoctorSchedule": {
        WeeklyDoctorSchedule: "WeeklySchedule",
      },
    }
  );
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [node];
  const render = (inventory) =>
    flatten(
      DashboardScreen({
        doctorAction: "Add doctor",
        appointmentAction: "Add appointment",
        inventory,
        appointments: [],
        weeklyDoctors: [],
        acceptAppointment() {},
      })
    );
  for (const inventory of [[], [{ configured: false, total: 0 }]]) {
    const nodes = render(inventory);
    assert.equal(nodes.includes("Bed Availability by Type"), false);
    const header = nodes.find((node) => node?.type === "header");
    assert.ok(flatten(header).includes("Add doctor"));
    assert.ok(flatten(header).includes("Add appointment"));
  }
  const full = render([
    {
      configured: true,
      total: 10,
      available: 0,
      occupied: 10,
      bedTypeName: "General",
    },
  ]);
  assert.ok(full.includes("Bed Availability by Type"));
});

function weeklyRosterFixture(doctors) {
  const states = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { WeeklyDoctorSchedule } = compile(
    "features/dashboard/components/WeeklyDoctorSchedule.tsx",
    {
      react: {
        useState(initial) {
          const index = cursor++;
          if (!(index in states))
            states[index] = typeof initial === "function" ? initial() : initial;
          return [
            states[index],
            (value) => {
              states[index] =
                typeof value === "function" ? value(states[index]) : value;
            },
          ];
        },
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/link": "Link",
      "lucide-react": new Proxy({}, { get: (_target, key) => key }),
      "@startup/web-ui/components/ui/button": { Button: "Button" },
    }
  );
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [node];
  return {
    render(data = doctors) {
      cursor = 0;
      return flatten(WeeklyDoctorSchedule({ doctors: data }));
    },
  };
}

test("weekly roster keeps seven dates and clinic availability for every visible doctor", () => {
  const doctors = [
    {
      id: "a",
      name: "Doctor A",
      speciality: "General",
      days: [true, false, false, false, false, false, false],
    },
    {
      id: "b",
      name: "Doctor B",
      speciality: "General",
      days: [false, true, false, false, false, false, false],
    },
  ];
  const fixture = weeklyRosterFixture(doctors),
    nodes = fixture.render();
  assert.ok(nodes.includes("Doctor A"));
  assert.ok(nodes.includes("Doctor B"));
  const days = nodes.filter(
    (node) => node?.props?.role === "columnheader" && node.props["aria-label"]
  );
  assert.equal(days.length, 7);
  assert.match(days[0].props["aria-label"], /Monday/);
  assert.match(days[6].props["aria-label"], /Sunday/);
  assert.equal(
    days.filter((node) => node.props["aria-current"] === "date").length,
    1
  );
  const cells = nodes.filter((node) => node?.props?.role === "cell");
  assert.equal(cells.length, 14);
  assert.equal(
    cells.filter((node) =>
      node.props["aria-label"].endsWith("Clinic scheduled")
    ).length,
    2
  );
  assert.ok(
    cells.some(
      (node) => node.props["aria-label"] === "Doctor A · Mon · Clinic scheduled"
    )
  );
  assert.ok(
    cells.some(
      (node) =>
        node.props["aria-label"] ===
        "Doctor A · Tue · No published clinic shift"
    )
  );
  const empty = fixture.render([]);
  assert.equal(
    empty.some((node) => node?.props?.role === "table"),
    false
  );
  assert.ok(
    empty.some(
      (node) =>
        typeof node === "string" && node.includes("No doctors are associated")
    )
  );
});

test("large weekly rosters paginate, search all doctors and recover from no matches", () => {
  const doctors = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    name: "Doctor " + (index + 1),
    speciality: index % 2 ? "Cardiology" : "General",
    days: [true, false, false, false, false, false, false],
  }));
  const fixture = weeklyRosterFixture(doctors);
  let nodes = fixture.render();
  assert.equal(nodes.filter((node) => node?.props?.role === "cell").length, 35);
  assert.ok(nodes.includes("Doctor 1"));
  assert.equal(nodes.includes("Doctor 6"), false);
  nodes
    .find((node) => node?.props?.["aria-label"] === "Next doctors")
    .props.onClick();
  nodes = fixture.render();
  assert.ok(nodes.includes("Doctor 6"));
  assert.equal(nodes.includes("Doctor 1"), false);
  nodes
    .find((node) => node?.props?.["aria-label"] === "Next doctors")
    .props.onClick();
  nodes = fixture.render();
  assert.ok(nodes.includes("Doctor 12"));
  assert.equal(nodes.filter((node) => node?.props?.role === "cell").length, 14);
  assert.equal(
    nodes.find((node) => node?.props?.["aria-label"] === "Next doctors").props
      .disabled,
    true
  );
  nodes
    .find((node) => node?.type === "input")
    .props.onChange({ target: { value: "Doctor 2" } });
  nodes = fixture.render();
  assert.ok(nodes.includes("Doctor 2"));
  assert.equal(nodes.filter((node) => node?.props?.role === "cell").length, 7);
  assert.equal(
    nodes.find((node) => node?.props?.["aria-label"] === "Previous doctors")
      .props.disabled,
    true
  );
  nodes
    .find((node) => node?.type === "input")
    .props.onChange({ target: { value: "No match" } });
  nodes = fixture.render();
  assert.ok(nodes.includes("No doctors match your search."));
  assert.equal(nodes.filter((node) => node?.props?.role === "cell").length, 0);
  nodes
    .find((node) => node?.props?.children === "Clear search")
    .props.onClick();
  nodes = fixture.render();
  assert.ok(nodes.includes("Doctor 1"));
  assert.equal(nodes.filter((node) => node?.props?.role === "cell").length, 35);
  nodes
    .find((node) => node?.type === "input")
    .props.onChange({ target: { value: "cardiology" } });
  nodes = fixture.render();
  assert.ok(nodes.includes("Doctor 2"));
  assert.equal(nodes.includes("Doctor 1"), false);
});
