# Clinzo / Startup Monorepo Handoff

Prepared 8 November 2026 from the current checkout. Treat this as an orientation and migration plan, not proof that every modified file is finished or deployed. Confirm all volatile facts against the live repository and Supabase before acting.

## What this project is

This is a pnpm/Turborepo healthcare platform monorepo. It contains Patient, Doctor and Driver mobile apps (Expo/React Native), a Facility Portal (Next.js), Company Admin (Next.js), and shared contracts, data access, database models, design tokens, and mobile/web UI packages. The product supports discovery, appointments, consultations, clinic operations, facility verification, payments, notifications, and emergency-driver workflows.

The root [ARCHITECTURE.md](ARCHITECTURE.md), [AGENTS.md](AGENTS.md), [packages/ARCHITECTURE.md](packages/ARCHITECTURE.md), each app's `ARCHITECTURE.md`, and applicable nested `AGENTS.md` files define ownership and working rules. Routes/composition belong in app `src/app`; domain UI/state belongs in `src/features`; reusable native/web UI belongs in `packages/mobile-ui` and `packages/web-ui`; portable schemas in `packages/contracts`; backend operations in `packages/data-access`; Drizzle schema in `packages/database`; Supabase SQL migrations in `supabase/migrations`.

## How much is done

The repository has substantial implementations across all five apps and shared packages; it is not a scaffold. Recent architecture and backend work includes multi-app clinic booking/queue projections, schedule conflict previews and replacement, rescheduling requests, recovery/payment holds, facility reception checkout/transactions, online-join access controls, driver evidence immutability, notification flows, map/location features, and shared UI. Read the owning app feature files and current migrations before assuming an item is complete.

There are 156 local migration files in this checkout. The backend README documents several recent migrations as applied and rollback-tested on the **test** Supabase project only. SQL rollback tests and static/mobile/web tests provide useful evidence but do not prove production deployment, real payment/video/push provider operation, browser acceptance, device interaction, or multi-connection behavior. Existing docs explicitly leave some of these open. Do not turn “implemented” or “test passed” into “production ready.”

The present working tree is exceptionally dirty: many tracked files are modified, some files are deleted, and many files are untracked. This handoff itself is new. Establish which changes belong to the user before editing, staging, reverting, or cleaning anything. Do not reset or broadly format the tree. Check `git status --short`, `git diff`, and the recent commit history first.

## Supabase environments and migration to the original project

The backend guide identifies `enjafragbcrrgaclwopd` as **test**. It says the local linked marker and Patient, Doctor, Driver, and Facility Portal environment URLs point there. The repository's `supabase/config.toml` has `project_id = "clinzo"`; that is a local namespace and is **not** the hosted ref. Another older project ref, `ilbnouxjyurkmsviwbfd`, appears in historical handoff material. Do not guess which is the “original” production target. Confirm its exact ref with the owner through an approved secret manager/dashboard and verify the authenticated CLI account before any write.

The root scripts `db:check` and `db:migrate` run `supabase db push --linked --dry-run --skip-vault` and `supabase db push --linked`, respectively. The latter changes the database selected by the local link. Never run it until the intended target is confirmed. Do not print, copy, commit, or paste API keys, database passwords, access tokens, `.env.local` files, or fixture credentials into this document or agent prompts.

Safe promotion checklist for the original/production project:

