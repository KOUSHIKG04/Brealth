import { expect, test } from "bun:test";
import {
  errorCode,
  isExpectedError,
  isNetworkError,
  shouldRetryRequest,
  userErrorMessage,
} from "../src/errors";

const coded = (message: string, code: string) =>
  Object.assign(new Error(message), { code });

test("database internals never reach users", () => {
  expect(
    userErrorMessage(
      coded('duplicate key value violates unique constraint "x"', "23505"),
      "Try again."
    )
  ).toBe("This already exists.");
  expect(
    userErrorMessage(
      coded('relation "clinzo.foo" does not exist', "42P01"),
      "Try again."
    )
  ).toBe("Try again.");
  // Plain object errors from Supabase are handled like Error instances.
  expect(
    userErrorMessage(
      { message: 'null value in column "name"', code: "23502" },
      "Could not save."
    )
  ).toBe("Could not save.");
  expect(
    userErrorMessage(
      new Error("Edge Function returned a non-2xx status code"),
      "Payment failed."
    )
  ).toBe("Payment failed.");
});

test("messages written for users pass through", () => {
  expect(
    userErrorMessage(coded("Set a consultation fee first", "22023"), "x")
  ).toBe("Set a consultation fee first");
  expect(userErrorMessage(coded("Slot is full", "P0001"), "x")).toBe(
    "Slot is full"
  );
  // Safe app/auth copy thrown without a code.
  expect(
    userErrorMessage(
      new Error("Could not sign in. Check your details and try again."),
      "x"
    )
  ).toBe("Could not sign in. Check your details and try again.");
});

test("connectivity, timeouts and sessions get specific copy", () => {
  expect(
    userErrorMessage(new TypeError("Network request failed"), "x")
  ).toMatch(/connection/);
  expect(userErrorMessage(coded("Request timed out", "TIMEOUT"), "x")).toMatch(
    /longer than usual/
  );
  expect(userErrorMessage(coded("JWT expired", "PGRST301"), "x")).toBe(
    "Your session expired. Sign in again."
  );
  expect(userErrorMessage(undefined, "Fallback")).toBe("Fallback");
});

test("classification drives reporting and retries", () => {
  expect(errorCode({ code: "" })).toBeUndefined();
  expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  expect(isExpectedError(coded("Pick a day", "22023"))).toBe(true);
  expect(isExpectedError(coded("boom", "XX000"))).toBe(false);
  // Transient failures retry once; user outcomes never retry.
  expect(shouldRetryRequest(0, new TypeError("Network request failed"))).toBe(
    true
  );
  expect(shouldRetryRequest(1, new TypeError("Network request failed"))).toBe(
    false
  );
  expect(shouldRetryRequest(0, coded("Slot is full", "P0001"))).toBe(false);
  expect(shouldRetryRequest(0, coded("boom", "XX000"))).toBe(true);
});
