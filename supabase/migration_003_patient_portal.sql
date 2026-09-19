-- MedCare — migration_003_patient_portal.sql
-- Run in the Supabase SQL Editor AFTER migration_002_profiles.sql.
-- Adds the patient role, medication plans, dose tracking, AI chat, and callback requests.

-- 1) Allow role = 'patient'
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('doctor', 'nurse', 'patient'));
alter table profiles add column if not exists phone text;

-- 2) Link a care episode to the patient's own account + mark it finished
alter table patients add column if not exists profile_id uuid references profiles(id);
alter table patients add column if not exists completed_at timestamptz;
alter table patients add column if not exists medication_plan jsonb;

-- 3) Per-dose tracking
create table if not exists dose_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  drug text not null,
  scheduled_date date not null,
  scheduled_time text not null,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4) AI chat history (per patient account)
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  patient_id uuid references patients(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- 5) "Call me back" requests from the patient page
create table if not exists callback_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  profile_id uuid references profiles(id),
  note text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- Hackathon demo: RLS stays off everywhere; access is enforced in proxy.ts + API routes.
alter table dose_logs disable row level security;
alter table chat_messages disable row level security;
alter table callback_requests disable row level security;

alter publication supabase_realtime add table dose_logs, callback_requests;
