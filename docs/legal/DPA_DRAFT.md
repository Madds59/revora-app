# Data Processing Addendum (Revora ↔ Workshop) — DRAFT

> **Status: draft for qualified UAE counsel. Not publishable, not signable.**
> Prepared 2026-09-12 from the verified data flows in
> `docs/security/PRIVACY_IMPACT_ASSESSMENT.md`. Terms of Service §3 incorporates
> "the data-processing terms in our Data Processing Addendum"; this is that
> document's factual skeleton. Counsel must supply the operative legal language,
> confirm the governing framework (UAE PDPL; DIFC or ADGM regimes if the entity is
> licensed there), and decide whether it is accepted online or signed.

## 1. Parties and roles

- **Controller ("Workshop")**: the business account holder that enters or uploads
  data about its own customers, vehicles, jobs, quotations and invoices.
- **Processor ("Revora")**: `[NEXT_PUBLIC_LEGAL_ENTITY_NAME]`, which hosts, stores,
  displays, transmits and (for AI features) analyses that data on the Workshop's
  documented instructions.
- Revora is an independent controller only for the Workshop's own account data
  (staff emails, roles, billing) — covered by the Privacy Policy, not this DPA.

## 2. Subject matter, duration, nature and purpose

| Element | Content |
|---|---|
| Subject matter | Operation of the Revora platform for the Workshop |
| Duration | Term of the subscription plus the 30-day export window in Terms §15, then deletion subject to §8 |
| Nature | Hosting, storage, access control, rendering in dashboard and customer portal, transactional notification dispatch (when enabled), AI-assisted advisory processing, invoice generation |
| Purpose | Enabling the Workshop to manage customer relationships, vehicle service, approvals, billing and complaints |

## 3. Categories of data subjects and personal data

- **Data subjects**: the Workshop's customers and prospective customers; drivers or
  owners of vehicles the Workshop services; individuals appearing in uploaded photos.
- **Personal data**: name, phone, email, address, preferred language, marketing
  consent flag; vehicle plate, VIN, make/model/year, odometer, service history;
  quotation contents and approval records (typed name, timestamp, user agent);
  jobs, invoices, appointments, complaints, feedback, ratings; uploaded documents
  and photos; AI symptom inputs and outputs.
- **Special categories**: none intended. Workshops must not upload ID documents or
  health information unless counsel confirms a lawful basis and handling rules.

## 4. Processor obligations (Revora)

1. Process only on the Workshop's documented instructions (use of the platform
   features is the instruction), unless required by law — in which case Revora
   informs the Workshop before processing where legally permitted.
2. Ensure persons with access are bound by confidentiality.
3. Implement the technical and organisational measures in §6.
4. Engage sub-processors only under §5.
5. Assist the Workshop with data subject requests (§7), security obligations,
   breach notification (§9) and any impact assessment, taking into account the
   nature of processing.
6. Delete or return data at the end of the service (§8).
7. Make available the information necessary to demonstrate compliance and allow
   audits (§10).
8. Inform the Workshop if an instruction, in Revora's opinion, infringes applicable
   data-protection law.

## 5. Sub-processors

Authorised at the effective date (general authorisation; Revora will notify
Workshops of additions at least 14 days in advance with a right to object):

| Sub-processor | Purpose | Location |
|---|---|---|
| Supabase, Inc. | Postgres database, authentication, file storage | Republic of Korea (`ap-northeast-2`) |
| Vercel, Inc. | Application hosting, edge network, request logs | United States (default region) |
| Stripe, Inc. | Subscription billing for the Workshop (Workshop account data only; no customer data) | United States |
| OpenAI, L.L.C. | AI advisory output — receives symptom text, warning lights, mileage, DTCs, VIN-derived make/model/year only | United States |
| NHTSA vPIC (US Government) | VIN decoding — receives VIN only | United States |
| Resend | Transactional email delivery — only when the Workshop enables live sending | United States |
| Twilio Inc. | Transactional SMS delivery — only when the Workshop enables live sending | United States |

No analytics or error-telemetry sub-processor exists as of this draft.

## 6. Security measures (factual, from the security programme)

- Tenant isolation enforced in the database by row-level security on every table,
  plus server-derived `business_id` on every write; cross-tenant FK injection is
  blocked by triggers (`docs/security/APPSEC_17_CROSS_TENANT_FK_INJECTION.md`).
- TLS in transit; encryption at rest by the hosting providers.
- Private files served only via short-lived signed URLs.
- MFA enforced for platform administrators; available to all accounts.
- `SECURITY DEFINER` database functions are not executable by the anonymous role
  (migration 0038); privileged RPCs check `is_super_admin()` / membership internally.
- Webhook signature verification for Stripe; shared-secret, constant-time-compared
  authentication for scheduled jobs.
- Audit log of row changes (`audit_events`).
- Backup and recovery per `docs/security/BACKUP_AND_RECOVERY_PLAN.md`.

## 7. Data subject requests

- The Workshop receives and validates requests from its own customers and instructs
  Revora where platform-level action is needed (export, correction, deletion).
- Revora responds to Workshop instructions within `[N]` business days and, where a
  data subject contacts Revora directly, redirects them to the Workshop without
  undue delay unless law requires Revora to act.
- Current state: export and deletion are manual operations run by Revora staff;
  no self-service tooling exists. Counsel to confirm whether the DPA may say so.

## 8. Deletion and return

- On termination, the Workshop may request an export (JSON/CSV) within 30 days.
- After the window, Revora deletes the Workshop's data except where retention is
  required by law (UAE commercial/tax records — currently five years — signed
  approvals and audit logs as legal records). Retention periods per
  `docs/security/DATA_RETENTION_AND_DELETION_PLAN.md` §2, pending counsel confirmation.

## 9. Personal data breach

- Revora notifies the Workshop without undue delay and no later than `[48]` hours
  after becoming aware of a breach affecting the Workshop's data, with the
  information needed for the Workshop to meet its own notification duties to the
  UAE Data Office and to data subjects.

## 10. Audit

- Revora provides, on reasonable request no more than once a year, the current
  security documentation set (`docs/security/`) and answers to a security
  questionnaire; on-site audit only where a supervisory authority requires it or
  following a breach, at the Workshop's cost, with reasonable notice.

## 11. International transfers

- All sub-processors are outside the UAE (§5). Counsel to specify the transfer
  mechanism under PDPL Arts. 22–23 (adequacy decision if one exists for the
  destination; otherwise contractual safeguards or explicit consent), and whether
  DIFC/ADGM transfer rules apply instead.

## 12. Liability and precedence

- Liability is governed by the Terms of Service §13; this DPA does not increase the
  cap. In case of conflict on data-protection matters, this DPA prevails.

## Open decisions for the Operator

- [ ] Signed DPA vs. click-accepted at onboarding (affects the onboarding form).
- [ ] Breach notification hours (`[48]` proposed).
- [ ] DSAR turnaround (`[N]` business days).
- [ ] Whether to prohibit ID-document uploads outright in the Terms.
- [ ] Supabase region move before launch (removes the largest transfer).