1. Finish code review, feature acceptance, rollback tests, and security review on test. Save a release commit/tag and a reviewed list of exactly which migrations are intended for production. Do not promote incomplete or unrelated working-tree edits.
2. Securely back up the intended production database and record its current schema/migration history. Confirm recovery/restore access. Decide separately whether any data migration is needed; do not copy test users, fixture records, credentials, or test bookings to production.
3. Have the operator authenticate the Supabase CLI and explicitly confirm the production project ref from the dashboard. Check current CLI/link state and remote migration history. Compare the remote applied versions with local files; investigate gaps, divergent history, and any migration already applied before pushing.
4. Link the CLI to the confirmed production ref only through the normal Supabase CLI workflow. Recheck `supabase projects list`, `supabase migration list --linked`, and `pnpm db:check`; inspect every proposed migration and target before applying anything. The dry-run is a review aid, not approval or a backup.
5. Apply reviewed SQL migrations using the approved production change window and monitoring plan. Apply Edge Function code/secrets, Auth redirect/provider configuration, Storage policies, and app environment URLs/keys as separate reviewed deployment steps; a database push does not do those tasks. Keep secrets in approved secret storage.
6. Run production-safe smoke checks with synthetic/minimal records and verify app health, RLS/role access, booking/queue/scheduling, payment webhook idempotency without real charges unless explicitly planned, and notification/video provider behavior. Monitor errors and have a tested rollback/forward-fix plan. Do not test destructive actions on live patient or facility records.
7. After acceptance, separately update production app hosting/EAS environment variables and deploy the apps/functions. Validate production URLs, Auth callbacks, provider configuration, and mobile builds. Record migration IDs, release commit, checks, date, and remaining gaps in `supabase/README.md`.

No production project creation, production migration, production data copy, or complete production readiness is established by this checkout's documentation. If the user's “original thing” means a pre-existing development project rather than production, use the same target-confirmation process and first assess its data/history; do not treat it as disposable.

## Getting around the repo

- Root `package.json`: workspace commands. `pnpm dev:patient`, `dev:doctor`, `dev:driver`, `dev:facility-portal`, `dev:company-admin`; `pnpm typecheck`; `pnpm test`; `pnpm db:check`/`db:migrate` (linked target warning above).
- `apps/*/ARCHITECTURE.md`, `FEATURE_STRUCTURE.md`, and README: app capabilities and boundaries.
- `supabase/README.md`, `supabase/migrations`, `supabase/tests/README.md`, `supabase/tests/smoke`: backend deployment notes, versioned SQL, and smoke/rollback guidance.
- `packages/*/README.md` and `packages/ARCHITECTURE.md`: reusable package APIs and ownership.
- `PROJECT_CONTEXT.md` and `STARTUP_CODEX_HANDOFF.md`: historical context. They may be stale; reconcile claims with current code and deployment state.
- `.env.example` files document variable names. `.env.local` is sensitive and ignored; inspect locally without disclosing values.

## Pending activation steps (not needed for development)

The error-handling work (13 November 2026) runs fully without these steps; see the error-handling section of [ARCHITECTURE.md](ARCHITECTURE.md). Complete them before testers or real users rely on the apps. Each step is outward-facing, so confirm with the owner first.

1. **Error monitoring (optional).** Set `EXPO_PUBLIC_POSTHOG_KEY` for the three mobile apps and `NEXT_PUBLIC_POSTHOG_KEY` for Facility Portal and Company Admin, both locally and in the matching EAS and hosting environments. Optionally set `*_POSTHOG_HOST`; the default is `https://us.i.posthog.com`. Use `https://eu.i.posthog.com` if EU data residency matters. Without a key nothing is initialised and nothing leaves the device or browser. With a key, only scrubbed exception events are sent: no user identification, screens or page views, replay or geolocation. This is a healthcare app, so confirm the region and that the agreement with PostHog covers error data first.
2. **Redeploy Edge Functions.** Deploy `process-payment`, `razorpay-webhook`, `payment-reconcile`, `send-notification`, `resolve-map-address`, `search-map-places` and `ambulance-hospitals` to the confirmed **test** project. This turns on structured failure logs and stops `ambulance-hospitals` returning raw provider errors, which could include the Google server key. Until then, the deployed functions keep their previous behavior.
3. **Device and browser checks.** On a phone with the current dev build, turn on airplane mode: the offline banner should appear, actions should pause, and they should resume when you reconnect. Force a render error to see the recovery screen. On the web apps, check `error.tsx`, `global-error.tsx` and the reference code. Typechecks and unit tests do not cover these.
4. **Schedule update migration (not applied).** Apply `supabase/migrations/20261113103000_schedule_update_smoothness.sql` to the confirmed test project (`pnpm db:check`, then `pnpm db:migrate`). Then run `supabase/tests/smoke/schedule-update-smoothness.cli-smoke.sql` in its SQL editor; it rolls back. Until it is applied, the apps fall back to the previous publish path and show no busy-time hints.

