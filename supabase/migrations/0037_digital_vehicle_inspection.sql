-- Digital Vehicle Inspection (DVI) V1.
--
-- One inspection model, two contexts:
--   pre_quote : vehicle evaluated before any quotation (walk-in or appointment)
--   in_job    : additional work discovered while a job is already underway
--
-- Design notes:
-- * inspection_items SNAPSHOT the template's section/label at creation. Editing a
--   template later must never rewrite a report a customer has already been shown --
--   the same principle as freezing business_trn onto an issued invoice (0034).
-- * Completed inspections are immutable. Revora has no audited revision model for
--   domain rows, so V1 refuses silent edits rather than adding an unaudited escape
--   hatch. A correction is a new inspection.
-- * RLS is necessary but not sufficient: a BEFORE trigger additionally proves every
--   foreign key resolves inside the same tenant, and that the context/anchor pair is
--   coherent. This follows the 0035 tenant-isolation hardening convention.
-- * Share tokens are generated AND hashed in the application (Node crypto). The
--   database only ever sees and stores a SHA-256 hash, so neither the SQL layer nor a
--   database backup can yield a working link. There is deliberately no pgcrypto
--   dependency here.
-- * quotation_items gains ONE nullable provenance column. Existing quote behaviour is
--   untouched; the column is null everywhere else.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'inspection_context') then
    create type public.inspection_context as enum ('pre_quote', 'in_job');
  end if;
  if not exists (select 1 from pg_type where typname = 'inspection_status') then
    create type public.inspection_status as enum ('draft', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'inspection_result') then
    -- not_checked is a real outcome and is never treated as pass.
    create type public.inspection_result as enum ('pass', 'attention', 'fail', 'not_checked');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_templates_business_idx
  on public.inspection_templates (business_id, is_active, position);

-- At most one default template per business.
create unique index if not exists inspection_templates_one_default_idx
  on public.inspection_templates (business_id) where is_default;

create table if not exists public.inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  template_id uuid not null references public.inspection_templates(id) on delete cascade,
  section text not null,
  label text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_template_items_template_idx
  on public.inspection_template_items (template_id, is_active, position);

