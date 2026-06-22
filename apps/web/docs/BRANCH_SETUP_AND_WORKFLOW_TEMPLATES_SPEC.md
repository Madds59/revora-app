# Branch Setup And Workflow Templates Spec

## Goal

Branch setup and workflow templates should let Revora configure a new client faster while preserving tenant isolation, branch ownership, role clarity, and service-specific workflows.

This is future planning only. It does not authorize schema changes or migrations.

## Branch Setup Wizard

The wizard should collect:

- Branch name.
- Address and service area.
- Phone and email.
- Working hours.
- Default language.
- Supported services.
- Manager assignment.
- Advisor/staff assignment.
- Notification defaults.
- Customer assignment/import rules.
- Quote terms/defaults.
- Complaint ownership defaults.

## Manager Assignment

Manager assignment should:

- Require owner permission.
- Use approved staff invite/member flows.
- Show active managers only.
- Allow one primary manager and optional backups.
- Record changes through audit events.

## Advisor/Staff Assignment

Advisor/staff setup should:

- Assign service advisors to a branch.
- Assign technicians/detailers by role.
- Prevent self-joining.
- Keep inactive users out of default assignment lists.
- Support reassignment when staff leave.

## Service Defaults

Branch defaults may include:

- Common services.
- Labor rate.
- Default tax rate.
- Warranty text.
- Quote validity period.
- Expected completion windows.
- Product transparency requirement by item type.

## Notification Defaults

Default notification rules should define:

- Quote sent.
- Quote approved/declined.
- Job status changed.
- Complaint submitted.
- Complaint escalated.
- Complaint resolved.
- Payment/billing notices when applicable.

## Customer Assignment

Customer assignment should support:

- Default branch from import.
- Branch based on advisor/team.
- Manual branch transfer.
- Multi-branch customer history when enterprise support is ready.

## Branch Transfer History

Transfer history should capture:

- Customer or vehicle moved.
- Source branch.
- Destination branch.
- Actor.
- Reason.
- Timestamp.
- Related jobs/quotes/complaints affected.

## Workflow Templates

### Automotive Workshop

Default job statuses:

- New request
- Inspection
- Quote pending
- Waiting approval
- Waiting parts
- In progress
- Quality check
- Ready for pickup
- Completed

Quote presets:

- Diagnostic inspection
- Periodic service
- Brake repair
- Suspension repair
- AC repair
- Engine repair

Complaint severity defaults:

- Low: General follow-up.
- Medium: Service delay or communication issue.
- High: Safety or repeat repair concern.
- Critical: Vehicle unsafe or legal escalation risk.

Recommended notification rules:

- Quote sent to customer.
- Approval reminder after 24 hours.
- Parts delay update.
- Ready for pickup.
- Complaint escalation to manager.

Checklist examples:

- Record mileage and plate.
- Add diagnosis notes.
- Attach inspection photos.
- Confirm product category for parts.
- Capture customer approval.

### Detailing Center

Default job statuses:

- Booked
- Vehicle received
- Pre-inspection
- Prep
- Detailing in progress
- Cure/wait
- Final inspection
- Ready
- Completed

Quote presets:

- Exterior detail
- Interior detail
- Ceramic coating
- Paint correction
- PPF package
- Maintenance wash plan

Complaint severity defaults:

- Low: Scheduling or minor finish concern.
- Medium: Missed area or delayed handover.
- High: Finish damage claim.
- Critical: Escalated dispute with evidence.

Recommended notification rules:

- Booking confirmation.
- Vehicle received.
- Before/after media available.
- Ready for pickup.
- Complaint submitted to branch manager.

Checklist examples:

- Capture pre-service photos.
- Record package selected.
- Confirm warranty/care instructions.
- Upload before/after evidence.
- Send completion report.

### Tire Shop

Default job statuses:

- New request
- Stock check
- Quote sent
- Waiting approval
- Scheduled
- Installation in progress
- Alignment/check
- Completed

Quote presets:

- Tire replacement set
- Tire rotation
- Wheel alignment
- Puncture repair
- Battery replacement
- Roadside support intake

Complaint severity defaults:

- Low: General service question.
- Medium: Appointment delay or stock issue.
- High: Vibration, alignment, or repeat issue.
- Critical: Safety complaint after tire installation.

Recommended notification rules:

- Stock confirmed.
- Quote approval reminder.
- Installation appointment reminder.
- Safety follow-up after critical complaint.

Checklist examples:

- Confirm tire size.
- Confirm brand and origin.
- Record warranty.
- Capture old/new tire evidence.
- Record alignment result if applicable.

### Fleet Maintenance

Default job statuses:

- Scheduled
- Vehicle received
- Inspection
- Approval pending
- Maintenance in progress
- Waiting parts
- Fleet manager review
- Released
- Completed

Quote presets:

- Preventive maintenance
- Multi-vehicle service
- Inspection report
- Emergency repair
- Contract maintenance

Complaint severity defaults:

- Low: Documentation request.
- Medium: SLA delay.
- High: Vehicle downtime impact.
- Critical: Safety or contract breach.

Recommended notification rules:

- Fleet manager approval required.
- SLA risk warning.
- Vehicle release notice.
- Monthly service summary.
- Critical complaint escalation.

Checklist examples:

- Capture fleet ID.
- Record mileage and driver notes.
- Attach inspection report.
- Confirm SLA priority.
- Send release summary.

## Future Implementation Phases

1. Document branch setup requirements and template defaults.
2. Build a read-only template picker for operators.
3. Add branch setup wizard without schema changes where existing tables are sufficient.
4. Add migration-backed branch transfer history only after approval.
5. Add per-vertical workflow templates with owner confirmation before applying defaults.
6. Add audit events and browser QA for manager/staff assignment changes.
7. Add import alignment so bulk customer/vehicle imports can target branches safely.
