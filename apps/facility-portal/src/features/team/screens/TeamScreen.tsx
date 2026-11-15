"use client";

import { useState } from "react";
import {
  facilityRoleLabels,
  facilityRoleRank,
  formatDisplayDate,
  type FacilityRole,
  type FacilityTeamMember,
} from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import { Input } from "@startup/web-ui/components/ui/input";
import { useFacilityTeam } from "../hooks/useFacilityTeam";
import { teamCardClass } from "../utils/teamConstants";

type TeamFacility = {
  facilityId: string;
  facilityName: string;
  role: FacilityRole;
};

function DoctorChecklist({
  doctors,
  selected,
  onToggle,
  disabled,
}: {
  doctors: { practice_id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  if (!doctors.length)
    return (
      <p className="text-muted-foreground text-sm">
        Add doctors to this facility before inviting a receptionist.
      </p>
    );
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Doctors they work with</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {doctors.map((doctor) => (
          <label
            key={doctor.practice_id}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              className="size-4"
              checked={selected.includes(doctor.practice_id)}
              disabled={disabled}
              onChange={() => onToggle(doctor.practice_id)}
            />
            {doctor.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FacilityTeam({ facility }: { facility: TeamFacility }) {
  const {
    data,
    error,
    pending,
    roles,
    email,
    setEmail,
    role,
    setRole,
    doctorIds,
    toggleDoctor,
    link,
    dismissLink,
    invite,
    revoke,
    change,
  } = useFacilityTeam({
    facilityId: facility.facilityId,
    myRole: facility.role,
  });
  const [editing, setEditing] = useState<{
    memberId: string;
    ids: string[];
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const doctors = data?.doctors ?? [];
  const doctorName = (id: string) =>
    doctors.find((doctor) => doctor.practice_id === id)?.name ?? "Doctor";
  const myRank = facilityRoleRank[facility.role];
  const canManage = (member: FacilityTeamMember) =>
    !member.is_self && myRank > facilityRoleRank[member.role];

  if (error)
    return (
      <p role="alert" className="text-destructive text-sm">
        {error}
      </p>
    );
  if (!data)
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading team…
      </p>
    );

  return (
    <div className="space-y-6">
      <section className={teamCardClass} aria-labelledby="invite-heading">
        <div className="space-y-1">
          <h2 id="invite-heading" className="text-base font-semibold">
            Invite a team member
          </h2>
          <p className="text-muted-foreground text-sm">
            You get a link to share with them. It works once, only for that
            email address, for 7 days.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            invite();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Email
              <Input
                type="email"
                required
                value={email}
                autoComplete="off"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Role
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
              >
                {roles.map((option) => (
                  <option key={option} value={option}>
                    {facilityRoleLabels[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {role === "receptionist" ? (
            <DoctorChecklist
              doctors={doctors}
              selected={doctorIds}
              onToggle={toggleDoctor}
              disabled={pending}
            />
          ) : null}
          <Button
            type="submit"
            disabled={
              pending ||
              !email.includes("@") ||
              (role === "receptionist" && doctorIds.length === 0)
            }
          >
            Create invite link
          </Button>
        </form>
        {link ? (
          <div
            role="status"
            className="bg-muted/60 space-y-2 rounded-lg p-3 text-sm"
          >
            <p>
              Share this link with <strong>{link.email}</strong>. It is shown
              only now.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input readOnly value={link.url} className="min-w-0 flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link.url)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCopied(false);
                  dismissLink();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={teamCardClass} aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-base font-semibold">
          Members
        </h2>
        <ul className="divide-y">
          {data.team.members.map((member) => (
            <li key={member.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {member.name ?? member.email ?? "Team member"}
                    {member.is_self ? " (you)" : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {member.email} · {facilityRoleLabels[member.role]}
                    {member.facility_id === null ? " · all facilities" : ""}
                    {member.active ? "" : " · deactivated"}
                  </p>
                  {member.role === "receptionist" ? (
                    <p className="text-muted-foreground text-xs">
                      Doctors:{" "}
                      {member.doctor_practice_ids.map(doctorName).join(", ") ||
                        "none"}
                    </p>
                  ) : null}
                </div>
                {canManage(member) ? (
                  <div className="flex flex-wrap gap-2">
                    {member.role === "receptionist" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            setEditing({
                              memberId: member.id,
                              ids: member.doctor_practice_ids,
                            })
                          }
                        >
                          Edit doctors
                        </Button>
                        {myRank > facilityRoleRank.facility_admin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              change(member, { role: "facility_admin" })
                            }
                          >
                            Make facility admin
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {member.role === "facility_admin" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          setEditing({ memberId: member.id, ids: [] })
                        }
                      >
                        Make receptionist
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={member.active ? "outline" : "default"}
                      disabled={pending}
                      onClick={() => change(member, { active: !member.active })}
                    >
                      {member.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                ) : null}
              </div>
              {editing?.memberId === member.id ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <DoctorChecklist
                    doctors={doctors}
                    selected={editing.ids}
                    disabled={pending}
                    onToggle={(id) =>
                      setEditing({
                        memberId: member.id,
                        ids: editing.ids.includes(id)
                          ? editing.ids.filter((item) => item !== id)
                          : [...editing.ids, id],
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={pending || editing.ids.length === 0}
                      onClick={() => {
                        change(member, {
                          role: "receptionist",
                          doctorPracticeIds: editing.ids,
                        });
                        setEditing(null);
                      }}
                    >
                      Save doctors
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {data.team.invitations.length ? (
        <section
          className={teamCardClass}
          aria-labelledby="invitations-heading"
        >
          <h2 id="invitations-heading" className="text-base font-semibold">
            Pending invitations
          </h2>
          <ul className="divide-y">
            {data.team.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <span>
                  {invitation.email} · {facilityRoleLabels[invitation.role]} ·
                  expires {formatDisplayDate(invitation.expires_at)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => revoke(invitation.id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Team management for the facilities the user administers. */
export function TeamScreen({ facilities }: { facilities: TeamFacility[] }) {
  const [facilityId, setFacilityId] = useState(facilities[0]?.facilityId);
  // Fall back to the first facility if the selected one is no longer listed.
  const facility =
    facilities.find((item) => item.facilityId === facilityId) ?? facilities[0];
  return (
    <div className="flex min-w-0 flex-col gap-6 pb-12">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Team
        </h1>
        <p className="text-muted-foreground max-w-xl text-sm leading-6">
          Invite administrators and receptionists. Receptionists see only the
          appointments of the doctors you assign them.
        </p>
      </header>
      {facilities.length > 1 ? (
        <label className="max-w-xs space-y-1.5 text-sm font-medium">
          Facility
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={facility?.facilityId}
            onChange={(event) => setFacilityId(event.target.value)}
          >
            {facilities.map((item) => (
              <option key={item.facilityId} value={item.facilityId}>
                {item.facilityName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {facility ? (
        <FacilityTeam key={facility.facilityId} facility={facility} />
      ) : (
        <p className="text-muted-foreground text-sm">
          You do not administer a facility.
        </p>
      )}
    </div>
  );
}
