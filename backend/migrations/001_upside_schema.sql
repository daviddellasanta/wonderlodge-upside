-- Upside Tool Suite: Initial Schema
-- Run this in the Supabase SQL editor (existing Wonderlodge project)

-- Market-level comp data pulled from PriceLabs, per region, per period
create table if not exists market_benchmarks (
  id uuid primary key default gen_random_uuid(),
  region text not null,               -- e.g. 'Wimberley', 'Fredericksburg'
  period_start date not null,
  period_end date not null,
  occupancy_pct numeric,
  adr numeric,
  revpar numeric,
  source text default 'pricelabs',
  raw_data jsonb,                     -- full API response for reference/debugging
  created_at timestamptz default now()
);

-- Actual performance per managed property, pulled from OwnerRez
create table if not exists property_performance (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,          -- OwnerRez property ID
  property_name text,
  region text not null,
  period_start date not null,
  period_end date not null,
  occupancy_pct numeric,
  adr numeric,
  revpar numeric,
  revenue numeric,
  created_at timestamptz default now()
);

-- Historical snapshot of each generated owner report (Tool A)
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  period_start date not null,
  period_end date not null,
  metrics jsonb not null,             -- computed comparison metrics used in the report
  narrative text,                     -- Claude-generated copy
  pdf_url text,                       -- storage location once generated
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Per-competitor (larger PM) benchmark data, aggregated from AirDNA/Airbnb pulled lists
create table if not exists competitor_benchmarks (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,         -- e.g. 'Vacasa', 'Hill Country', 'Cozi'
  region text not null,
  period_start date not null,
  period_end date not null,
  occupancy_pct numeric,
  adr numeric,
  revpar numeric,
  listing_count int,                  -- how many of their listings the average is based on
  source text default 'airdna',
  created_at timestamptz default now()
);

-- Per-prospect gap analysis for outreach campaigns (Tool B)
create table if not exists gap_analyses (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null,              -- reference to outreach tool's lead/contact record
  listing_url text,
  property_address text,
  region text,
  current_occupancy_pct numeric,
  current_adr numeric,
  current_revenue numeric,
  market_potential_revenue numeric,
  gap_amount numeric,
  campaign_id text,
  created_at timestamptz default now()
);

-- Helpful indexes for the queries these tools will run most
create index if not exists idx_market_benchmarks_region_period on market_benchmarks (region, period_start);
create index if not exists idx_property_performance_property_period on property_performance (property_id, period_start);
create index if not exists idx_reports_property on reports (property_id);
create index if not exists idx_competitor_benchmarks_region_period on competitor_benchmarks (region, period_start);
create index if not exists idx_gap_analyses_lead on gap_analyses (lead_id);
