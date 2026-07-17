-- Upside Tool Suite: Properties reference table
-- Run this in the Supabase SQL editor (same project as the other Upside tables)

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,           -- PriceLabs listing_id
  pms_name text not null,             -- PMS name as registered in PriceLabs (e.g. 'ownerrez')
  property_name text,
  region text not null,               -- Wonderlodge region: Wimberley, Fredericksburg, Austin, Canyon Lake, Dripping Springs, Lakeway, Driftwood
  owner_name text,
  active boolean default true,
  created_at timestamptz default now(),
  unique (listing_id, pms_name)
);

create index if not exists idx_properties_listing on properties (listing_id, pms_name);
create index if not exists idx_properties_region on properties (region);