-- ---------------------------------------------------------------------------
-- Inspections
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid not null references public.vehicles(id),
  template_id uuid references public.inspection_templates(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  quotation_id uuid references public.quotations(id) on delete set null,
  context public.inspection_context not null,
  status public.inspection_status not null default 'draft',
  title text,
  summary text,
  odometer_reading integer,
  performed_by uuid references public.profiles(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  -- Share lifecycle. Only a SHA-256 hash is ever stored; see file header.
  share_token_hash bytea,
  share_created_at timestamptz,
  share_expires_at timestamptz,
  share_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_inspections_context_anchor check (
    (context = 'in_job' and job_id is not null)
    or (context = 'pre_quote' and job_id is null)
  ),
  constraint vehicle_inspections_odometer_sane check (
    odometer_reading is null or (odometer_reading >= 0 and odometer_reading <= 2000000)
  ),
  constraint vehicle_inspections_completed_shape check (
    (status = 'completed' and completed_at is not null)
    or (status = 'draft' and completed_at is null)
  )
);

create index if not exists vehicle_inspections_business_idx
  on public.vehicle_inspections (business_id, created_at desc);
create index if not exists vehicle_inspections_customer_idx
  on public.vehicle_inspections (customer_id, status, created_at desc);
create index if not exists vehicle_inspections_vehicle_idx
  on public.vehicle_inspections (vehicle_id, created_at desc);
create index if not exists vehicle_inspections_job_idx
  on public.vehicle_inspections (job_id) where job_id is not null;
-- Share lookup is by hash only.
create unique index if not exists vehicle_inspections_share_hash_idx
  on public.vehicle_inspections (share_token_hash) where share_token_hash is not null;

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  inspection_id uuid not null references public.vehicle_inspections(id) on delete cascade,
  -- Snapshot of the template item at creation time. Never recomputed.
  section text not null,
  label text not null,
  position integer not null default 0,
  result public.inspection_result not null default 'not_checked',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_items_inspection_idx
  on public.inspection_items (inspection_id, position);

create table if not exists public.inspection_item_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  inspection_item_id uuid not null references public.inspection_items(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (inspection_item_id, media_asset_id)
);

create index if not exists inspection_item_media_item_idx
  on public.inspection_item_media (inspection_item_id);

-- ---------------------------------------------------------------------------
-- Quotation provenance (smallest normalized design; nullable everywhere else)
-- ---------------------------------------------------------------------------

alter table public.quotation_items
  add column if not exists source_inspection_item_id uuid
    references public.inspection_items(id) on delete set null;

comment on column public.quotation_items.source_inspection_item_id is
  'DVI provenance: the inspection finding that produced this quotation line. '
  'Null for every line not created from an inspection.';

-- A given finding may appear at most once on a given quotation. This is half of
-- the idempotency guarantee; the other half is vehicle_inspections.quotation_id.
create unique index if not exists quotation_items_source_inspection_item_idx
  on public.quotation_items (quotation_id, source_inspection_item_id)
  where source_inspection_item_id is not null;

-- ---------------------------------------------------------------------------
-- Scoping helpers (0035 convention)
-- ---------------------------------------------------------------------------

create or replace function public.inspection_in_business(
  target_inspection_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_inspection_id is null or exists (
    select 1 from public.vehicle_inspections i
    where i.id = target_inspection_id and i.business_id = target_business_id
  );
$$;

create or replace function public.inspection_template_in_business(
  target_template_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_template_id is null or exists (
    select 1 from public.inspection_templates t
    where t.id = target_template_id and t.business_id = target_business_id
  );
$$;

create or replace function public.inspection_item_in_business(
  target_item_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_item_id is null or exists (
    select 1 from public.inspection_items ii
    where ii.id = target_item_id and ii.business_id = target_business_id
  );
$$;

create or replace function public.media_asset_in_business(
  target_media_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_media_id is null or exists (
    select 1 from public.media_assets m
    where m.id = target_media_id and m.business_id = target_business_id
  );
$$;

-- NOTE: Supabase ships DEFAULT PRIVILEGES granting EXECUTE on every new function in
-- schema public to anon, authenticated and service_role DIRECTLY (see pg_default_acl).
-- `revoke ... from public` therefore does NOT remove anon's access, because the grant
-- is to the anon ROLE, not to PUBLIC. Every privileged function below must revoke from
-- anon explicitly. Only the two public share resolvers intentionally keep anon EXECUTE.
revoke all on function public.inspection_in_business(uuid, uuid) from public, anon;
revoke all on function public.inspection_template_in_business(uuid, uuid) from public, anon;
revoke all on function public.inspection_item_in_business(uuid, uuid) from public, anon;
revoke all on function public.media_asset_in_business(uuid, uuid) from public, anon;
grant execute on function public.inspection_in_business(uuid, uuid) to authenticated;
grant execute on function public.inspection_template_in_business(uuid, uuid) to authenticated;
grant execute on function public.inspection_item_in_business(uuid, uuid) to authenticated;
grant execute on function public.media_asset_in_business(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity: every anchor must resolve inside the same tenant, and the
-- context/anchor pair must be coherent. RLS cannot express this.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_inspection_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.business_id = new.business_id
  ) then
    raise exception 'customer does not belong to this business' using errcode = '22023';
  end if;

  -- Same business is not enough: the vehicle must be this customer's.
  if not exists (
    select 1 from public.vehicles v
    where v.id = new.vehicle_id
      and v.business_id = new.business_id
      and v.customer_id = new.customer_id
  ) then
    raise exception 'vehicle does not belong to this customer' using errcode = '22023';
  end if;

  if new.template_id is not null and not exists (
    select 1 from public.inspection_templates t
    where t.id = new.template_id and t.business_id = new.business_id
  ) then
    raise exception 'template does not belong to this business' using errcode = '22023';
  end if;

  if new.appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = new.appointment_id
      and a.business_id = new.business_id
      and a.customer_id = new.customer_id
      and (a.vehicle_id is null or a.vehicle_id = new.vehicle_id)
  ) then
    raise exception 'appointment does not match this business, customer and vehicle'
      using errcode = '22023';
  end if;

  if new.job_id is not null and not exists (
    select 1 from public.jobs j
    where j.id = new.job_id
      and j.business_id = new.business_id
      and j.customer_id = new.customer_id
  ) then
    raise exception 'job does not match this business and customer' using errcode = '22023';
  end if;

  if new.quotation_id is not null and not exists (
    select 1 from public.quotations q
    where q.id = new.quotation_id and q.business_id = new.business_id
  ) then
    raise exception 'quotation does not belong to this business' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists vehicle_inspections_integrity on public.vehicle_inspections;
create trigger vehicle_inspections_integrity
  before insert or update on public.vehicle_inspections
  for each row execute function public.enforce_inspection_integrity();

create or replace function public.enforce_inspection_child_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_business uuid;
begin
  if tg_table_name = 'inspection_items' then
    select i.business_id into parent_business
    from public.vehicle_inspections i where i.id = new.inspection_id;
    if parent_business is null or parent_business <> new.business_id then
      raise exception 'inspection item business does not match its inspection'
        using errcode = '22023';
    end if;
  elsif tg_table_name = 'inspection_item_media' then
    select ii.business_id into parent_business
    from public.inspection_items ii where ii.id = new.inspection_item_id;
    if parent_business is null or parent_business <> new.business_id then
      raise exception 'media link business does not match its inspection item'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.media_assets m
      where m.id = new.media_asset_id and m.business_id = new.business_id
    ) then
      raise exception 'media asset does not belong to this business' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inspection_items_integrity on public.inspection_items;
create trigger inspection_items_integrity
  before insert or update on public.inspection_items
  for each row execute function public.enforce_inspection_child_integrity();

drop trigger if exists inspection_item_media_integrity on public.inspection_item_media;
create trigger inspection_item_media_integrity
  before insert or update on public.inspection_item_media
  for each row execute function public.enforce_inspection_child_integrity();

-- ---------------------------------------------------------------------------
-- Immutability of completed inspections
-- ---------------------------------------------------------------------------

create or replace function public.enforce_completed_inspection_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_status public.inspection_status;
  target_inspection uuid;
begin
  if tg_table_name = 'vehicle_inspections' then
    if old.status = 'completed' then
      -- Share lifecycle and quotation linkage are later facts ABOUT the document,
      -- not edits TO it, so they remain writable. Everything customer-visible is frozen.
      if (new.customer_id, new.vehicle_id, new.context, new.title, new.summary,
          new.odometer_reading, new.completed_at, new.completed_by, new.status)
         is distinct from
         (old.customer_id, old.vehicle_id, old.context, old.title, old.summary,
          old.odometer_reading, old.completed_at, old.completed_by, old.status)
      then
        raise exception 'a completed inspection cannot be modified' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  -- Child tables. Each NEW/OLD field is referenced ONLY inside the branch where that
  -- record actually has the column: PL/pgSQL binds a nested SQL statement on first
  -- execution, so a CASE spanning both shapes would fault on the absent field.
  if tg_table_name = 'inspection_items' then
    if tg_op = 'DELETE' then
      target_inspection := old.inspection_id;
    else
      target_inspection := new.inspection_id;
    end if;
  else -- inspection_item_media
    if tg_op = 'DELETE' then
      select ii.inspection_id into target_inspection
      from public.inspection_items ii where ii.id = old.inspection_item_id;
    else
      select ii.inspection_id into target_inspection
      from public.inspection_items ii where ii.id = new.inspection_item_id;
    end if;
  end if;

  select i.status into parent_status
  from public.vehicle_inspections i where i.id = target_inspection;

  if parent_status = 'completed' then
    raise exception 'a completed inspection cannot be modified' using errcode = '22023';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_inspections_immutable on public.vehicle_inspections;
create trigger vehicle_inspections_immutable
  before update on public.vehicle_inspections
  for each row execute function public.enforce_completed_inspection_immutable();

drop trigger if exists inspection_items_immutable on public.inspection_items;
create trigger inspection_items_immutable
  before update or delete on public.inspection_items
  for each row execute function public.enforce_completed_inspection_immutable();

drop trigger if exists inspection_item_media_immutable on public.inspection_item_media;
create trigger inspection_item_media_immutable
  before update or delete on public.inspection_item_media
  for each row execute function public.enforce_completed_inspection_immutable();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists inspection_templates_updated_at on public.inspection_templates;
create trigger inspection_templates_updated_at before update on public.inspection_templates
  for each row execute function public.set_updated_at();
drop trigger if exists inspection_template_items_updated_at on public.inspection_template_items;
create trigger inspection_template_items_updated_at before update on public.inspection_template_items
  for each row execute function public.set_updated_at();
drop trigger if exists vehicle_inspections_updated_at on public.vehicle_inspections;
create trigger vehicle_inspections_updated_at before update on public.vehicle_inspections
  for each row execute function public.set_updated_at();
drop trigger if exists inspection_items_updated_at on public.inspection_items;
create trigger inspection_items_updated_at before update on public.inspection_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Default template seeding (idempotent; existing + future businesses)
-- ---------------------------------------------------------------------------

create or replace function public.seed_default_inspection_template(target_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lang text;
  new_template_id uuid;
  seed_rows record;
begin
  -- Idempotent: never create a second default for a business.
  select t.id into new_template_id
  from public.inspection_templates t
  where t.business_id = target_business_id and t.is_default;
  if found then
    return new_template_id;
  end if;

  select coalesce(b.default_language, 'en') into lang
  from public.businesses b where b.id = target_business_id;
  if lang is null then
    return null;
  end if;

  insert into public.inspection_templates (business_id, name, description, is_default, is_active)
  values (
    target_business_id,
    case when lang = 'ar' then 'الفحص القياسي للمركبة' else 'Standard vehicle inspection' end,
    case when lang = 'ar'
         then 'قائمة فحص تشغيلية للورشة. ليست معياراً رسمياً من الشركة المصنعة أو جهة تنظيمية.'
         else 'Operational workshop checklist. Not an OEM or regulatory inspection standard.' end,
    true, true
  )
  returning id into new_template_id;

  for seed_rows in
    select * from (values
      (1,  'Tyres & wheels', 'الإطارات والعجلات', 'Front tyre tread depth',      'عمق مداس الإطار الأمامي'),
      (2,  'Tyres & wheels', 'الإطارات والعجلات', 'Rear tyre tread depth',       'عمق مداس الإطار الخلفي'),
      (3,  'Tyres & wheels', 'الإطارات والعجلات', 'Tyre pressures',              'ضغط الإطارات'),
      (4,  'Tyres & wheels', 'الإطارات والعجلات', 'Spare wheel and tools',       'الإطار الاحتياطي والأدوات'),
      (5,  'Brakes',         'الفرامل',           'Front brake pads',            'تيل الفرامل الأمامي'),
      (6,  'Brakes',         'الفرامل',           'Rear brake pads',             'تيل الفرامل الخلفي'),
      (7,  'Brakes',         'الفرامل',           'Brake discs',                 'أقراص الفرامل'),
      (8,  'Brakes',         'الفرامل',           'Brake fluid level',           'مستوى زيت الفرامل'),
      (9,  'Under bonnet',   'تحت غطاء المحرك',   'Engine oil level and condition', 'مستوى وحالة زيت المحرك'),
      (10, 'Under bonnet',   'تحت غطاء المحرك',   'Coolant level',               'مستوى سائل التبريد'),
      (11, 'Under bonnet',   'تحت غطاء المحرك',   'Drive belts',                 'سيور الإدارة'),
      (12, 'Under bonnet',   'تحت غطاء المحرك',   'Battery condition',           'حالة البطارية'),
      (13, 'Under bonnet',   'تحت غطاء المحرك',   'Visible leaks',               'تسريبات ظاهرة'),
      (14, 'Steering & suspension', 'التوجيه والتعليق', 'Shock absorbers',       'المساعدات'),
      (15, 'Steering & suspension', 'التوجيه والتعليق', 'Steering play',         'خلوص المقود'),
      (16, 'Electrical',     'الكهرباء',          'Headlights and indicators',   'المصابيح والإشارات'),
      (17, 'Electrical',     'الكهرباء',          'Wipers and washers',          'المساحات وغسيل الزجاج'),
      (18, 'Air conditioning', 'التكييف',         'A/C cooling performance',     'أداء تبريد المكيف'),
      (19, 'Interior',       'المقصورة الداخلية', 'Seat belts',                  'أحزمة الأمان'),
      (20, 'Interior',       'المقصورة الداخلية', 'Warning lights on dashboard', 'لمبات التحذير في لوحة العدادات')
    ) as t(pos, section_en, section_ar, label_en, label_ar)
  loop
    insert into public.inspection_template_items
      (business_id, template_id, section, label, position, is_active)
    values (
      target_business_id,
      new_template_id,
      case when lang = 'ar' then seed_rows.section_ar else seed_rows.section_en end,
      case when lang = 'ar' then seed_rows.label_ar   else seed_rows.label_en   end,
      seed_rows.pos,
      true
    );
  end loop;

  return new_template_id;
end;
$$;

revoke all on function public.seed_default_inspection_template(uuid) from public;
revoke all on function public.seed_default_inspection_template(uuid) from anon;
revoke all on function public.seed_default_inspection_template(uuid) from authenticated;

-- Future businesses: seed on creation.
create or replace function public.handle_business_created_seed_inspection_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_inspection_template(new.id);
  return new;
end;
$$;

drop trigger if exists businesses_seed_inspection_template on public.businesses;
create trigger businesses_seed_inspection_template
  after insert on public.businesses
  for each row execute function public.handle_business_created_seed_inspection_template();

-- Existing businesses at migration time. Bounded, deterministic, idempotent.
do $$
declare
  b record;
begin
  for b in select id from public.businesses where deleted_at is null loop
    perform public.seed_default_inspection_template(b.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.inspection_templates enable row level security;
alter table public.inspection_template_items enable row level security;
alter table public.vehicle_inspections enable row level security;
alter table public.inspection_items enable row level security;
alter table public.inspection_item_media enable row level security;

-- Templates: readable by staff, administered by owner/manager.
create policy "inspection_templates_read_staff" on public.inspection_templates
  for select using (public.is_business_member(business_id));

create policy "inspection_templates_manage" on public.inspection_templates
  for all using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  );

create policy "inspection_template_items_read_staff" on public.inspection_template_items
  for select using (public.is_business_member(business_id));

create policy "inspection_template_items_manage" on public.inspection_template_items
  for all using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.inspection_template_in_business(template_id, business_id)
  );

-- Inspections: staff manage; the owning customer reads COMPLETED ones only.
create policy "vehicle_inspections_read" on public.vehicle_inspections
  for select using (
    public.is_business_member(business_id)
    or (
      status = 'completed'
      and public.is_customer_for_business(business_id, customer_id)
    )
  );

create policy "vehicle_inspections_manage_staff" on public.vehicle_inspections
  for all using (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
    and public.customer_in_business(customer_id, business_id)
    and public.vehicle_in_business(vehicle_id, business_id)
    and public.vehicle_in_customer(vehicle_id, customer_id)
    and public.inspection_template_in_business(template_id, business_id)
    and public.job_in_business(job_id, business_id)
    and public.quotation_in_business(quotation_id, business_id)
  );

create policy "inspection_items_read" on public.inspection_items
  for select using (
    public.is_business_member(business_id)
    or exists (
      select 1 from public.vehicle_inspections i
      where i.id = inspection_items.inspection_id
        and i.business_id = inspection_items.business_id
        and i.status = 'completed'
        and public.is_customer_for_business(i.business_id, i.customer_id)
    )
  );

create policy "inspection_items_manage_staff" on public.inspection_items
  for all using (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
    and public.inspection_in_business(inspection_id, business_id)
  );

create policy "inspection_item_media_read" on public.inspection_item_media
  for select using (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.inspection_items ii
      join public.vehicle_inspections i on i.id = ii.inspection_id
      where ii.id = inspection_item_media.inspection_item_id
        and ii.business_id = inspection_item_media.business_id
        and i.status = 'completed'
        and public.is_customer_for_business(i.business_id, i.customer_id)
    )
  );

create policy "inspection_item_media_manage_staff" on public.inspection_item_media
  for all using (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
    and public.inspection_item_in_business(inspection_item_id, business_id)
    and public.media_asset_in_business(media_asset_id, business_id)
  );

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

-- Create an inspection and snapshot its template items in one transaction.
create or replace function public.create_inspection(
  target_business_id uuid,
  target_customer_id uuid,
  target_vehicle_id uuid,
  target_context public.inspection_context,
  target_template_id uuid default null,
  target_appointment_id uuid default null,
  target_job_id uuid default null,
  target_odometer integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  use_template uuid := target_template_id;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.has_business_role(
    target_business_id,
    array['business_owner', 'manager', 'employee']::public.member_role[]
  ) then
    raise exception 'not authorized to create inspections for this business'
      using errcode = '42501';
  end if;

  if use_template is null then
    select t.id into use_template from public.inspection_templates t
    where t.business_id = target_business_id and t.is_default and t.is_active;
  end if;

  -- The integrity trigger validates every anchor; we do not pre-empt it here.
  insert into public.vehicle_inspections (
    business_id, customer_id, vehicle_id, template_id,
    appointment_id, job_id, context, status, performed_by, odometer_reading
  )
  values (
    target_business_id, target_customer_id, target_vehicle_id, use_template,
    target_appointment_id, target_job_id, target_context, 'draft', uid, target_odometer
  )
  returning id into new_id;

  -- Snapshot: copy the template's customer-visible facts. Never referenced again.
  if use_template is not null then
    insert into public.inspection_items
      (business_id, inspection_id, section, label, position, result)
    select target_business_id, new_id, ti.section, ti.label, ti.position, 'not_checked'
    from public.inspection_template_items ti
    where ti.template_id = use_template and ti.is_active
    order by ti.position;
  end if;

  return new_id;
end;
$$;

create or replace function public.complete_inspection(target_inspection_id uuid, target_summary text default null)
returns public.vehicle_inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  insp public.vehicle_inspections%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into insp from public.vehicle_inspections
  where id = target_inspection_id for update;
  if not found then
    raise exception 'inspection not found' using errcode = '22023';
  end if;

  if not public.has_business_role(
    insp.business_id,
    array['business_owner', 'manager', 'employee']::public.member_role[]
  ) then
    raise exception 'not authorized to complete this inspection' using errcode = '42501';
  end if;

  if insp.status <> 'draft' then
    raise exception 'only a draft inspection can be completed' using errcode = '22023';
  end if;

  update public.vehicle_inspections
    set status = 'completed',
        completed_at = now(),
        completed_by = uid,
        summary = coalesce(target_summary, summary)
    where id = target_inspection_id
    returning * into insp;

  return insp;
end;
$$;

-- Share lifecycle. The application generates 32 random bytes and passes ONLY the
-- SHA-256 hash; the plaintext token never reaches the database.
create or replace function public.set_inspection_share(
  target_inspection_id uuid,
  target_token_hash bytea,
  target_expires_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  insp public.vehicle_inspections%rowtype;
begin
  select * into insp from public.vehicle_inspections
  where id = target_inspection_id for update;
  if not found then
    raise exception 'inspection not found' using errcode = '22023';
  end if;

  if not public.has_business_role(
    insp.business_id, array['business_owner', 'manager']::public.member_role[]
  ) then
    raise exception 'not authorized to share this inspection' using errcode = '42501';
  end if;

  if insp.status <> 'completed' then
    raise exception 'only a completed inspection can be shared' using errcode = '22023';
  end if;

  if target_token_hash is null or octet_length(target_token_hash) <> 32 then
    raise exception 'invalid share token' using errcode = '22023';
  end if;

  -- Rotation: overwriting the hash invalidates any previously issued link.
  update public.vehicle_inspections
    set share_token_hash = target_token_hash,
        share_created_at = now(),
        share_expires_at = target_expires_at,
        share_revoked_at = null
    where id = target_inspection_id;

  return target_expires_at;
end;
$$;

create or replace function public.revoke_inspection_share(target_inspection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  insp public.vehicle_inspections%rowtype;
begin
  select * into insp from public.vehicle_inspections
  where id = target_inspection_id for update;
  if not found then
    raise exception 'inspection not found' using errcode = '22023';
  end if;

  if not public.has_business_role(
    insp.business_id, array['business_owner', 'manager']::public.member_role[]
  ) then
    raise exception 'not authorized to manage sharing for this inspection'
      using errcode = '42501';
  end if;

  update public.vehicle_inspections
    set share_revoked_at = now(), share_token_hash = null
    where id = target_inspection_id;
end;
$$;

-- Public resolution. Deliberately returns a MINIMAL projection and nothing that
-- could identify the customer or reveal pricing. Callable by anon: this is the one
-- narrow doorway through the authorization boundary, and it discloses only the
-- intentionally shared artifact.
create or replace function public.resolve_inspection_share(target_token_hash bytea)
returns table (
  inspection_id uuid,
  business_name text,
  vehicle_label text,
  completed_at timestamptz,
  summary text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    b.name,
    trim(both ' ' from concat_ws(' ', v.make, v.model))
      || case when v.plate_number is not null then ' · ' || v.plate_number else '' end,
    i.completed_at,
    i.summary
  from public.vehicle_inspections i
  join public.businesses b on b.id = i.business_id
  join public.vehicles v on v.id = i.vehicle_id
  where i.share_token_hash = target_token_hash
    and i.status = 'completed'
    and i.share_revoked_at is null
    and (i.share_expires_at is null or i.share_expires_at > now());
$$;

create or replace function public.resolve_inspection_share_items(target_token_hash bytea)
returns table (
  item_id uuid,
  section text,
  label text,
  item_position integer,
  result public.inspection_result,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select ii.id, ii.section, ii.label, ii.position, ii.result, ii.note
  from public.inspection_items ii
  join public.vehicle_inspections i on i.id = ii.inspection_id
  where i.share_token_hash = target_token_hash
    and i.status = 'completed'
    and i.share_revoked_at is null
    and (i.share_expires_at is null or i.share_expires_at > now())
  order by ii.position;
$$;

revoke all on function public.set_inspection_share(uuid, bytea, timestamptz) from public, anon;
revoke all on function public.revoke_inspection_share(uuid) from public, anon;
revoke all on function public.create_inspection(uuid, uuid, uuid, public.inspection_context, uuid, uuid, uuid, integer) from public, anon;
revoke all on function public.complete_inspection(uuid, text) from public, anon;
grant execute on function public.set_inspection_share(uuid, bytea, timestamptz) to authenticated;
grant execute on function public.revoke_inspection_share(uuid) to authenticated;
grant execute on function public.create_inspection(uuid, uuid, uuid, public.inspection_context, uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.complete_inspection(uuid, text) to authenticated;

-- The two resolvers are the public doorway. anon may execute them; they expose only
-- the shared artifact and require possession of the 256-bit token's hash.
revoke all on function public.resolve_inspection_share(bytea) from public;
revoke all on function public.resolve_inspection_share_items(bytea) from public;
grant execute on function public.resolve_inspection_share(bytea) to anon, authenticated;
grant execute on function public.resolve_inspection_share_items(bytea) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Findings -> draft quotation. Prices are NEVER fabricated.
-- ---------------------------------------------------------------------------

create or replace function public.create_quotation_from_inspection(
  target_inspection_id uuid,
  target_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  insp public.vehicle_inspections%rowtype;
  next_number integer;
  new_quote_number text;
  new_quote_id uuid;
  it record;
  pos integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into insp from public.vehicle_inspections
  where id = target_inspection_id for update;
  if not found then
    raise exception 'inspection not found' using errcode = '22023';
  end if;

  if not public.has_business_role(
    insp.business_id, array['business_owner', 'manager']::public.member_role[]
  ) then
    raise exception 'not authorized to create quotations for this business'
      using errcode = '42501';
  end if;

  if insp.status <> 'completed' then
    raise exception 'only a completed inspection can be converted' using errcode = '22023';
  end if;

  -- Idempotency layer 1: one quotation per inspection.
  if insp.quotation_id is not null then
    return insp.quotation_id;
  end if;

  if target_item_ids is null or array_length(target_item_ids, 1) is null then
    raise exception 'select at least one finding' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(insp.business_id::text, 0));

  select coalesce(max((regexp_match(q.quote_number, '^Q-(\d+)$'))[1]::integer), 0) + 1
    into next_number
  from public.quotations q
  where q.business_id = insp.business_id and q.quote_number ~ '^Q-(\d+)$';

  new_quote_number := 'Q-' || lpad(next_number::text, 4, '0');

  insert into public.quotations (
    business_id, customer_id, vehicle_id, quote_number, currency, created_by, internal_notes
  )
  values (
    insp.business_id, insp.customer_id, insp.vehicle_id, new_quote_number, 'AED', uid,
    'Created from vehicle inspection ' || insp.id::text
  )
  returning id into new_quote_id;

  -- One line per selected finding. Only attention/fail are eligible.
  -- unit_price stays 0: a failed checkbox is evidence, not a price.
  for it in
    select ii.id, ii.section, ii.label, ii.note, ii.result
    from public.inspection_items ii
    where ii.inspection_id = insp.id
      and ii.id = any(target_item_ids)
      and ii.result in ('attention', 'fail')
    order by ii.position
  loop
    pos := pos + 1;
    insert into public.quotation_items (
      business_id, quotation_id, kind, name, description,
      quantity, unit_price, tax_rate, discount_amount, total,
      position, source_inspection_item_id
    )
    values (
      insp.business_id, new_quote_id, 'service',
      it.section || ' — ' || it.label,
      it.note,
      1, 0, 0, 0, 0,
      pos, it.id
    );
  end loop;

  if pos = 0 then
    raise exception 'none of the selected findings are quotable' using errcode = '22023';
  end if;

  update public.vehicle_inspections
    set quotation_id = new_quote_id where id = insp.id;

  return new_quote_id;
end;
$$;

revoke all on function public.create_quotation_from_inspection(uuid, uuid[]) from public, anon;
grant execute on function public.create_quotation_from_inspection(uuid, uuid[]) to authenticated;

-- Trigger functions are covered by the SAME Supabase DEFAULT PRIVILEGES that
-- grant EXECUTE on every new public function to `anon`. Postgres refuses to
-- invoke a `returns trigger` function directly ("trigger functions can only be
-- called as triggers"), so this is not exploitable today -- but leaving the
-- grant in place contradicts the least-privilege posture the rest of this
-- migration holds, and it would silently become a real grant if any of these
-- were ever refactored into a callable helper. Revoking from `public` alone is
-- NOT sufficient: the default privilege is granted to the anon ROLE.
revoke all on function public.enforce_inspection_integrity() from public, anon;
revoke all on function public.enforce_inspection_child_integrity() from public, anon;
revoke all on function public.enforce_completed_inspection_immutable() from public, anon;
revoke all on function public.handle_business_created_seed_inspection_template()
  from public, anon;

-- ---------------------------------------------------------------------------
-- Grants (local/self-hosted Postgres does not auto-grant; see 0003_api_grants)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.inspection_templates,
  public.inspection_template_items,
  public.vehicle_inspections,
  public.inspection_items,
  public.inspection_item_media
  to authenticated;
