-- MedCare — migration_002_profiles.sql
-- Run in the Supabase SQL Editor AFTER schema.sql / seed.sql.
-- Adds role-based accounts (doctor / nurse) on top of Supabase Auth.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('doctor', 'nurse')),
  full_name text not null,
  village text,
  nurse_id uuid references nurses(id),
  telegram_chat_id text,
  created_at timestamptz not null default now()
);

-- Hackathon demo: RLS stays off (consistent with the rest of the schema).
-- Role access is enforced in application code (proxy.ts + API routes) instead.
alter table profiles disable row level security;

alter publication supabase_realtime add table profiles;
