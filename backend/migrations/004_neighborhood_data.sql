-- Upside Tool Suite: Neighborhood data snapshots
-- Run this in the Supabase SQL editor (same project as the other Upside tables)

-- Stores the full PriceLabs neighborhood_data response as-is. Its percentile/time-series
-- structure is left as raw_data for now rather than flattened into columns, since it'll
-- be parsed later during report-building rather than queried directly.
create table if not exists neighborhood_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  pms_name text not null,
  region text not null,
  captured_at timestamptz default now(),
  raw_data jsonb
);

create index if not exists idx_neighborhood_snapshots_listing on neighborhood_snapshots (listing_id, pms_name);
create index if not exists idx_neighborhood_snapshots_region on neighborhood_snapshots (region);
