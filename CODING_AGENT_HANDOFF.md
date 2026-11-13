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

## Suggested next work

1. Inventory the dirty tree with the user; classify changes into intended features, generated/temporary artifacts, and unrelated work. Do not discard anything without establishing ownership.
2. Build a current feature/status matrix by tracing each critical journey end to end: Patient discovery/booking/check-in/records; Doctor onboarding/schedules/appointments/consultations; Driver onboarding/evidence/dispatch/trip; Facility appointments/reception/payments/transactions; Company Admin verification/review. For each, distinguish code, automated tests, test-backend deployment, provider checks, browser/device acceptance, and production deployment.
3. Reconcile migration filenames, local Supabase history, and test remote history; check migration push dry run only while linked to the confirmed test project. Keep schema/types/functions/RLS behavior aligned and use forward migrations for schema changes.
4. Close highest-risk missing acceptance: authenticated cross-app journeys, schedule/queue contention, real-device permission/location/QR/push/video behavior, checkout/webhook behavior in provider test mode, reviewer permissions/concurrency, and browser/mobile accessibility. Do not claim these passed based on typechecking.
5. Only after the feature set and release boundary are agreed, prepare the production promotion with the checklist above. Keep test and production credentials/data isolated.

## Instructions for the receiving coding agent

Work in `C:\startup`. Read this file, root `AGENTS.md` and `ARCHITECTURE.md`, then relevant app/package guidance before edits. Start by inspecting Git status and preserve all existing user work. Confirm which issue or feature the user wants next; this handoff is context, not authorization to deploy, migrate production, copy data, send messages, or perform broad cleanup. For every status claim, cite the code/tests/deployment evidence and label unknowns plainly. Keep changes scoped, preserve public APIs and app behavior, run focused checks, and report unverified device/provider/production behavior accurately.
