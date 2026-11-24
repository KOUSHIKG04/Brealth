"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@startup/web-ui/components/ui/toast";
import {
  invitableRoles,
  type FacilityRole,
  type FacilityTeamMember,
} from "@startup/contracts";
import {
  inviteFacilityMember,
  loadFacilityTeam,
  revokeFacilityInvitation,
  updateTeamMember,
} from "../server/actions";

type InviteRole = "organization_admin" | "facility_admin" | "receptionist";

/** Team members, pending invitations and the invite / change workflow. */
export function useFacilityTeam({
  facilityId,
  myRole,
}: {
  facilityId: string;
  myRole: FacilityRole;
}) {
  const client = useQueryClient();
  const team = useQuery({
    queryKey: ["facility-team", facilityId],
    queryFn: () => loadFacilityTeam(facilityId),
  });
  const data = team.data && team.data.ok ? team.data : null;
  const [pending, startTransition] = useTransition();
  const roles = invitableRoles(myRole);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(roles.at(-1) ?? "receptionist");
  const [doctorIds, setDoctorIds] = useState<string[]>([]);
  // The link is shown once, right after creating the invitation.
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);

  const refresh = () =>
    client.invalidateQueries({ queryKey: ["facility-team", facilityId] });
  const fail = (message: string) => {
    toast.add({
      title: "Team update failed",
      description: message,
      type: "error",
    });
  };

  const toggleDoctor = (id: string) =>
    setDoctorIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );

  const invite = () =>
    startTransition(async () => {
      const result = await inviteFacilityMember({
        facilityId,
        role,
        email,
        doctorPracticeIds: role === "receptionist" ? doctorIds : [],
      });
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setLink({
        url: `${window.location.origin}/invite/${result.token}`,
        email: email.trim().toLowerCase(),
      });
      setEmail("");
      setDoctorIds([]);
      await refresh();
    });

  const revoke = (invitationId: string) =>
    startTransition(async () => {
      const result = await revokeFacilityInvitation(invitationId);
      if (!result.ok) fail(result.error);
      await refresh();
    });

  const change = (
    member: FacilityTeamMember,
    changes: {
      role?: "facility_admin" | "receptionist";
      active?: boolean;
      doctorPracticeIds?: string[];
    }
  ) =>
    startTransition(async () => {
      const result = await updateTeamMember({
        memberId: member.id,
        ...changes,
      });
      if (!result.ok) fail(result.error);
      else
        toast.add({
          title: "Member updated",
          description: member.email ?? member.name ?? "Team member",
          type: "success",
        });
      await refresh();
    });

  return {
    team,
    data,
    error: team.data && !team.data.ok ? team.data.error : null,
    pending,
    roles,
    email,
    setEmail,
    role,
    setRole,
    doctorIds,
    toggleDoctor,
    link,
    dismissLink: () => setLink(null),
    invite,
    revoke,
    change,
  };
}
