import type { Severity, TaskStatus } from "@/types/db";

// Shared by the nurse APIs and the nurse UI. Nothing here carries the PINFL or the OTP code.

export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

export interface NurseTaskPatient {
  id: string;
  full_name: string;
  tuman: string;
  village: string;
  address: string | null;
  phone: string | null;
  diagnosis: string;
}

// One row of the "Vazifalar" list.
export interface NurseTaskCard {
  id: string;
  patient_id: string;
  status: TaskStatus;
  severity: Severity;
  sla_deadline: string;
  accepted_at: string | null;
  confirmed_at: string | null;
  overdue_at: string | null;
  patients: NurseTaskPatient | null;
}

export interface NurseTasksResponse {
  tasks: NurseTaskCard[];
  serverNow: string;
}

export interface NurseTaskAi {
  brief_uz: string | null;
  risk_score: number | null;
  main_concerns: string[];
  home_care_tasks: string[];
  checklist_uz: string[];
}

export interface NurseTaskDetailResponse {
  task: Omit<NurseTaskCard, "patients"> & {
    visit_notes: string | null;
    /** Ticked checklist items, saved on the task so they survive a reload. */
    checklist_done: string[];
    /** false until migration_008 adds care_tasks.checklist_done — ticks then stay on this device only. */
    checklist_persisted: boolean;
  };
  patient: NurseTaskPatient & { birth_date: string | null; completed_at: string | null };
  medications: { drug_name: string; dosage: string }[];
  ai: NurseTaskAi | null;
  otp: {
    /** ISO time of the last code request, when one is still usable. */
    issuedAt: string | null;
    expiresAt: string | null;
    /** Seconds until a new code may be requested (0 = now). */
    cooldownSeconds: number;
    attemptsLeft: number;
    delivered: { portal: boolean; telegram: boolean };
  };
  serverNow: string;
}

export interface NurseProfileResponse {
  full_name: string;
  email: string | null;
  phone: string | null;
  tuman: string;
  villages: string[];
  telegram: { connected: boolean; linkPhone: string | null; botUsername: string | null };
  push: { devices: number };
}

export type NursePatientRow = {
  id: string;
  full_name: string;
  tuman: string;
  village: string;
  diagnosis: string;
  drug_name: string;
  dosage: string;
  completed_at: string | null;
  last_status: "on_track" | "deviation" | null;
  last_match_percent: number | null;
};

export type { Severity, TaskStatus };
