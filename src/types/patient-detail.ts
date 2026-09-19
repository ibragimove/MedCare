import type {
  AiSummary,
  Alert,
  CallbackRequest,
  CareTask,
  Checkin,
  Discharge,
  DoseLog,
  MatchStatus,
  MedicationPlan,
  PatientMedication,
  UserRole,
  Visit,
} from "@/types/db";

// Payload of GET /api/patients/[id] — the same shape for every role that may open a patient.
export interface PatientDetailData {
  role: UserRole;
  patient: {
    id: string;
    full_name: string;
    tuman: string;
    village: string;
    territory_id: string | null;
    phone: string | null;
    address: string | null;
    birth_date: string | null;
    /** Only the last 4 digits are ever exposed; the encrypted value never leaves the server. */
    pinfl_last4: string | null;
    diagnosis: string;
    drug_name: string;
    dosage: string;
    expected_days: number;
    discharge_date: string;
    completed_at: string | null;
    expected_trajectory: string | null;
    medication_plan: MedicationPlan | null;
    last_match_percent: number | null;
    last_status: MatchStatus | null;
    created_at: string;
    assigned_nurse_id: string | null;
    has_account: boolean;
  };
  nurse: { id: string; full_name: string; phone: string | null; tuman: string; village: string } | null;
  /** null when migration_008 has not been applied (legacy single drug lives on the patient). */
  medications: PatientMedication[] | null;
  checkins: Checkin[];
  doseLogs: DoseLog[];
  alerts: Alert[];
  tasks: (CareTask & { visits: Visit[] })[];
  discharges: (Discharge & { ai_summaries: AiSummary[] })[];
  callbacks: CallbackRequest[];
}
