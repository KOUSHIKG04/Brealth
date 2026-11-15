import { expect, test } from "bun:test";
import {
  decodeConsultationControl,
  encodeConsultationControl,
} from "../src/online-consultation";

test("call-ended messages round-trip for both roles", () => {
  for (const by of ["doctor", "patient"] as const)
    expect(
      decodeConsultationControl(
        encodeConsultationControl({ type: "call-ended", by })
      )
    ).toEqual({ type: "call-ended", by });
});

test("unrelated or malformed payloads are ignored", () => {
  const bytes = (text: string) =>
    Uint8Array.from(text, (char) => char.charCodeAt(0));
  expect(decodeConsultationControl(bytes("not json"))).toBeNull();
  expect(
    decodeConsultationControl(bytes('{"type":"chat","by":"doctor"}'))
  ).toBeNull();
  expect(
    decodeConsultationControl(
      bytes('{"type":"call-ended","by":"doctor","extra":1}')
    )
  ).toBeNull();
});

test("encoding rejects invalid messages", () => {
  expect(() =>
    encodeConsultationControl({ type: "call-ended", by: "nurse" } as never)
  ).toThrow();
});
