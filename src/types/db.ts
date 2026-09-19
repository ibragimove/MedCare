export type MatchStatus = "on_track" | "deviation";
export type UserRole = "doctor" | "nurse" | "patient" | "manager" | "admin";
export type TaskStatus = "new" | "accepted" | "confirmed" | "overdue" | "escalated" | "reassigned" | "reopened";
export type Severity = "routine" | "urgent" | "critical";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  village: string | null;
  nurse_id: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  phone: string | null;
  facility_id: string | null;
  created_at: string;
}

export interface Nurse {
  id: string;
  full_name: string;
  tuman: string;
  village: string;
  created_at: string;
}

export interface Facility {
  id: string;
  name: string;
  tuman: string;
  type: "hospital" | "clinic" | "phc";
  created_at: string;
}

export interface Territory {
  id: string;
  tuman: string;
  village: string;
  created_at: string;
}

export interface MedicationPlanItem {
  drug: string;
  dosage: string;
  times: string[];
  withFood: boolean;
  durationDays: number;
  instructions: string;
}

export interface MedicationPlan {
  items: MedicationPlanItem[];
  generalAdvice: string;
}

export interface Patient {
  id: string;
  full_name: string;
  tuman: string;
  village: string;
  diagnosis: string;
  drug_name: string;
  dosage: string;
  expected_days: number;
  discharge_date: string;
  assigned_nurse_id: string | null;
  profile_id: string | null;
  completed_at: string | null;
  medication_plan: MedicationPlan | null;
  expected_trajectory: string | null;
  checkin_questions: string[] | null;
  status: string;
  last_match_percent: number | null;
  last_status: MatchStatus | null;
  pinfl_enc: string | null;
  pinfl_last4: string | null;
  birth_date: string | null;
  territory_id: string | null;
  created_at: string;
  nurses?: Nurse | null;
}

export interface Discharge {
  id: string;
  patient_id: string;
  facility_id: string | null;
  doctor_id: string;
  epicrisis_raw: string;
  severity: Severity;
  icd10_code: string | null;
  discharge_date: string;
  created_at: string;
}

export interface AiSummary {
  id: string;
  discharge_id: string;
  deidentified_text: string | null;
  diagnosis: string | null;
  main_concerns: string[] | null;
  home_care_tasks: string[] | null;
  risk_score: number | null;
  brief_uz: string | null;
  checklist_uz: string[] | null;
  generated_at: string;
  model_version: string | null;
}

export interface CareTask {
  id: string;
  patient_id: string;
  discharge_id: string | null;
  nurse_id: string | null;
  status: TaskStatus;
  severity: Severity;
  sla_deadline: string;
  accepted_at: string | null;
  confirmed_at: string | null;
  overdue_at: string | null;
  escalated_at: string | null;
  visit_notes: string | null;
  created_at: string;
  updated_at: string;
  patients?: Pick<Patient, "full_name" | "tuman" | "village" | "diagnosis"> | null;
  ai_summaries?: AiSummary | null;
}

export interface Visit {
  id: string;
  care_task_id: string;
  nurse_id: string;
  patient_id: string;
  visited_at: string;
  checklist_done: string[] | null;
  notes: string | null;
  otp_verified: boolean;
  created_at: string;
}

export interface PatientOtp {
  id: string;
  patient_id: string;
  visit_id: string | null;
  otp_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface Escalation {
  id: string;
  care_task_id: string;
  from_nurse_id: string | null;
  to_manager_id: string | null;
  reason: string;
  resolved_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  profile_id: string | null;
  care_task_id: string | null;
  channel: "push" | "telegram" | "sms";
  message: string;
  sent_at: string;
  status: "sent" | "failed" | "delivered";
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export interface Checkin {
  id: string;
  patient_id: string;
  date: string;
  answers: Record<string, boolean>;
  match_percent: number;
  ai_recommendation: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  patient_id: string;
  reason: string;
  resolved: boolean;
  created_at: string;
  patients?: Pick<Patient, "full_name" | "tuman" | "village"> | null;
}

export interface DoseLog {
  id: string;
  patient_id: string;
  drug: string;
  scheduled_date: string;
  scheduled_time: string;
  taken_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  profile_id: string;
  patient_id: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface CallbackRequest {
  id: string;
  patient_id: string | null;
  profile_id: string | null;
  note: string | null;
  status: string;
  created_at: string;
}
