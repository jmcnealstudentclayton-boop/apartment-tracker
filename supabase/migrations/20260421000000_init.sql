-- Apartment Tracker Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ─── apartments ────────────────────────────────────────────────

create table if not exists apartments (
  id                       uuid primary key default gen_random_uuid(),
  source_url               text not null unique,
  source_domain            text,
  property_name            text,
  official_url             text,
  address_line1            text,
  city                     text,
  state                    text,
  zip                      text,
  phone                    text,
  rent_summary_text        text,
  sqft_summary_text        text,
  availability_summary_text text,
  raw_text                 text,
  last_fetched_at          timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- ─── units ─────────────────────────────────────────────────────

create table if not exists units (
  id                  uuid primary key default gen_random_uuid(),
  apartment_id        uuid not null references apartments(id) on delete cascade,
  floorplan_name      text,
  bedrooms            numeric,
  bathrooms           numeric,
  rent_min            numeric,
  rent_max            numeric,
  sqft_min            numeric,
  sqft_max            numeric,
  availability_status text,
  available_date      text,
  raw_text_summary    text,
  is_primary          boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── auto-update updated_at ────────────────────────────────────

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger apartments_updated_at
  before update on apartments
  for each row execute function update_updated_at();

create trigger units_updated_at
  before update on units
  for each row execute function update_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────
-- Single-user internal tool. RLS is enabled but allows full access
-- via the anon key. Keep your Supabase URL + anon key private.

alter table apartments enable row level security;
alter table units enable row level security;

create policy "allow_all_apartments" on apartments
  for all using (true) with check (true);

create policy "allow_all_units" on units
  for all using (true) with check (true);
