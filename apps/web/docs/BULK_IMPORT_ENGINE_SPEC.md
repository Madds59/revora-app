# Bulk Import Engine Spec

## Goal

The future Bulk Import Engine should let Revora operators and business owners import client records safely without weakening RLS, creating duplicates, or committing bad data directly into production tables.

This is planning only. It does not authorize schema changes or migrations.

## Supported Import Entities

Initial supported entities:

- Branches
- Team/advisors
- Customers
- Vehicles
- Services
- Quotation items
- Complaints
- Documents metadata

Later entities:

- Inventory
- Suppliers
- Jobs
- Historical quote approvals
- Maintenance history

## Download Template

Each entity should provide a CSV template with:

- Required columns.
- Optional columns.
- Example row.
- Accepted formats.
- Locale notes for Arabic/English names.
- Phone and country-code guidance.

## Upload CSV/XLSX Later

Start with CSV. Add XLSX once validation and staging are stable.

Upload requirements:

- File size limit by plan/operator role.
- MIME/type validation.
- Virus scanning when file storage flow exists.
- No direct commit from upload.
- Every upload creates a staging import session.

## Column Mapping

Mapping should allow:

- Auto-detected columns.
- Manual mapping overrides.
- Ignored columns.
- Required column warnings.
- Normalization preview before commit.

Examples:

- `mobile`, `phone`, `whatsapp` -> `phone`
- `plate`, `plate_number`, `registration` -> `plate_number`
- `advisor`, `service_advisor`, `owner` -> assigned staff field

## Validation

Validate before staging commit:

- Required fields.
- Email format.
- Phone normalization.
- VIN length and characters.
- Plate presence for vehicle rows.
- Branch existence or branch creation intent.
- Customer-to-vehicle relationships.
- Enum/status values.
- Arabic/English text length.
- Duplicate candidates.

## Duplicate Detection

Use layered duplicate detection:

- Customer email exact match.
- Phone normalized exact match.
- Customer name + phone partial match.
- Vehicle VIN exact match.
- Vehicle plate + business/branch match.
- Document filename + entity context match.

Duplicates should produce reviewable warnings, not automatic overwrites.

## Staging

Imported files should create staging records that are tenant-scoped by `business_id` and visible only to authorized owner/manager roles.

Staging should store:

- Original filename.
- Entity type.
- Upload actor.
- Parsed row count.
- Valid row count.
- Invalid row count.
- Duplicate warning count.
- Mapping config.
- Validation report.

## Preview

Preview UI should show:

- Valid rows ready to commit.
- Invalid rows requiring correction.
- Duplicate candidates.
- Normalized values.
- Target branch/team/customer relationships.
- Estimated created vs updated counts.

## Commit

Commit should:

- Require owner/manager permission.
- Write in batches.
- Preserve an import history record.
- Record actor, timestamp, and counts.
- Avoid overwriting protected fields unless explicitly mapped.
- Produce audit events.

## Rollback/Report

Rollback should be designed carefully:

- Prefer import reversal for newly created records only.
- Do not delete records that have subsequent quotes, jobs, complaints, approvals, or documents.
- Generate a report for committed, skipped, failed, and duplicate rows.

## Import History

Import history should show:

- Date/time.
- Actor.
- Entity type.
- Source file.
- Counts.
- Status.
- Validation report.
- Commit report.
- Rollback eligibility.

## Suggested Future Schema, No Migration

Potential future tables:

- `import_sessions`
- `import_files`
- `import_mappings`
- `import_rows`
- `import_errors`
- `import_commits`

Do not create these tables until a migration-backed implementation task is approved.

## RLS Model

RLS should enforce:

- Every import session is scoped by `business_id`.
- Owners/managers can create and commit import sessions.
- Staff may view only if explicitly allowed.
- Customers cannot access import sessions.
- Platform admins access only through audited support tooling.

## UI Flow

Recommended flow:

1. Choose entity.
2. Download template.
3. Upload file.
4. Map columns.
5. Validate.
6. Review duplicates.
7. Preview commit.
8. Commit.
9. Download report.

## Edge Cases

- Multiple customers share one phone number.
- Vehicles shared by family/company accounts.
- Missing VIN but plate present.
- Same plate across countries or branches.
- Arabic and English names in one column.
- Excel auto-formatted phone numbers.
- Date formats from different locales.
- Historical complaints without customer email.
- Documents without matching customer/vehicle.

## Recommended Implementation Sequence

1. CSV customer import staging.
2. Duplicate detection and preview.
3. Commit customers only.
4. Vehicle import linked to customers.
5. Branch/service imports.
6. Complaint history import.
7. XLSX support.
8. Import history dashboard.
9. Rollback/reporting tools.
