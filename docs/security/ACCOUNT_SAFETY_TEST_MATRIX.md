# Account Safety Test Matrix (Manual QA)

Manual QA script for auth/account-boundary behavior. Run against a disposable test
environment (local Docker Supabase stack or a hosted test project), never
production data. Automated coverage for the locale-path-building portion already
exists in `apps/web/tests/auth-links.test.mjs`.

## Test Cases

| # | Scenario | Steps | Expected result |
|---|---|---|---|
| 1 | Owner/staff login | Sign in as a business member | Redirected to `/` (dashboard home); session cookie set |
| 2 | Customer login | Sign in as a customer-only account | Redirected to `/portal`, never the dashboard |
| 3 | Expired/invalid session | Clear/corrupt the session cookie, then load a protected route | Redirected to `/login`, no protected data flashes before redirect |
| 4 | Password reset request | Submit `requestPasswordReset` with a registered email | Generic "check your email" message; no indication of whether email exists either way (current behavior — see APPSEC-08 for the related signup-side nuance) |
| 5 | Password reset completion | Follow the reset link, set a new password | Old password no longer works; new password works; signed out after reset per `updatePassword()` behavior |
| 6 | Password reset link reuse | Use the same reset link twice | Second use should fail (Supabase-managed token; confirm behavior, since this audit found no application-level reuse check beyond what Supabase Auth itself enforces) |
| 7 | Invite link / invite email reuse | Have a teammate invite accepted once, then attempt to "re-accept" by signing up again with the same email after already being a member | `claim_business_invitations()` only inserts if not already a member (`on conflict (business_id, user_id) do nothing`) — confirm no duplicate membership or error |
| 8 | Stale pending invite | Leave an invitation pending for a long period, then have the invited email sign up | Currently succeeds (no expiry — see APPSEC-10); confirm this matches the documented accepted risk, not a surprise |
| 9 | Customer attempts owner/staff routes | While logged in as a customer, directly navigate to `/customers`, `/settings`, `/billing` | Redirected away (`requireMembership()` should redirect a customer-only session back toward `/portal`) |
| 10 | Staff attempts platform admin routes | While logged in as a business member (non-admin), directly navigate to `/admin` | Redirected to `/` |
| 11 | Business owner attempts to demote themselves via `admin_set_super_admin` (if also a platform admin) | Call with their own email and `make_admin: false` | Rejected — self-removal blocked |
| 12 | Account with no business and no customer record | Sign up, do not complete onboarding | Redirected to `/onboarding`; no protected dashboard/portal data reachable in the interim |
| 13 | Sign-out | Sign out while on a protected page | Session cleared, redirected to locale-aware `/login` |
| 14 | Cross-locale session | Switch locale (`/en` ↔ `/ar`) while authenticated | Session remains valid; protected routes still enforce the same guards under either locale prefix |

## Pass/Fail Recording

Record results in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md). Failures
on cases 1, 2, 9, 10, or 11 are P0/P1 (authorization bypass); failures on 6 or 8 are
P2/P3 per the existing findings (APPSEC-08, APPSEC-10).
