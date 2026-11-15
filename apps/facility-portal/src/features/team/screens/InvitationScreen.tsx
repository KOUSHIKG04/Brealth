"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  facilityRoleLabels,
  type MemberInvitationPreview,
} from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import { acceptFacilityInvitation } from "../server/actions";

/**
 * Invitation landing page. Signed-out visitors sign in or create an account
 * with the invited email; signed-in invitees review and accept.
 */
export function InvitationScreen({
  token,
  preview,
  signedInEmail,
}: {
  token: string;
  preview: MemberInvitationPreview | null;
  signedInEmail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const next = encodeURIComponent(`/invite/${token}`);
  const place =
    preview?.facility_name ?? preview?.organization_name ?? "a facility";
  return (
    <main className="bg-muted flex min-h-svh items-center justify-center p-6">
      <section className="bg-background w-full max-w-md space-y-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Team invitation</h1>
        {!signedInEmail ? (
          <>
            <p className="text-muted-foreground text-sm">
              You have been invited to join a facility on the portal. Sign in,
              or create an account, with the email address the invitation was
              sent to.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/login?next=${next}`}>Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/register?next=${next}`}>Create account</Link>
              </Button>
            </div>
          </>
        ) : preview?.status === "pending" && preview.role ? (
          <>
            <p className="text-sm">
              Join <strong>{place}</strong> as{" "}
              <strong>{facilityRoleLabels[preview.role]}</strong>.
            </p>
            <p className="text-muted-foreground text-xs">
              Signed in as {signedInEmail}
            </p>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await acceptFacilityInvitation(token);
                  // Success redirects; only failures return here.
                  if (result && !result.ok) setError(result.error);
                })
              }
            >
              Accept invitation
            </Button>
          </>
        ) : preview?.status === "wrong_email" ? (
          <p role="alert" className="text-sm">
            This invitation was sent to {preview.invited_email}. You are signed
            in as {signedInEmail}. Sign out and sign in with the invited email.
          </p>
        ) : (
          <p role="alert" className="text-sm">
            This invitation is invalid or has expired. Ask the facility for a
            new link.
          </p>
        )}
      </section>
    </main>
  );
}
