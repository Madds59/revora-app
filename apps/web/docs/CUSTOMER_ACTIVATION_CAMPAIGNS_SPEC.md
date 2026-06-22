# Customer Activation Campaigns Spec

## Goal

Customer Activation Campaigns should help businesses invite customers into the Revora portal, track activation, and nudge customers toward quote approvals, complaint tracking, documents, jobs, and membership engagement.

This is future planning only. It does not authorize schema changes or migrations.

## Activation Goals

- Increase linked portal accounts.
- Reduce manual WhatsApp-only approvals.
- Improve quote approval speed.
- Centralize complaint communication.
- Encourage customers to view jobs, documents, and service history.
- Give owners visibility into customer adoption.

## Invite States

Suggested invite states:

- `not_invited`
- `queued`
- `sent`
- `opened`
- `activated`
- `bounced`
- `expired`
- `unsubscribed`
- `failed`

## Reminder Flow

Recommended reminder sequence:

1. Initial invite when customer record is linked and data quality is sufficient.
2. Reminder after 48 hours if unopened.
3. Reminder when a quote is waiting for approval.
4. Reminder when a complaint response is posted.
5. Final reminder before invite expiry.

Avoid reminders when:

- Customer opted out.
- Phone/email is unverified or malformed.
- Business has not approved customer activation.
- Customer has already activated.

## Portal Activation Tracking

Track:

- Invite sent timestamp.
- First open timestamp.
- First login timestamp.
- First portal action.
- Latest portal activity.
- Activation source.
- Linked customer record.
- Business and branch context.

## Segmentation

Campaigns should support segmentation by:

- Branch.
- Recent quote.
- Open complaint.
- Active job.
- Membership/customer plan.
- Last service date.
- Language preference.
- Portal activation status.

## WhatsApp/Email Later

Initial implementation can be email-only or manual-link based. WhatsApp Business API and SMS should be added after message consent, templates, and delivery monitoring are ready.

Future channels:

- Email
- WhatsApp
- SMS
- Push notification

## Magic Link Considerations

Magic links should:

- Expire.
- Be single-purpose where possible.
- Respect Supabase Auth callback configuration.
- Route to the correct locale and portal destination.
- Not bypass quote approval acknowledgement.
- Not expose another customer record if email matching is ambiguous.

## Metrics

Activation metrics:

- Invites sent.
- Invite open rate.
- Portal activation rate.
- First-action conversion.
- Quote approval conversion after invite.
- Complaint response view rate.
- Activation by branch.
- Activation by advisor.
- Failed/bounced invite count.

## Privacy And Security Rules

- Customers must only access their linked records.
- Customers must not see other customers or business dashboard data.
- Invite content must not expose sensitive job/quote/complaint details unless authenticated.
- Opt-out and consent states must be respected.
- Agents must not handle customer passwords.
- Service-role operations must remain server-side only.

## Future Schema Ideas, No Migration

Potential future tables:

- `customer_invites`
- `customer_invite_events`
- `activation_campaigns`
- `activation_campaign_segments`
- `customer_notification_preferences`

Do not create these tables until a migration-backed implementation task is approved.
