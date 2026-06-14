# Revora PWA Readiness

## Current State

- App metadata exists in `src/app/layout.tsx`.
- Manifest exists in `src/app/manifest.ts`.
- Apple web app hints are already present.
- Theme colors are already set.

## What Is Ready

- Responsive shell layout
- Mobile portal navigation
- Signed-in auth flows
- Billing portal handoff via Stripe

## What Is Still Missing

- Service worker and offline caching strategy
- Push notification delivery for installed clients
- Native payment strategy for app stores
- Offline-safe customer portal flows
- Mobile install onboarding guidance

## Notes

- Do not add a service worker until there is a clear caching policy.
- Do not add push notifications until backend delivery support exists.
- For app-store distribution, revisit Stripe web billing versus native in-app payment rules.