## Status update (21 November 2026): scheduling, walk-ins, shift rotations, push

Everything below was checked against the linked **test** project `enjafragbcrrgaclwopd` on 21 November 2026. Feature detail is in `apps/doctor-mobile/ARCHITECTURE.md`, `apps/facility-portal/ARCHITECTURE.md` and `apps/patient-mobile/ARCHITECTURE.md`.

### Push notifications do not reach phones yet (open, not caused by recent work)

In-app notifications work. Pushes to phones have **never been delivered on this project, for any notification type**. Findings, read-only:

- Notifications are created: 18 `clinzo.notification_intent` rows in the 30 days to 20 November.
- `clinzo.notification_endpoint` is empty: no phone has ever registered a push token.
- `clinzo.notification_delivery` is empty: nothing has ever been sent.
- Nothing calls the sender. The only `cron.job` is `refresh-automatic-doctor-schedules`, no database code calls `send-notification`, and no GitHub workflow does.
- The sender itself is fine. `send-notification` version 22 was deployed on 21 November 2026 (08:12 UTC); the downloaded live code matches `supabase/functions/send-notification/index.ts`, with `verify_jwt = false` as in `supabase/config.toml`.

To make pushes work:

1. **Schedule the sender.** Call `send-notification` every minute with the project's secret key. The function uses `withSupabase({ auth: "secret" })`, so the request needs `Authorization: Bearer <secret key>`. Either:
   - Dashboard: Integrations → Cron → new job, HTTP POST to `https://enjafragbcrrgaclwopd.supabase.co/functions/v1/send-notification`, schedule `* * * * *`, with that header; or
   - Migration: `pg_cron` + `pg_net` reading the key from Supabase Vault. The owner stores the key in Vault first; never put it in the repo, docs or chat.

   Once it runs, it sends everything still pending (unexpired intents, 30-day expiry), so expect a burst of older notifications.

2. **Register a phone.** Sign in to the doctor (or patient) app on a **real device** running a **development or store build** and allow notifications. `register()` in `features/notifications/services/deviceNotifications.ts` skips simulators and needs the EAS `projectId` (doctor app: `app.config.js`). Expo Go cannot receive remote pushes on recent Android versions. Confirm a row appears in `notification_endpoint`.
3. **Check end to end.** Approve or decline a test shift rotation in the Facility Portal for a doctor signed in on that phone. Expect a push within a minute; tapping it opens Manage Schedule on that service. Then check `notification_delivery` for `sent`/`delivered` rows and their receipts.

### Applied to the test project in this period

