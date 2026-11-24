import { z } from "zod";
import { uuidSchema } from "./validation";

/** Facility portal roles, highest first. Dispatcher (ambulance) is separate. */
export const facilityRoleSchema = z.enum([
  "owner",
  "organization_admin",
  "facility_admin",
  "receptionist",
]);

export type FacilityRole = z.infer<typeof facilityRoleSchema>;

export const facilityRoleRank: Record<FacilityRole, number> = {
  owner: 4,
  organization_admin: 3,
  facility_admin: 2,
  receptionist: 1,
};

export const facilityRoleLabels: Record<FacilityRole, string> = {
  owner: "Owner",
  organization_admin: "Organization admin",
  facility_admin: "Facility admin",
  receptionist: "Receptionist",
};

export const myFacilityRoleSchema = z.object({
  facility_id: uuidSchema,
  facility_name: z.string(),
  facility_kind: z.enum(["hospital", "clinic"]),
  role: facilityRoleSchema,
  /** Doctors (practice ids) a receptionist works with. */
  doctor_practice_ids: z.array(uuidSchema),
});

export type MyFacilityRole = z.infer<typeof myFacilityRoleSchema>;

export const facilityTeamMemberSchema = z.object({
  id: uuidSchema,
  role: facilityRoleSchema,
  active: z.boolean(),
  facility_id: uuidSchema.nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  is_self: z.boolean(),
  doctor_practice_ids: z.array(uuidSchema),
});

export const facilityTeamInvitationSchema = z.object({
  id: uuidSchema,
  role: facilityRoleSchema.exclude(["owner"]),
  email: z.string(),
  expires_at: z.string(),
  doctor_practice_ids: z.array(uuidSchema),
});

export const facilityTeamSchema = z.object({
  my_rank: z.number().int(),
  members: z.array(facilityTeamMemberSchema),
  invitations: z.array(facilityTeamInvitationSchema),
});

export type FacilityTeam = z.infer<typeof facilityTeamSchema>;

export type FacilityTeamMember = z.infer<typeof facilityTeamMemberSchema>;

export const createInvitationSchema = z
  .object({
    facilityId: uuidSchema,
    role: facilityRoleSchema.exclude(["owner"]),
    email: z.email().transform((value) => value.trim().toLowerCase()),
    doctorPracticeIds: z.array(uuidSchema).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.role !== "receptionist" || value.doctorPracticeIds.length > 0,
    {
      message: "Choose the doctors this receptionist will work with.",
      path: ["doctorPracticeIds"],
    }
  );

export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

export const memberInvitationPreviewSchema = z.object({
  status: z.enum(["pending", "wrong_email", "invalid"]),
  role: facilityRoleSchema.optional(),
  organization_name: z.string().nullable().optional(),
  facility_name: z.string().nullable().optional(),
  invited_email: z.string().optional(),
  expires_at: z.string().optional(),
});

export type MemberInvitationPreview = z.infer<
  typeof memberInvitationPreviewSchema
>;

/**
 * Portal areas and the minimum role rank that sees them. The database enforces
 * every permission; this only hides what a role cannot use.
 */
export const portalAreaMinimumRank = {
  dashboard: 1,
  appointments: 1,
  doctorSchedules: 2,
  doctorManagement: 2,
  bedManagement: 2,
  transactions: 2,
  notifications: 2,
  team: 2,
  verification: 3,
} as const;

export type PortalArea = keyof typeof portalAreaMinimumRank;

/** Highest role the user holds across their facilities. */
export function highestFacilityRole(
  roles: readonly Pick<MyFacilityRole, "role">[]
): FacilityRole | null {
  return roles.reduce<FacilityRole | null>(
    (best, item) =>
      !best || facilityRoleRank[item.role] > facilityRoleRank[best]
        ? item.role
        : best,
    null
  );
}

export function canUsePortalArea(role: FacilityRole | null, area: PortalArea) {
  return (
    Boolean(role) && facilityRoleRank[role!] >= portalAreaMinimumRank[area]
  );
}

/** Roles a member of `role` may invite (strictly below their own rank). */
export function invitableRoles(role: FacilityRole | null) {
  if (!role) return [];
  return (
    ["organization_admin", "facility_admin", "receptionist"] as const
  ).filter((candidate) => facilityRoleRank[candidate] < facilityRoleRank[role]);
}
