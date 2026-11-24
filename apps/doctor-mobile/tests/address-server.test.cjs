const { test } = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  path = require("node:path");

const {
  loadEdgeLogger,
} = require("../../../packages/contracts/tests/support/errorTestDoubles.cjs");

const logs = [];

// Real Edge logger; captured lines let tests prove secrets are redacted.
const edgeLogger = loadEdgeLogger({
  error: (line) => logs.push(line),
  warn: (line) => logs.push(line),
});

function server({
  key = "test-server-key",
  allowed = true,
  status = "OK",
  result,
  fetchError,
} = {}) {
  let fetchCount = 0,
    auth;
  const addressExports = {},
    exports = {};
  const compile = (name) =>
    ts.transpileModule(
      fs.readFileSync(
        path.join(
          __dirname,
          "../../../supabase/functions/resolve-map-address",
          name
        ),
        "utf8"
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText;
  vm.runInNewContext(compile("address.ts"), { exports: addressExports });
  vm.runInNewContext(compile("index.ts"), {
    exports,
    require: (n) =>
      n === "./address.ts"
        ? addressExports
        : n === "../_shared/log.ts"
          ? edgeLogger
          : {
              withSupabase: (options, handler) => {
                auth = options.auth;
                return (request) =>
                  handler(request, {
                    supabase: {
                      rpc: async () => ({ data: allowed, error: null }),
                    },
                  });
              },
            },
    Deno: { env: { get: () => key } },
    URL,
    Response,
    Error,
    AbortSignal,
    fetch: async () => {
      fetchCount++;
      if (fetchError) throw fetchError;
      return Response.json({ status, results: result ? [result] : [] });
    },
  });
  return {
    call: (body, method = "POST") =>
      exports.default.fetch(
        new Request("https://test.local", {
          method,
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        })
      ),
    count: () => fetchCount,
    auth: () => auth,
  };
}

const point = { latitude: 12.9, longitude: 77.5 };

test("server endpoint requires user auth and rejects invalid coordinates before Google", async () => {
  const f = server();
  assert.equal(f.auth(), "user");
  assert.equal((await f.call({ ...point, latitude: 91 })).status, 400);
  assert.equal(f.count(), 0);
  assert.equal((await f.call(null, "GET")).status, 405);
});

test("unconfigured server returns a clear unconfigured result without sending Google requests", async () => {
  const unconfigured = server({ key: null });
  assert.equal(
    (await (await unconfigured.call(point)).json()).configured,
    false
  );
  assert.equal(unconfigured.count(), 0);
});

test("rate-limited requests cannot contact Google", async () => {
  const f = server({ allowed: false });
  assert.equal((await f.call(point)).status, 429);
  assert.equal(f.count(), 0);
});

test("Google results fill structured address fields and do not snap the selected coordinates", async () => {
  const f = server({
    result: {
      formatted_address: "10 Main Road, Bengaluru",
      address_components: [
        { types: ["street_number"], long_name: "10" },
        { types: ["route"], long_name: "Main Road" },
        { types: ["locality"], long_name: "Bengaluru" },
        { types: ["postal_code"], long_name: "560010" },
      ],
    },
  });
  const response = await f.call(point),
    data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.address.street, "10 Main Road");
  assert.equal(data.address.city, "Bengaluru");
  assert.equal(data.address.pincode, "560010");
  assert.equal("latitude" in data.address, false);
});

test("configuration errors are distinct from empty results", async () => {
  const denied = await server({ status: "REQUEST_DENIED" }).call(point);
  assert.equal(denied.status, 502);
  assert.match((await denied.json()).error, /not authorized/);
  const empty = await server({ status: "ZERO_RESULTS" }).call(point);
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).address, null);
});

test("network errors cannot expose the Google key or request URL", async () => {
  const f = server({
    fetchError: new Error(
      "Request failed: https://maps.googleapis.com/?key=test-server-key"
    ),
  });
  logs.length = 0;
  const response = await f.call(point);
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes("test-server-key"), false);
  // The failure is logged for operators, with the key parameter redacted.
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes("test-server-key"), false);
  assert.match(logs[0], /key=\[redacted\]/);
  assert.equal(JSON.parse(logs[0]).fn, "resolve-map-address");
});
