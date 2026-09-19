-- MedCare — migration_005_device_tokens.sql
-- Stores FCM device tokens for the Android app so alerts and dose reminders
-- can be pushed to the right person's phone.

create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now()
);

create index if not exists device_tokens_profile_id_idx on device_tokens(profile_id);

-- Hackathon demo: same as the other tables, access is enforced in API routes.
alter table device_tokens disable row level security;
