import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadAuth() {
  const messages = {};
  const operations = {};
  function load(file, exports, require = () => undefined) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    vm.runInNewContext(code, { exports, require, Error });
  }
  load("../src/auth/errorMessages.ts", messages);
  load("../src/auth/operations.ts", operations, (name) => {
    if (name === "./errorMessages") return messages;
    if (name === "@startup/contracts") {
      const schema = { parse: (value) => value };
      return {
        phoneSchema: schema,
        otpSchema: schema,
        onboardingSchema: schema,
        myProfileSchema: schema,
      };
    }
    throw new Error(`Unexpected import: ${name}`);
  });
  return { ...messages, ...operations };
}

test("unknown provider/profile errors never become UI text", () => {
  const { getAuthErrorMessage } = loadAuth();
  const fallback = "Could not load your profile.";
  for (const error of [
    new Error("internal relation, private record and bearer-token details"),
    { code: "unknown_server_code", message: "private details", status: 500 },
    { name: "ZodError", message: "private profile payload" },
    "private raw response",
    null,
  ]) {
    assert.equal(getAuthErrorMessage(error, fallback), fallback);
  }
  assert.equal(
    getAuthErrorMessage(
      {
        get message() {
          throw new Error("message must not be inspected");
        },
      },
      fallback
    ),
    fallback
  );
});

test("known Auth codes keep actionable safe messages without provider text", () => {
  const { getAuthErrorMessage } = loadAuth();
  const expected = [
    [
      "invalid_credentials",
      "Could not sign in. Check your details and try again.",
    ],
    ["otp_expired", "This code is invalid or has expired. Request a new code."],
    ["email_not_confirmed", "Confirm your email, then sign in again."],
    ["weak_password", "Choose a stronger password and try again."],
    ["refresh_token_not_found", "Your session has expired. Sign in again."],
  ];
  for (const [code, message] of expected) {
    assert.equal(
      getAuthErrorMessage(
        { code, message: "untrusted provider text" },
        "Fallback"
      ),
      message
    );
  }
  const rateLimit = "Too many attempts. Wait a few minutes and try again.";
  for (const code of [
    "over_request_rate_limit",
    "over_email_send_rate_limit",
    "over_sms_send_rate_limit",
  ]) {
    assert.equal(getAuthErrorMessage({ code }, "Fallback"), rateLimit);
  }
  assert.equal(getAuthErrorMessage({ status: 429 }, "Fallback"), rateLimit);
  assert.equal(
    getAuthErrorMessage({ name: "AuthRetryableFetchError" }, "Fallback"),
    "Could not connect. Check your connection and try again."
  );
});

test("password and OTP operations normalize returned and rejected errors", async () => {
  const auth = loadAuth();
  for (const [operation, method, args] of [
    ["sendPhoneOtp", "signInWithOtp", ["+919876543210"]],
    ["verifyPhoneOtp", "verifyOtp", ["+919876543210", "123456"]],
    [
      "signInWithDevPassword",
      "signInWithPassword",
      ["dummy@example.test", "dummy"],
    ],
    ["signUpWithDevPassword", "signUp", ["dummy@example.test", "dummy"]],
  ]) {
    for (const rejects of [false, true]) {
      const providerError = {
        code: "over_request_rate_limit",
        message: "private details",
      };
      const client = {
        auth: {
          [method]: async () => {
            if (rejects) throw providerError;
            return { data: null, error: providerError };
          },
        },
      };
      await assert.rejects(auth[operation](client, ...args), {
        message: "Too many attempts. Wait a few minutes and try again.",
      });
    }
  }
});

test("successful sessions and confirmation-required signup keep existing behavior", async () => {
  const auth = loadAuth();
  const session = { user: { id: "synthetic-user" } };
  let input;
  const client = {
    auth: {
      signInWithPassword: async (value) => {
        input = value;
        return { data: { session }, error: null };
      },
      verifyOtp: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
    },
  };
  assert.equal(
    await auth.signInWithDevPassword(
      client,
      " dummy@example.test ",
      "password"
    ),
    session
  );
  assert.equal(input.email, "dummy@example.test");
  assert.equal(input.password, "password");
  assert.equal(
    await auth.verifyPhoneOtp(client, "+919876543210", "123456"),
    session
  );
  assert.equal(
    await auth.signUpWithDevPassword(client, "dummy@example.test", "password"),
    null
  );
});
