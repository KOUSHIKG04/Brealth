# Doctor mobile

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users and purpose

Doctors manage appointments, look up patients, conduct clinic, online and home visits, write clinical notes and prescriptions, and manage availability and schedules.

## Capabilities and constraints

The app uses the shared Supabase backend through `@startup/data-access`: phone sign-in, practices, schedules with conflict review and approval requests, appointments, the hybrid clinic queue, live online consultations and notifications. No clinical signing service is connected. Deployment and native-device verification status lives in `ARCHITECTURE.md`.

## Brand commitments

Use the same lucide-react-native icon library as patient-mobile. The user explicitly rejected exported Figma icons.

Implement the supplied START-UP Figma doctor frames. Follow the patient-mobile Expo Router structure and reuse the mobile-ui and design-tokens packages. Replace the patient SOS center action with Scan QR. All app-specific code belongs in doctor-mobile.

## Evidence

Figma file JPyiy9pnS8Ywy9SlSyGUqu: Home 746:594; appointments 746:499; notes 760:711; prescription 760:1015 (discovered beside notes); online 760:898; chat 760:916; home visit 767:1119; profile 782:12; schedule 779:10.

## Open decisions

Clinical signing and regulated prescription workflows remain undecided. Do not imply them in UI copy.
