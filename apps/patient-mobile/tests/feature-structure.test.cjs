const { test } = require("node:test");

const assert = require("node:assert/strict");

const path = require("node:path");

test("mobile feature ownership, imports and syntax remain valid", async () => {
  const { inspectFeatureStructure } =
    await import("../../facility-portal/scripts/feature-structure.mjs");
  assert.deepEqual(
    inspectFeatureStructure(path.resolve(__dirname, ".."), { mobile: true }),
    []
  );
});
