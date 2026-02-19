-- DRE Off Market — Initial Schema
-- All tables for off-market real estate lead tracking

-- ============================================
-- PROPERTIES
-- ============================================
create table properties (
  id uuid primary key default gen_random_uuid(),
  county text not null,
  parcel_id text,
  address_raw text not null,
  address_std text not null,
  city text,
  state text not null default 'MI',
  zip text,
  lat numeric,
  lng numeric,
  deal_score int not null default 0,
  first_hot_at timestamptz,
  last_scored_at timestamptz,
  score_breakdown jsonb,
  lead_status text not null default 'new',
  last_outreach_at timestamptz,
  source_first_seen_at timestamptz default now(),
  source_last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index idx_properties_parcel on properties (county, parcel_id) where parcel_id is not null;
create unique index idx_properties_address on properties (county, address_std) where parcel_id is null;
create index idx_properties_score on properties (deal_score desc);
create index idx_properties_status on properties (lead_status);

-- ============================================
-- TAX SIGNALS
-- ============================================
create table tax_signals (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  signal_type text not null,
  tax_year int,
  amount_due numeric,
  stage text,
  source_name text not null,
  source_url text,
  source_run_id uuid,
  source_run_date date,
  raw_excerpt text,
  created_at timestamptz default now()
);

create index idx_tax_signals_property on tax_signals (property_id);
create index idx_tax_signals_type on tax_signals (signal_type);

-- ============================================
-- TAX CONFIRMATIONS
-- ============================================
create table tax_confirmations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  confirmed_status text,
  delinquent_years text[],
  amount_due_total numeric,
  as_of_date date,
  source_name text,
  source_url text,
  raw_result jsonb default '{}',
  confirmed_at timestamptz default now()
);

create index idx_tax_confirmations_property on tax_confirmations (property_id);

-- ============================================
-- PROPSTREAM IMPORTS
-- ============================================
create table propstream_imports (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz default now(),
  filename text not null,
  row_count int not null default 0,
  raw_mapping jsonb
);

-- ============================================
-- PROPSTREAM RECORDS
-- ============================================
create table propstream_records (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references propstream_imports(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  address_raw text,
  city text,
  state text,
  zip text,
  parcel_id text,
  equity_percent numeric,
  estimated_value numeric,
  last_sale_date date,
  owner_occupied boolean,
  absentee_owner boolean,
  vacant boolean,
  tax_delinquent boolean,
  foreclosure_status text,
  raw_row jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_propstream_records_import on propstream_records (import_id);
create index idx_propstream_records_property on propstream_records (property_id);

-- ============================================
-- OWNER CONTACTS
-- ============================================
create table owner_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  owner_name text,
  mailing_address_raw text,
  mailing_address_std text,
  phone text,
  email text,
  contact_source text not null default 'propstream',
  confidence int not null default 50,
  created_at timestamptz default now()
);

create index idx_owner_contacts_property on owner_contacts (property_id);
create index idx_owner_contacts_phone on owner_contacts (phone);
create index idx_owner_contacts_mailing on owner_contacts (mailing_address_std);

-- ============================================
-- OUTREACH CAMPAIGNS
-- ============================================
create table outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null,
  template_id uuid,
  created_at timestamptz default now()
);

-- ============================================
-- OUTREACH QUEUE
-- ============================================
create table outreach_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references outreach_campaigns(id) on delete set null,
  property_id uuid not null references properties(id) on delete cascade,
  owner_contact_id uuid not null references owner_contacts(id) on delete cascade,
  channel text not null,
  status text not null default 'queued',
  scheduled_for timestamptz,
  sent_at timestamptz,
  result_notes text,
  created_at timestamptz default now()
);

create index idx_outreach_queue_status on outreach_queue (status, created_at desc);
create index idx_outreach_queue_campaign on outreach_queue (campaign_id);

-- ============================================
-- DO NOT CONTACT
-- ============================================
create table do_not_contact (
  id uuid primary key default gen_random_uuid(),
  phone text,
  email text,
  mailing_address_std text,
  reason text,
  created_at timestamptz default now()
);

create index idx_dnc_phone on do_not_contact (phone);
create index idx_dnc_email on do_not_contact (email);
create index idx_dnc_mailing on do_not_contact (mailing_address_std);

-- ============================================
-- DEAL ALERTS
-- ============================================
create table deal_alerts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  alert_type text not null,
  created_at timestamptz default now(),
  delivered boolean default false
);

create index idx_deal_alerts_property on deal_alerts (property_id);
create index idx_deal_alerts_delivered on deal_alerts (delivered) where delivered = false;

-- ============================================
-- MESSAGE TEMPLATES
-- ============================================
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null,
  subject text,
  body text not null,
  created_at timestamptz default now()
);

-- ============================================
-- SEED TEMPLATES
-- ============================================
insert into message_templates (name, channel, subject, body) values
(
  'Neighborly Introduction — Direct Mail',
  'direct_mail',
  'A Quick Note About Your Property',
  E'Hi {{owner_name}},\n\nMy name is {{your_name}}, and I live and work in the area. I recently came across your property at {{property_address}} and wanted to reach out personally.\n\nIf you have ever considered selling — now or sometime down the road — I would be happy to have a simple, no-pressure conversation.\n\nWarm regards,\n{{your_name}}\n{{phone}}'
),
(
  'Neighborly Introduction — SMS',
  'sms',
  null,
  'Hi {{owner_name}}, this is {{your_name}}. I came across your property on {{property_address}} and wanted to see if you might consider an offer. No pressure at all.'
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table properties enable row level security;
alter table tax_signals enable row level security;
alter table tax_confirmations enable row level security;
alter table propstream_imports enable row level security;
alter table propstream_records enable row level security;
alter table owner_contacts enable row level security;
alter table outreach_campaigns enable row level security;
alter table outreach_queue enable row level security;
alter table do_not_contact enable row level security;
alter table deal_alerts enable row level security;
alter table message_templates enable row level security;

-- Authenticated users can do everything (internal tool)
create policy "Authenticated full access" on properties for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on tax_signals for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on tax_confirmations for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on propstream_imports for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on propstream_records for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on owner_contacts for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on outreach_campaigns for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on outreach_queue for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on do_not_contact for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on deal_alerts for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on message_templates for all to authenticated using (true) with check (true);
