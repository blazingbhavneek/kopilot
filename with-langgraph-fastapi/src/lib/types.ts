// State of the agent, make sure this aligns with your agent's state.
export interface AttendanceEntry {
  id: number;
  date_day: number;
  date_month: number;
  date_year: number;
  day: string;
  category: string;
  state: string;
  start_hour: number | null;
  start_minute: number | null;
  end_hour: number | null;
  end_minute: number | null;
  time_range: string;
  working_system: string;
  rest_minutes: number;
  deductions: number;
  working_time: number;
  overtime: number;
  late_night: number;
  work_contents: string;
  remarks: string;
  // Display fields computed on frontend
  date?: string;
  start_time?: string;
  end_time?: string;
}

export interface AttendanceStats {
  total_entries: number;
  total_working_hours: number;
  total_overtime_hours: number;
  total_late_night_hours: number;
  total_deductions: number;
  approved_count: number;
  pending_count: number;
  holiday_count: number;
}

export interface AgentState {
  attendance_entries: AttendanceEntry[];
  stats: AttendanceStats;
  today_day: number;
  today_month: number;
  today_year: number;
}

export interface ApplyRequest {
  date_day: number;
  date_month: number;
  date_year: number;
  category: "通常" | "休暇";
  working_system: string;
  start_hour?: number;
  start_minute?: number;
  end_hour?: number;
  end_minute?: number;
  work_contents?: string;
}