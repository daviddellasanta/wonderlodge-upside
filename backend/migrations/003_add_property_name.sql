-- Upside Tool Suite: Add property_name to market_benchmarks
-- Run this in the Supabase SQL editor (same project as the other Upside tables)

alter table market_benchmarks
  add column if not exists property_name text;
