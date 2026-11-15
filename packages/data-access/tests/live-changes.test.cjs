const { test } = require("node:test");

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  path = require("node:path");

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
  const channels = [],
    removed = [];
  let close;
  const client = {
    realtime: { setAuth: async () => {} },
    channel: (topic, options) => {
      const channel = {
        topic,
        options,
        on(type, filter, handler) {
          this.handler = handler;
          return this;
        },
        subscribe(status) {
          this.status = status;
          return this;
        },
      };
      channels.push(channel);
      return channel;
    },
    removeChannel: (channel) => {
      removed.push(channel);
      return new Promise((resolve) => {
        close = resolve;
      });
    },
  };
  const exports = {};
  const source = fs.readFileSync(
    path.join(__dirname, "../src/realtime/liveChanges.ts"),
    "utf8"
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name) =>
        name === "@startup/contracts"
          ? {
              uuidSchema: {
                parse: (id) => {
                  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error("UUID required");
                  return id;
                },
              },
            }
          : {},
      queueMicrotask,
      setTimeout,
      clearTimeout,
    }
  );
  return {
    client,
    channels,
    removed,
    subscribe: exports.subscribeAppChanges,
    delays: exports.liveOutageDelays,
    close: () => close?.("ok"),
  };
}

const identityId = "00000000-0000-4000-8000-000000000001";

test("overlapping subscribers share a private channel and only receive valid signals", async () => {
  const f = fixture();
  let first = 0,
    second = 0,
    joined = 0;
  const a = f.subscribe(
    f.client,
    { identityId },
    {
      onChange: (event) => {
        first++;
        assert.equal(event.topic, "identity-events:" + identityId);
      },
      onConnected: () => joined++,
    }
  );
  const b = f.subscribe(f.client, { identityId }, { onChange: () => second++ });
  await flush();
  assert.equal(f.channels.length, 1);
  assert.equal(f.channels[0].options.config.private, true);
  f.channels[0].status("SUBSCRIBED");
  assert.equal(joined, 1);
  f.channels[0].handler({ payload: { kind: "appointments" } });
  f.channels[0].handler({
    payload: { kind: "unknown", patient_name: "ignored" },
  });
  assert.equal(first, 1);
  assert.equal(second, 1);
  a();
  assert.equal(f.removed.length, 0);
  f.channels[0].handler({ payload: { kind: "tracking" } });
  assert.equal(first, 1);
  assert.equal(second, 2);
  b();
  assert.equal(f.removed.length, 1);
  f.close();
  await flush();
});

test("a rapid remount waits for the old channel to close and then catches up", async () => {
  const f = fixture();
  const old = f.subscribe(f.client, { identityId }, { onChange() {} });
  await flush();
  old();
  let joins = 0;
  const cleanup = f.subscribe(
    f.client,
    { identityId },
    { onChange() {}, onConnected: () => joins++ }
  );
  await flush();
  assert.equal(f.channels.length, 1);
  f.close();
  await flush();
  assert.equal(f.channels.length, 2);
  f.channels[1].status("SUBSCRIBED");
  f.channels[1].status("SUBSCRIBED");
  assert.equal(joins, 2);
  cleanup();
  f.close();
  await flush();
});

function watch(f) {
  const seen = { statuses: [], errors: 0, joins: 0 };
  const cleanup = f.subscribe(
    f.client,
    { identityId },
    {
      onChange() {},
      onConnected: () => seen.joins++,
      onError: () => seen.errors++,
      onStatus: (status) => seen.statuses.push(status),
    }
  );
  return { seen, cleanup };
}

test("a brief drop that reconnects within the outage delay stays silent", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  const { seen, cleanup } = watch(f);
  await flush();
  f.channels[0].status("SUBSCRIBED");
  f.channels[0].status("TIMED_OUT");
  f.channels[0].status("CLOSED");
  t.mock.timers.tick(f.delays.initial);
  f.channels[0].status("SUBSCRIBED");
  t.mock.timers.tick(f.delays.confirm * 2);
  assert.equal(seen.errors, 0);
  assert.deepEqual(seen.statuses, ["live", "reconnecting", "live"]);
  assert.equal(seen.joins, 2);
  cleanup();
});

test("a sustained outage reports once, and a reconnect clears it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  const { seen, cleanup } = watch(f);
  await flush();
  f.channels[0].status("SUBSCRIBED");
  f.channels[0].status("CHANNEL_ERROR");
  t.mock.timers.tick(f.delays.initial);
  // The confirm window starts only after the first timer, so a resumed app
  // still gets time to rejoin before an outage is declared.
  assert.equal(seen.errors, 0);
  f.channels[0].status("CHANNEL_ERROR");
  t.mock.timers.tick(f.delays.confirm);
  assert.equal(seen.errors, 1);
  f.channels[0].status("CHANNEL_ERROR");
  t.mock.timers.tick(f.delays.initial + f.delays.confirm);
  assert.equal(seen.errors, 1, "one report per outage");
  f.channels[0].status("SUBSCRIBED");
  assert.deepEqual(seen.statuses, ["live", "reconnecting", "down", "live"]);
  cleanup();
});

test("a late subscriber learns about an outage already in progress", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  const first = watch(f);
  await flush();
  f.channels[0].status("CHANNEL_ERROR");
  t.mock.timers.tick(f.delays.initial);
  t.mock.timers.tick(f.delays.confirm);
  const late = watch(f);
  await flush();
  assert.deepEqual(late.seen.statuses, ["down"]);
  assert.equal(late.seen.errors, 1);
  first.cleanup();
  late.cleanup();
});

test("unsubscribing cancels a pending outage timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  const { seen, cleanup } = watch(f);
  await flush();
  f.channels[0].status("CHANNEL_ERROR");
  cleanup();
  t.mock.timers.tick(f.delays.initial + f.delays.confirm);
  assert.equal(seen.errors, 0);
});
