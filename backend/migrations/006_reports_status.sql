-- Upside Tool Suite: Add status/review columns to reports
-- Run this in the Supabase SQL editor (same project as the other Upside tables)

-- These columns are already used by GET /reports and PATCH /reports/:id/status
-- but were never captured in a migration file. Documented here (idempotent) so
-- the schema file matches what's actually deployed.
alter table reports
  add column if not exists status text default 'pending_review',
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;
