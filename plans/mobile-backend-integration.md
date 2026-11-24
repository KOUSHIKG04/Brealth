# Mobile backend setup

Patient, Doctor and Driver use shared domain contracts and data-access operations.
Each app owns its session client. See the current architecture documents for
implemented workflows and remaining integration boundaries:

- [Patient](../apps/patient-mobile/ARCHITECTURE.md)
- [Doctor](../apps/doctor-mobile/ARCHITECTURE.md)
- [Driver](../apps/driver-mobile/ARCHITECTURE.md)

## Environment and startup

1. Copy each target app's `.env.example` to its ignored `.env.local`.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the intended environment's URL and
   publishable key. Apps participating in the same workflow must use that same
   environment. Do not infer the target from another app's existing local file.
3. Keep database passwords, service-role keys and provider secrets out of Expo
   variables. Leave optional development flags at their example defaults unless
   explicitly setting up their guarded test flow.
4. From the repository root, run `pnpm dev:patient`, `pnpm dev:doctor` or
   `pnpm dev:driver`. Restart Expo after environment changes.

Phone sign-in requires the target environment's SMS configuration. Authentication
does not approve a doctor, driver or facility. Those workflows retain their
server-enforced review gates. Development password login has additional source
and target guards; changing its public flag alone does not enable it everywhere.

## Verification boundaries

Use [the backend guide](../supabase/README.md) for deployment boundaries and
[the SQL test guide](../supabase/tests/README.md) for disposable fixtures.
Published schedules, approved test identities and required provider configuration
must exist before checking bookings or dispatch. Do not infer hosted readiness
from local migrations or a successful sign-in.

Verify sign-in, session restoration and sign-out on a device. Then follow the
[schedule](service-scheduling-testing.md) and
[live-update](realtime-mvp-testing.md) checklists using controlled test accounts.
SMS delivery, payment checkout, calls, push delivery, location and background
behavior require their own configured provider/device checks.
