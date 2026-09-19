-- Migration 006: Continuity of Care MVP tables
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)

-- ─────────────────────────────────────────────
-- 1. Extend existing tables
-- ─────────────────────────────────────────────

-- Profiles: allow manager/admin roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('doctor', 'nurse', 'patient', 'manager', 'admin'));

-- Profiles: add facility_id and telegram_username
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS facility_id uuid,
  ADD COLUMN IF NOT EXISTS telegram_username text;

-- Patients: add PINFL encryption, birth_date, territory_id
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS pinfl_enc text,
  ADD COLUMN IF NOT EXISTS pinfl_last4 text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS territory_id uuid;

-- ─────────────────────────────────────────────
-- 2. Facilities
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facilities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  tuman       text NOT NULL,
  type        text NOT NULL DEFAULT 'hospital', -- hospital | clinic | phc
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 3. Territories (tuman → mahalla hierarchy)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS territories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tuman       text NOT NULL,
  village     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tuman, village)
);

-- ─────────────────────────────────────────────
-- 4. Discharges (epicrisis from hospital doctor)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discharges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  facility_id       uuid REFERENCES facilities(id),
  doctor_id         uuid NOT NULL,                -- profiles.id
  epicrisis_raw     text NOT NULL,               -- original free-text
  severity          text NOT NULL DEFAULT 'routine', -- routine | urgent | critical
  icd10_code        text,
  discharge_date    date NOT NULL DEFAULT current_date,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 5. AI Summaries (de-identified + structured extraction)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_summaries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discharge_id      uuid NOT NULL REFERENCES discharges(id) ON DELETE CASCADE,
  deidentified_text text,                        -- PII-stripped version
  diagnosis         text,
  main_concerns     text[],
  home_care_tasks   text[],
  risk_score        int CHECK (risk_score >= 0 AND risk_score <= 100),
  brief_uz          text,                        -- Uzbek brief for nurse
  checklist_uz      text[],                      -- visit checklist items
  generated_at      timestamptz NOT NULL DEFAULT now(),
  model_version     text DEFAULT 'gemini-3.5-flash-lite'
);

-- ─────────────────────────────────────────────
-- 6. Care Tasks (nurse visit tasks with state machine)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS care_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  discharge_id      uuid REFERENCES discharges(id),
  nurse_id          uuid,                        -- profiles.id (assigned nurse)
  status            text NOT NULL DEFAULT 'new', -- new | accepted | confirmed | overdue | escalated | reassigned | reopened
  severity          text NOT NULL DEFAULT 'routine',
  sla_deadline      timestamptz NOT NULL,
  accepted_at       timestamptz,
  confirmed_at      timestamptz,
  overdue_at        timestamptz,
  escalated_at      timestamptz,
  visit_notes       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 7. Visits (nurse actual visit records)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_task_id      uuid NOT NULL REFERENCES care_tasks(id) ON DELETE CASCADE,
  nurse_id          uuid NOT NULL,               -- profiles.id
  patient_id        uuid NOT NULL REFERENCES patients(id),
  visited_at        timestamptz NOT NULL DEFAULT now(),
  checklist_done    text[],                      -- completed checklist items
  notes             text,
  otp_verified      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 8. Patient OTPs (6-digit OTP for visit confirmation)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_otps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id          uuid REFERENCES visits(id),
  otp_hash          text NOT NULL,               -- bcrypt hash of 6-digit code
  expires_at        timestamptz NOT NULL,
  used_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 9. Escalations (escalation chain log)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_task_id      uuid NOT NULL REFERENCES care_tasks(id) ON DELETE CASCADE,
  from_nurse_id     uuid,                        -- profiles.id
  to_manager_id     uuid,                        -- profiles.id
  reason            text NOT NULL,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 10. Notifications (log of all outbound notifications)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid,                        -- recipient
  care_task_id      uuid REFERENCES care_tasks(id),
  channel           text NOT NULL,               -- push | telegram | sms
  message           text NOT NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'sent' -- sent | failed | delivered
);

-- ─────────────────────────────────────────────
-- 11. Audit Logs (immutable event log)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id          uuid,                        -- profiles.id (null = system)
  action            text NOT NULL,               -- e.g. task.accepted, task.escalated
  entity_type       text NOT NULL,               -- care_tasks | discharges | visits etc.
  entity_id         uuid NOT NULL,
  meta              jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 12. Settings (key-value system config)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Insert defaults
INSERT INTO settings (key, value) VALUES
  ('sla_routine_hours', '24'),
  ('sla_urgent_hours', '8'),
  ('sla_critical_hours', '4'),
  ('sla_time_scale', '1'),          -- 1 = real time; set to 60 for demo (1 min = 1 hr)
  ('otp_expiry_minutes', '30'),
  ('random_verify_percent', '10')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────
-- 13. Update care_tasks timestamp trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS care_tasks_updated_at ON care_tasks;
CREATE TRIGGER care_tasks_updated_at
  BEFORE UPDATE ON care_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- 14. Demo seed data: one facility + two territories
-- ─────────────────────────────────────────────
INSERT INTO facilities (id, name, tuman, type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Urganch viloyat shifoxonasi', 'Urganch', 'hospital'),
  ('00000000-0000-0000-0000-000000000002', 'Xiva tuman markaziy shifoxonasi', 'Xiva', 'hospital')
ON CONFLICT (id) DO NOTHING;

INSERT INTO territories (tuman, village) VALUES
  ('Urganch', 'Urganch shahri'),
  ('Urganch', 'Yangibozor'),
  ('Xiva', 'Xiva shahri'),
  ('Xiva', 'Shovot'),
  ('Bogʻot', 'Bogʻot shahri'),
  ('Gurlan', 'Gurlan shahri')
ON CONFLICT (tuman, village) DO NOTHING;

-- ─────────────────────────────────────────────
-- Demo manager profile (auth user menejer@demo.uz already created)
-- ─────────────────────────────────────────────
INSERT INTO profiles (id, role, full_name)
VALUES ('400ca1ff-57da-4765-afa6-daaa7a2e41ac', 'manager', 'Aziz Menejer')
ON CONFLICT (id) DO UPDATE SET role = 'manager', full_name = 'Aziz Menejer';
