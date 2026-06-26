# Security Roles and RACI

This defines job descriptions for security functions at Revora. At the current stage
(pre-team, single operator) one person likely holds every "Owner" role below — the
point of separating them is so each function has an explicit checklist instead of
being silently skipped, and so the roles can be delegated cleanly once Revora hires.

R = Responsible (does the work), A = Accountable (answerable for the outcome),
C = Consulted, I = Informed.

## Roles

| Role | Mission |
|---|---|
| **Security Owner** | Maintains the security program, risk register, and release gate. Final accountable party for "is this safe to ship." |
| **Privacy Owner** | Maintains data classification, retention, and privacy impact assessments. Accountable for "do we know what personal data we hold and why." |
| **AppSec Reviewer** | Reviews code/config changes for auth, RLS, API, and business-logic vulnerabilities. |
| **DevSecOps Owner** | Owns secrets handling, deployment safety, monitoring/alerting, and backup/recovery. |
| **QA/Security Tester** | Maintains automated security-relevant tests and manual QA scripts; verifies fixes. |
| **External Pentest Prep Lead** | Prepares scope, accounts, and evidence requests for a future external pentest; does not perform destructive testing themselves. |
| **Legal/Privacy Advisory Coordinator** | Prepares the legal/privacy checklist for qualified counsel; does **not** give final legal sign-off. |
| **Operator** | Whoever currently runs the business (today: the founder). Final approver for high-risk releases per [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §8. |

## RACI by Activity

| Activity | Security Owner | Privacy Owner | AppSec Reviewer | DevSecOps Owner | QA/Sec Tester | Pentest Lead | Legal Coordinator | Operator |
|---|---|---|---|---|---|---|---|---|
| Maintain risk register | A/R | C | R | R | C | I | I | I |
| Classify a new data type | C | A/R | C | I | I | I | C | I |
| Review a PR touching RLS/auth | A | I | R | C | C | I | I | I |
| Review a PR touching Stripe webhook | A | I | R | C | C | I | I | I |
| Review a PR touching notifications | A | C | R | R | C | I | C | A (go-live) |
| Review a PR touching AI Vehicle Intelligence | A | C | R | I | C | I | C | I |
| Approve enabling live notification send | I | C | C | C | C | I | C | A/R |
| Approve a production migration | A | C | R | C | I | I | I | A |
| Rotate a leaked/expiring secret | I | I | I | A/R | I | I | I | C |
| Maintain monitoring/alerting | I | I | C | A/R | C | I | I | I |
| Add/maintain security tests | C | I | C | I | A/R | I | I | I |
| Write manual QA scripts | C | I | C | I | A/R | I | I | I |
| Scope external pentest | A | C | C | C | C | R | I | A (budget) |
| Triage pentest findings | A | C | R | R | C | R | I | I |
| Draft privacy policy / ToS clauses | I | A/R | C | I | I | I | R | I |
| Final legal/privacy sign-off before public launch | I | C | I | I | I | I | C | **Qualified external counsel — not this program** |
| Incident response coordination | A/R | C | R | R | C | I | C | I |
| Customer breach notification | C | A | I | I | I | I | C | R |

## Escalation Path

1. AppSec Reviewer / QA Tester / DevSecOps Owner finds or suspects an issue.
2. Logged immediately in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) with
   a severity per the model in [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §4.
3. P0/P1 → Security Owner notified immediately; release gate blocks until resolved or
   the Operator explicitly risk-accepts in writing.
4. P2/P3 → tracked, reviewed at the next security pass.
5. Anything involving personal data exposure → Privacy Owner is looped in regardless
   of severity, to assess notification obligations.

## Current Staffing Reality

As of this audit, there is no dedicated security team — these roles are
responsibilities to pick up, not job titles assigned to different people. This
document should be revisited (and RACI cells reassigned to named individuals) as
soon as Revora has more than one person capable of reviewing code.
