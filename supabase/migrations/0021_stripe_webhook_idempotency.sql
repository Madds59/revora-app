-- Stripe webhook idempotency helpers.
-- Adds stable Stripe line-item identifiers so webhook replays can upsert
-- invoice and subscription items without duplicating rows.

alter table public.billing_invoice_items
  add column if not exists stripe_invoice_line_item_id text;

alter table public.subscription_items
  add column if not exists stripe_subscription_item_id text;

create unique index if not exists billing_invoice_items_stripe_invoice_line_item_id_idx
  on public.billing_invoice_items (stripe_invoice_line_item_id);

create unique index if not exists subscription_items_stripe_subscription_item_id_idx
  on public.subscription_items (stripe_subscription_item_id);

create index if not exists subscription_items_subscription_id_idx
  on public.subscription_items (subscription_id);