| Migration                                             | What it does                                                                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261120100000_clinic_open_times_and_time_board.sql` | Patients see every open in-person time while app slots remain; adds `list_practice_clinic_time_board` (Booked / app-booking-closed labels).                                                                         |
| `20261120110000_retire_appointment_grace_periods.sql` | Grace periods retired: late check-ins join the queue at arrival time with no hold; online attendance deadline is the booked end.                                                                                    |
| `20261120120000_walk_in_next_free_time.sql`           | `prepare_portal_next_walk_in_booking`: reception walk-ins (today only) get the next free time in order, skipping app-booked times.                                                                                  |
| `20261121100000_shift_rotations.sql`                  | `clinzo.shift_plan`: named shifts up to 28 h, 1-8 week rotations, date changes; one session per shift (overnight and 24-26 h); per-shift limits; facility approval for hospital doctors; nightly job extends plans. |
| `20261121110000_shift_plan_notifications.sql`         | Doctor is notified when a rotation is approved, declined, or published for them by facility staff (`shift.plan_*`).                                                                                                 |

The shift and notification migrations were first run together with their smoke tests (`supabase/tests/smoke/shift-rotations.cli-smoke.sql`, `shift-plan-notifications.cli-smoke.sql`) inside a transaction that rolled back, and only applied after they passed. `walk-in-next-free-time.cli-smoke.sql` and the updated `clinic-channel-capacity.cli-smoke.sql` exist but have not been run.

### Do not push the stray Drizzle migration

`supabase/migrations/20261120114706_dark_golden_guardian.sql` (and the `meta/_journal.json` / `meta/20261120114706_snapshot.json` changes) came from a Drizzle `db:generate` run. It re-creates about 30 tables that already exist (for example `doctor_schedule_preferences` and the payment tables), so `pnpm db:migrate` would fail on it or apply unreviewed schema changes. It is still pending on the test project. Remove or regenerate it properly before the next `pnpm db:migrate`. Don't run `pnpm db:generate` casually; it is the Drizzle command that produced this file.

The migrations above were applied while leaving it out: copy `supabase/config.toml`, `supabase/.temp` and the migrations (minus the stray file) into a temporary folder, then run `supabase db push --linked --dry-run --workdir <folder>` followed by the real push.

### Working with the test database safely

- **Read-only queries without a password:** `pnpm dlx supabase@latest db query --remote --read-only "<sql>"` uses the existing CLI login. The read-only role cannot call internal `clinzo.*` functions; inline their logic instead.
- **Live function definitions:** query `pg_get_functiondef(...)` read-only. Many schedule and booking functions exist only as chains of text patches across migrations, so read the live version before patching. Stored bodies can use CRLF line endings, so make patch markers single-line.
- **Test before applying:** wrap the migration and its smoke test in `BEGIN; ... ROLLBACK;` and run it with `db query --remote --yes -f <file>`; then confirm nothing persisted before the real push.
- `psql`/`pg_dump` are installed (`/opt/homebrew/opt/libpq/bin`) but need the database password; `supabase db dump` needs Docker, which is not installed.

### Not yet verified

- **Device checks** for: Manage Schedule (multi-select services, weekly or shift rotation per service, Approved / Pending request footer), the shift rotation editor, the patient payment-failed retry/cancel dialog, the patient Booked / app-booking-closed labels, and reception's next walk-in time.
- **Push delivery end to end** (blocked by the steps above).
- **Clinic grace leftovers:** patients held for late review before 20 November still use the staff "admit" path; no new holds are created.
- **Known test failures, unrelated to this work:** doctor-mobile `feature-structure.test.cjs` (`RecoveryIntent` should move to feature types); patient-mobile 17 `map-picker` tests (missing `../hooks/useMapPicker`); patient-mobile typecheck error in `features/ambulance/hooks/useAmbulanceBooking.ts:396`.
- **`pnpm spacing:check`** points at `scripts/declaration-spacing.mjs`, which is missing because `.gitignore` hides root `scripts/` (see Repository hygiene below).

## Next to implement and verify (as of 14 November 2026)

The owner asked that tests and checks run only with their approval. The work below is written but **not yet typechecked, tested or formatted**.

**Unverified local changes**

- Doctor dashboard follows queue operations: `features/home/utils/dayBoard.ts`, Today/Waiting/With you, serving order, reserved queue numbers.
- Facility Portal multi-day appointment views are grouped by clinic date, using the shared `DataTable` `groupBy` prop and `#n` tokens via `appointmentQueueNumber`.
- Patient booking cards: optional actions moved into the ⋮ menu; a doctor's rescheduling request stays on the card.
- Live calls in Doctor and Patient switch cameras with LiveKit `restartTrack`, and only the front camera is mirrored.
- Prescription Share and Download produce real PDFs. This adds `expo-print`, `expo-sharing` and the `expo-sharing` config plugin to patient-mobile (`features/prescriptions/services/prescriptionPdf.ts`).
- Ending a video call ends it for both people through a LiveKit `consultation-control` data message. A silent departure shows "Reconnecting…" or "left the call" in the call header and on the video, and becomes "connection lost" after 60 seconds (`utils/callControl.ts` in both apps).
- `ConsultationCall` gained a `notice` prop and no longer shows the garbled "Connectingâ€¦" and "Type a messageâ€¦" text.

