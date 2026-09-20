# Changelog

All notable changes to Revora are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project has no version tags yet, so entries are keyed by the date the work
was merged to `main` (via a `release-*` branch or a pull request) rather than by
a semver number. Once releases are tagged, add the tag to the section heading.

Links point to [Madds59/revora-app](https://github.com/Madds59/revora-app).

## [Unreleased]

_Nothing yet._

## 2026-09-13 — Legal compliance, accessibility and RPC hardening ([#19])

### Added
- Public legal pages, consent capture and customer-portal opt-out ([24f5f70])
- Data Processing Agreement draft and legal operator guide ([b4032be])

### Changed
- Localised the remaining dashboard, admin, onboarding and error-boundary copy ([dddde3f])
- Localised the customer portal ([b5b3f03])

### Fixed
- WCAG contrast, form labels, focus management and error announcements ([b5b3f03])
- Corrections to the privacy documentation ([b4032be])

### Security
- Revoked `anon` EXECUTE on `SECURITY DEFINER` RPCs; added the portal preference policy ([b346ccf])

## 2026-09-12 — Digital Vehicle Inspection (DVI) V1 ([#16])

### Added
- DVI V1 data and security foundation — migration `0037` ([9055075])
- DVI V1 application layer: inspection editor, customer portal view, share links and quote conversion ([db86c1a])
- DVI loading states ([74efdd5])

### Security
- Documented the DVI trust boundary ([74efdd5])
- DVI security harness is now self-seeding and documented ([89c007e])
- APPSEC-20 recorded: a tenant with data cannot be hard-deleted ([2f1a51c])

## 2026-09-06 — Invoicing, appointments and maintenance reminders ([#15])

### Added
- Invoicing, appointment scheduling and maintenance-reminder intelligence ([41dc5a2])

## 2026-08-01 — AppSec-09 Phase 4D: onboarding and admin mutations ([#12], [#13])

### Security
- Hardened admin mutation authorization ([2d18dd6])
- Hardened onboarding authorization ([02ed66b])
- Invitation actions now log stable codes only ([5967cf0])
- Aligned Phase 4D security evidence status ([fc8f03b])

## 2026-07-31 — AppSec-09 Phase 4B/4C: vehicle media and notifications ([#10], [#11])

### Security
- Hardened vehicle media storage authorization ([6a6faba])
- Hardened notification service authorization ([880a7c6])
- Documented that the vehicle-media filename is never used as a Storage key ([97e03ea])
- Recorded Phase 4C notification runtime QA evidence ([e22f7ec])

## 2026-07-30 — AppSec-09 Phases 1–4A: input validation and evidence storage ([#6], [#7], [#8], [#9])

### Security
- Hardened server input validation ([793b81e])
- Date validation rejects impossible calendar dates ([bd89e89])
- Hardened customer portal input validation ([588f9b9])
- Hardened customer, vehicle and business-settings validation ([c9c0e41])
- Hardened evidence storage ownership validation ([58796d6])
- Hardened evidence signed-URL authorization ([4fc9996])
- Signing unbound documents now requires proven ownership ([ab50774])
- Documented Phase 3 QA scope and the dormant signature RPC ([aba3b7c], [7738eda])

## 2026-07-29 — CI validation workflow ([#5])

### Added
- GitHub Actions CI validation workflow ([9af2cae])

## 2026-06-27 — Security and privacy assurance program

### Added
- Revora security and privacy assurance program under `docs/security/` ([a81b8b0])

### Fixed
- Page-level raw error rendering ([79aa027])

## 2026-06-24 — Notifications foundation and Vehicle Intelligence search

### Added
- Notifications foundation (F5) ([addf44a]), hardened in [8989221]
- Vehicle Intelligence search (F6) ([7a121a7])

### Fixed
- Arabic notification action labels ([b314b01])

## 2026-06-23 — Launch Ops foundation and runbooks

### Added
- Launch operations foundation ([762e296])
- Release QA and onboarding runbooks ([4258bd2])

### Changed
- Hardened the migration schema-cache runbook ([fedd19c])
- Migration governance recorded: `0028` skipped, `0029` Launch Ops, F5 moved to `0030` ([f9f6ed0])
- Clarified QA and workflow documentation ([74ec6c0])

### Fixed
- Select trigger labels across the app and in Launch Ops ([5955a8b], [34774b8], [1ca58dc])
- Billing quote units ([1ca58dc])
- Launch Ops feedback list typing ([3262b57])
- Billing summary period derived from `Date.now` for deterministic results ([94930df])

## 2026-06-21 — Post-i18n QA regressions

### Fixed
- QA regressions across portal, dashboard and tools following localisation ([13df544])

## 2026-06-17 — Display labels i18n/RTL and quote redirects

### Changed
- Normalised display-label i18n and RTL formatting ([2f2b0e0])

### Fixed
- Quote redirects, analytics query errors and visible IDs ([f171537])

## 2026-06-16 — Business ratings, password reset and locale fixes

### Added
- Business ratings (F4) ([82c14aa])
- Forgot-password auth flow ([99794a9])

### Changed
- Quotation form display labels ([595e7be])

### Fixed
- Save redirects and analytics query errors ([7f0c74c])
- Locale path stacking and locale switcher path replacement ([b5f24c8], [1f30063])
- Complaint workflow UX and notifications ([6dc15a0])
- Vehicle detail route loading ([5c9977f])

## 2026-06-15 — Membership bundles, retainer calculator, vehicle intelligence and localisation

### Added
- Membership bundles (F3): migration `0026`, generation logic, server actions, dashboard and portal UI ([53ce296], [bee042f], [5f05ce6], [ce346a7])
- Service Retainer Pricing Calculator (F2) ([600c064])
- Vehicle intelligence module ([9658043])
- Roadmap, backlog and Codex execution briefs; production acceptance checklist; super-admin bootstrap docs

### Changed
- Localised dashboard, customer portal, platform admin, quotation builder, shared UI states, form labels, complaint/message tooling and sidebar accessibility labels
- Canonical locale redirects for smoke routes ([95102b6])

### Security
- Hardened the super-admin grant script ([bb8fd58])
- Vehicle intelligence production-readiness hardening ([2394d8e])

## 2026-06-14 — Initial release

### Added
- Initial deployment-ready Revora app: multi-tenant dashboard, customer portal, root admin, Supabase auth/RLS, Stripe billing ([4ab82f5])
- Locale onboarding and access model ([2e78035])

### Security
- Stripe webhook excluded from the auth middleware ([bfdf12b], [6f439ed])
- Middleware matcher broadened to exclude Next internals and static/metadata routes ([7334223])

[Unreleased]: https://github.com/Madds59/revora-app/compare/main...HEAD
[#19]: https://github.com/Madds59/revora-app/pull/19
[#16]: https://github.com/Madds59/revora-app/pull/16
[#15]: https://github.com/Madds59/revora-app/pull/15
[#13]: https://github.com/Madds59/revora-app/pull/13
[#12]: https://github.com/Madds59/revora-app/pull/12
[#11]: https://github.com/Madds59/revora-app/pull/11
[#10]: https://github.com/Madds59/revora-app/pull/10
[#9]: https://github.com/Madds59/revora-app/pull/9
[#8]: https://github.com/Madds59/revora-app/pull/8
[#7]: https://github.com/Madds59/revora-app/pull/7
[#6]: https://github.com/Madds59/revora-app/pull/6
[#5]: https://github.com/Madds59/revora-app/pull/5
[24f5f70]: https://github.com/Madds59/revora-app/commit/24f5f70
[b4032be]: https://github.com/Madds59/revora-app/commit/b4032be
[dddde3f]: https://github.com/Madds59/revora-app/commit/dddde3f
[b5b3f03]: https://github.com/Madds59/revora-app/commit/b5b3f03
[b346ccf]: https://github.com/Madds59/revora-app/commit/b346ccf
[9055075]: https://github.com/Madds59/revora-app/commit/9055075
[db86c1a]: https://github.com/Madds59/revora-app/commit/db86c1a
[74efdd5]: https://github.com/Madds59/revora-app/commit/74efdd5
[89c007e]: https://github.com/Madds59/revora-app/commit/89c007e
[2f1a51c]: https://github.com/Madds59/revora-app/commit/2f1a51c
[41dc5a2]: https://github.com/Madds59/revora-app/commit/41dc5a2
[2d18dd6]: https://github.com/Madds59/revora-app/commit/2d18dd6
[02ed66b]: https://github.com/Madds59/revora-app/commit/02ed66b
[5967cf0]: https://github.com/Madds59/revora-app/commit/5967cf0
[fc8f03b]: https://github.com/Madds59/revora-app/commit/fc8f03b
[6a6faba]: https://github.com/Madds59/revora-app/commit/6a6faba
[880a7c6]: https://github.com/Madds59/revora-app/commit/880a7c6
[97e03ea]: https://github.com/Madds59/revora-app/commit/97e03ea
[e22f7ec]: https://github.com/Madds59/revora-app/commit/e22f7ec
[793b81e]: https://github.com/Madds59/revora-app/commit/793b81e
[bd89e89]: https://github.com/Madds59/revora-app/commit/bd89e89
[588f9b9]: https://github.com/Madds59/revora-app/commit/588f9b9
[c9c0e41]: https://github.com/Madds59/revora-app/commit/c9c0e41
[58796d6]: https://github.com/Madds59/revora-app/commit/58796d6
[4fc9996]: https://github.com/Madds59/revora-app/commit/4fc9996
[ab50774]: https://github.com/Madds59/revora-app/commit/ab50774
[aba3b7c]: https://github.com/Madds59/revora-app/commit/aba3b7c
[7738eda]: https://github.com/Madds59/revora-app/commit/7738eda
[9af2cae]: https://github.com/Madds59/revora-app/commit/9af2cae
[a81b8b0]: https://github.com/Madds59/revora-app/commit/a81b8b0
[79aa027]: https://github.com/Madds59/revora-app/commit/79aa027
[addf44a]: https://github.com/Madds59/revora-app/commit/addf44a
[8989221]: https://github.com/Madds59/revora-app/commit/8989221
[7a121a7]: https://github.com/Madds59/revora-app/commit/7a121a7
[b314b01]: https://github.com/Madds59/revora-app/commit/b314b01
[762e296]: https://github.com/Madds59/revora-app/commit/762e296
[4258bd2]: https://github.com/Madds59/revora-app/commit/4258bd2
[fedd19c]: https://github.com/Madds59/revora-app/commit/fedd19c
[f9f6ed0]: https://github.com/Madds59/revora-app/commit/f9f6ed0
[74ec6c0]: https://github.com/Madds59/revora-app/commit/74ec6c0
[5955a8b]: https://github.com/Madds59/revora-app/commit/5955a8b
[34774b8]: https://github.com/Madds59/revora-app/commit/34774b8
[1ca58dc]: https://github.com/Madds59/revora-app/commit/1ca58dc
[3262b57]: https://github.com/Madds59/revora-app/commit/3262b57
[94930df]: https://github.com/Madds59/revora-app/commit/94930df
[13df544]: https://github.com/Madds59/revora-app/commit/13df544
[2f2b0e0]: https://github.com/Madds59/revora-app/commit/2f2b0e0
[f171537]: https://github.com/Madds59/revora-app/commit/f171537
[82c14aa]: https://github.com/Madds59/revora-app/commit/82c14aa
[99794a9]: https://github.com/Madds59/revora-app/commit/99794a9
[595e7be]: https://github.com/Madds59/revora-app/commit/595e7be
[7f0c74c]: https://github.com/Madds59/revora-app/commit/7f0c74c
[b5f24c8]: https://github.com/Madds59/revora-app/commit/b5f24c8
[1f30063]: https://github.com/Madds59/revora-app/commit/1f30063
[6dc15a0]: https://github.com/Madds59/revora-app/commit/6dc15a0
[5c9977f]: https://github.com/Madds59/revora-app/commit/5c9977f
[53ce296]: https://github.com/Madds59/revora-app/commit/53ce296
[bee042f]: https://github.com/Madds59/revora-app/commit/bee042f
[5f05ce6]: https://github.com/Madds59/revora-app/commit/5f05ce6
[ce346a7]: https://github.com/Madds59/revora-app/commit/ce346a7
[600c064]: https://github.com/Madds59/revora-app/commit/600c064
[9658043]: https://github.com/Madds59/revora-app/commit/9658043
[95102b6]: https://github.com/Madds59/revora-app/commit/95102b6
[bb8fd58]: https://github.com/Madds59/revora-app/commit/bb8fd58
[2394d8e]: https://github.com/Madds59/revora-app/commit/2394d8e
[4ab82f5]: https://github.com/Madds59/revora-app/commit/4ab82f5
[2e78035]: https://github.com/Madds59/revora-app/commit/2e78035
[bfdf12b]: https://github.com/Madds59/revora-app/commit/bfdf12b
[6f439ed]: https://github.com/Madds59/revora-app/commit/6f439ed
[7334223]: https://github.com/Madds59/revora-app/commit/7334223
