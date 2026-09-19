export interface ReportRow {
  key: string;
  label: string;
  tasks: number;
  slaPercent: number | null;
  medianAcceptMinutes: number | null;
  overdue: number;
  escalated: number;
}