**Run with approval**

1. `pnpm typecheck`, or per workspace: doctor-mobile, patient-mobile, facility-portal, web-ui, mobile-ui and data-access.
2. Tests for contracts, data-access, mobile-ui, web-ui, doctor-mobile, patient-mobile and facility-portal. Existing failures at the start of this work: patient map-picker (17), Doctor `RecoveryIntent` structure (1), Driver map-picker (2), the `design-tokens` background token, and the web-ui `chart.tsx`/`cmdk` typecheck errors.
3. Prettier and `pnpm spacing:check` on the changed files; `DataTable` needs re-indenting. Then Facility Portal `check-architecture` and lint.

**Builds and device checks**

- Make a **new Patient EAS dev build**: `expo-print` and `expo-sharing` are native modules. The current build cannot share or save PDFs.
- On real phones, check:
  - camera switching (front/back, no mirrored back camera);
  - ending a call from either side;
  - the reconnect notice and the 60-second loss;
  - PDF share (WhatsApp/email receive a `.pdf`) and save (Android folder picker, iOS "Save to Files");
  - the Doctor dashboard counts against the reception queue;
  - Facility Portal date groups in "All dates".

**Facility approval (Phase A): written, not applied or verified**

- Rule: a doctor's own clinic (owner or administrator member) publishes directly. Hospitals and clinics run by others approve the doctor's schedule, time-off and recovery-policy changes. Facility owners, organization admins and facility admins approve.
- Migrations `20261114095000_schedule_approval_rules.sql`, `20261114096000_schedule_preview_approval_guard.sql` and `20261114100000_schedule_change_requests.sql` (`20261113103000` is already applied on test and is not edited). Apply them in order.
- Doctor app: Submit for approval, `ScheduleRequestNotice`, time-off and policy requests. Facility Portal: `ScheduleChangeRequests` on Doctor Schedules and the dashboard. `send-notification`: `schedule.request_*` push copy (needs a redeploy).
- Single-doctor clinics no longer appear in the doctor join list.
- Rollback smoke suites, written but not yet run: `supabase/tests/smoke/schedule-change-requests.cli-smoke.sql` and `supabase/tests/smoke/facility-team-roles.cli-smoke.sql`.

**Roles and Team (Phase B): written, not applied or verified**

- Migration `20261114120000_facility_team_roles.sql`: invitation links, role ranks, receptionist doctor scopes, "my roles", member updates. Receptionists can collect cash for their doctors; a refund guard keeps refund decisions with owners, admins and the doctor.
- Facility Portal: `/team` and `/invite/[token]` (`features/team`), a role-aware sidebar, `requirePortalArea` on admin-only pages, and a `?next=` return path on login and sign-up.
- Known limits:
  - the doctor picker lists every doctor on the user's roster, and the database rejects doctors from another facility;
  - Walk-in "can collect" now allows every practice manager, receptionists included (`get_portal_walk_in_payment_policy` in the same migration); payout visibility keeps the admin-only `can_manage_appointment_practice_money`;
  - invitations by email are a follow-up.
- Smoke suite `supabase/tests/smoke/facility-team-roles.cli-smoke.sql` covers invite, accept, rank checks, scopes and desk collection. It was written without a database run.

**Online and clinic scheduling (decided 14 November 2026)**

