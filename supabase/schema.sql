-- MedCare — schema.sql
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).

create extension if not exists "pgcrypto";

create table if not exists nurses (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  village text not null,
  created_at timestamptz not null default now()
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  village text not null,
  diagnosis text not null,
  drug_name text not null,
  dosage text not null,
  expected_days integer not null,
  discharge_date date not null default current_date,
  assigned_nurse_id uuid references nurses(id),
  expected_trajectory text,
  checkin_questions jsonb,
  status text not null default 'active',
  last_match_percent integer,
  last_status text check (last_status in ('on_track', 'deviation')),
  created_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  date date not null default current_date,
  answers jsonb not null,
  match_percent integer not null,
  ai_recommendation text,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  reason text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Hackathon demo: no real auth yet, so RLS stays off and the anon key can
-- read directly for the realtime dashboard. Writes go through API routes
-- using the service role key. Do NOT ship this to production as-is.
alter table nurses disable row level security;
alter table patients disable row level security;
alter table checkins disable row level security;
alter table alerts disable row level security;

-- Enable realtime so the doctor dashboard updates live without a refresh.
alter publication supabase_realtime add table patients, checkins, alerts;
