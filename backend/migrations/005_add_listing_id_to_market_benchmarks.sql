-- Upside Tool Suite: Add listing_id/pms_name to market_benchmarks
-- Run this in the Supabase SQL editor (same project as the other Upside tables)

-- Needed so report generation can look up the most recent market_benchmarks row
-- for a given listing directly, the same way neighborhood_snapshots already does.
alter table market_benchmarks
  add column if not exists listing_id text,
  add column if not exists pms_name text;

create index if not exists idx_market_benchmarks_listing on market_benchmarks (listing_id, pms_name);