The decision was made after reviewing Epic templates, HHS and AAFP hybrid-care guidance, Zocdoc and Indian platforms, and published studies. The studies found mixed-modality days add about 6% EHR work (JAMA Netw Open 2024) and in-person lateness drives waiting.

- **Separate blocks stay the default.** Online and clinic hours never overlap, at the same practice or across practices. This is current behaviour: preview conflicts plus `doctor_sessions_do_not_overlap`.
- **Batching hint (done locally).** `scheduleBatchingHints` in contracts powers a "Tip" in the Doctor and portal schedule editors. It shows for online hours placed between two clinic blocks on a day, and for online blocks under 60 minutes. It is advisory only. No device or browser check yet.
- **Next: optional either-mode blocks within one practice.** Not started; needs a migration.
  - One set of windows where each booking chooses online or clinic. A booked window is gone for both modes, matching Epic "unblocked" time.
  - It needs a per-block mode setting on the rule, a session that can serve both modes, `visit_mode` taken from the booking rather than the session, and both slot lists reading the same windows.
  - No cross-service claim table is needed.
  - Walk-ins keep using the queue.
  - Overlap across practices stays blocked.

**Follow-up features**

1. **Server-generated prescription PDF.** An Edge Function builds the document from the authoritative signed record into a private Storage bucket and returns a signed URL. It should be shared by Patient, Doctor and Facility Portal. Needs a migration (bucket and policies) and a function deploy.
2. **Patient identity on the prescription.** The clinical record projection has no patient name or age, and the account holder may differ from the patient (family bookings). Add them to the authorized record projection, then to the PDF.
3. **Server-enforced call end.** Delete the LiveKit room server-side and store a call-ended marker so no new join tokens are issued after a deliberate end. Today the patient may rejoin while the visit is open (intended for now).
4. **Schedule publisher consolidation.** Recreate the text-patched schedule RPCs in one readable migration, using `pg_get_functiondef` output from the test project.
5. **Repository hygiene.**
   - Fix `.gitignore`: root `scripts/` (which hides `declaration-spacing.mjs`) and `plans/` are ignored, and the rule isn't anchored to the root.
   - Move the duplicated location route files (`select-location.tsx`, `address-details.tsx`) into shared or feature owners.
   - Clear the existing test and typecheck failures listed above.

## Suggested next work

1. Inventory the dirty tree with the user; classify changes into intended features, generated/temporary artifacts, and unrelated work. Do not discard anything without establishing ownership.
2. Build a current feature/status matrix by tracing each critical journey end to end: Patient discovery/booking/check-in/records; Doctor onboarding/schedules/appointments/consultations; Driver onboarding/evidence/dispatch/trip; Facility appointments/reception/payments/transactions; Company Admin verification/review. For each, distinguish code, automated tests, test-backend deployment, provider checks, browser/device acceptance, and production deployment.
3. Reconcile migration filenames, local Supabase history, and test remote history; check migration push dry run only while linked to the confirmed test project. Keep schema/types/functions/RLS behavior aligned and use forward migrations for schema changes.
4. Close highest-risk missing acceptance: authenticated cross-app journeys, schedule/queue contention, real-device permission/location/QR/push/video behavior, checkout/webhook behavior in provider test mode, reviewer permissions/concurrency, and browser/mobile accessibility. Do not claim these passed based on typechecking.
5. Only after the feature set and release boundary are agreed, prepare the production promotion with the checklist above. Keep test and production credentials/data isolated.

## Instructions for the receiving coding agent

Work in `C:\startup`. Read this file, root `AGENTS.md` and `ARCHITECTURE.md`, then relevant app/package guidance before edits. Start by inspecting Git status and preserve all existing user work. Confirm which issue or feature the user wants next; this handoff is context, not authorization to deploy, migrate production, copy data, send messages, or perform broad cleanup. For every status claim, cite the code/tests/deployment evidence and label unknowns plainly. Keep changes scoped, preserve public APIs and app behavior, run focused checks, and report unverified device/provider/production behavior accurately.
