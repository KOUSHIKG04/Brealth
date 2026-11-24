import { InvitationScreen } from "@/features/team";
import { createClient } from "@/lib/supabase/server";
import { getMemberInvitation } from "@startup/data-access";
import type { MemberInvitationPreview } from "@startup/contracts";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  let preview: MemberInvitationPreview | null = null;
  if (user) {
    try {
      preview = await getMemberInvitation(client, token);
    } catch {
      preview = { status: "invalid" };
    }
  }
  return (
    <InvitationScreen
      token={token}
      preview={preview}
      signedInEmail={user?.email ?? null}
    />
  );
}
