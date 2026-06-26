# Pre-Launch Security Acceptance Criteria

The conditions that should be true before Revora opens to real customers at scale,
or before live email/SMS sending is enabled platform-wide. This is a checklist for
the Operator to sign off against, informed by the Security Owner.

## Application Security

- [ ] All P0 findings from this audit, any follow-up audit, and any external
      pentest are resolved and verified by retest.
- [ ] All P1 findings are resolved or explicitly risk-accepted in writing in
      [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md).
- [ ] An external pentest (see
      [EXTERNAL_PENTEST_BRIEF.md](EXTERNAL_PENTEST_BRIEF.md)) has been completed
      at least once against a representative staging environment.
- [ ] [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md) has been executed
      manually (or automated via `scripts/e2e.mjs`-style coverage) with no
      cross-tenant failures.
- [ ] [ACCOUNT_SAFETY_TEST_MATRIX.md](ACCOUNT_SAFETY_TEST_MATRIX.md) executed with
      no authorization-bypass failures.

## Data/Privacy

- [ ] Qualified legal review of privacy policy, terms of service, and data
      handling completed (see
      [LEGAL_PRIVACY_REVIEW_CHECKLIST.md](LEGAL_PRIVACY_REVIEW_CHECKLIST.md)) —
      **this program's outputs alone do not satisfy this requirement.**
- [ ] A retention/deletion approach is decided (not necessarily fully automated,
      but at minimum a documented manual process) — see
      [DATA_RETENTION_AND_DELETION_PLAN.md](DATA_RETENTION_AND_DELETION_PLAN.md).
- [ ] Backup/restore configuration for the production Supabase project is
      confirmed and documented (see
      [BACKUP_AND_RECOVERY_PLAN.md](BACKUP_AND_RECOVERY_PLAN.md) §2).

## Notifications (only required if/when enabling live sending)

- [ ] Full checklist in
      [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md)
      "Pre-Production Go-Live Checklist" completed.
- [ ] [UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md](UAE_GCC_NOTIFICATION_COMPLIANCE_CHECKLIST.md)
      reviewed by qualified counsel.

## Operational Readiness

- [ ] Monitoring/alerting for the signals in
      [MONITORING_AND_ALERTING_PLAN.md](MONITORING_AND_ALERTING_PLAN.md) is wired
      to something a human actually watches.
- [ ] Incident escalation path
      ([REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §7) has a named
      responsible person, not just a documented process.
- [ ] CI enforcement of lint/typecheck/build/test/secret-scan exists (closing
      DEVSECOPS-03), so the release gate isn't dependent on a human remembering
      to run commands locally.

## Explicit Non-Goals of This Checklist

This checklist does not require zero P2/P3 findings — those are tracked and
improved continuously, not blocking. It also does not substitute for the
Operator's own business judgment about acceptable risk at a given stage of
growth; it is a floor, prepared by the security/privacy program, for the Operator
to weigh.

## Sign-Off

| Criterion group | Signed off by | Date | Notes |
|---|---|---|---|
| Application Security | | | |
| Data/Privacy | | | |
| Notifications (if applicable) | | | |
| Operational Readiness | | | |

This table is intentionally blank — it is filled in by the Operator at the actual
time of a launch decision, not pre-filled by this audit.
