// Only invitation links may be used as a return path after sign-in, so a
// crafted ?next= cannot redirect users to another site or page.
const invitePath = /^\/invite\/[A-Za-z0-9]{16,128}$/;

export function safeReturnPath(value: unknown): string | undefined {
  return typeof value === "string" && invitePath.test(value)
    ? value
    : undefined;
}
