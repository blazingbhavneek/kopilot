"use client";

import { AttendanceCard } from "@/components/attendance";
import { ApplyAttendanceCard } from "@/components/apply-attendance";
import { AgentState, AttendanceEntry, AttendanceStats, ApplyRequest } from "@/lib/types";
import {
  useCoAgent,
  useFrontendTool,
  useHumanInTheLoop,
} from "@copilotkit/react-core";
import { CopilotKitCSSProperties, CopilotSidebar } from "@copilotkit/react-ui";
import { useState, useCallback } from "react";
import { useEffect } from "react";

const API_URL = "http://localhost:8000/api";

function calculateStats(entries: AttendanceEntry[]): AttendanceStats {
  return {
    total_entries: entries.length,
    total_working_hours: entries.reduce((sum, e) => sum + (e.working_time || 0), 0),
    total_overtime_hours: entries.reduce((sum, e) => sum + (e.overtime || 0), 0),
    total_late_night_hours: entries.reduce((sum, e) => sum + (e.late_night || 0), 0),
    total_deductions: entries.reduce((sum, e) => sum + (e.deductions || 0), 0),
    approved_count: entries.filter((e) => e.state === "承認済").length,
    pending_count: entries.filter((e) => e.state === "未承認").length,
    holiday_count: entries.filter((e) => e.category === "休暇").length,
  };
}

function transformEntry(entry: AttendanceEntry): AttendanceEntry {
  return {
    ...entry,
    date: `${entry.date_year}-${String(entry.date_month).padStart(2, "0")}-${String(entry.date_day).padStart(2, "0")}`,
    start_time:
      entry.start_hour !== null && entry.start_minute !== null
        ? `${String(entry.start_hour).padStart(2, "0")}${String(entry.start_minute).padStart(2, "0")}`
        : "",
    end_time:
      entry.end_hour !== null && entry.end_minute !== null
        ? `${String(entry.end_hour).padStart(2, "0")}${String(entry.end_minute).padStart(2, "0")}`
        : "",
  };
}

export default function CopilotKitPage() {
  const [themeColor, setThemeColor] = useState("#6366f1");

  useFrontendTool({
    name: "setThemeColor",
    description: "Set the UI theme color",
    parameters: [
      {
        name: "themeColor",
        description: "The theme color to set (hex format like #6366f1)",
        type: "string",
        required: true,
      },
    ],
    handler({ themeColor }) {
      setThemeColor(themeColor);
      return `Theme color changed to ${themeColor}`;
    },
  });

  return (
    <main
      style={
        { "--copilot-kit-primary-color": themeColor } as CopilotKitCSSProperties
      }
    >
      <CopilotSidebar
        disableSystemMessage={true}
        clickOutsideToClose={false}
        defaultOpen
        labels={{
          title: "勤怠アシスタン���",
          initial: "👋 こんにちは！勤怠管理をお手伝いします。",
        }}
        suggestions={[
          {
            title: "Load Entries",
            message: "Load my attendance entries for this month.",
          },
          {
            title: "Apply Today",
            message: "Apply attendance for today as normal work with system A.",
          },
          {
            title: "Apply Holiday",
            message: "Apply for a holiday yesterday.",
          },
          {
            title: "Check Hours",
            message: "What are my total working hours and overtime?",
          },
          {
            title: "Pending Review",
            message: "Show me entries that are pending approval.",
          },
          {
            title: "Summary",
            message: "Give me a summary of my attendance this period.",
          },
        ]}
      >
        <YourMainContent themeColor={themeColor} />
      </CopilotSidebar>
    </main>
  );
}

function YourMainContent({ themeColor }: { themeColor: string }) {
  // Initialize with static values first to avoid hydration mismatch
  const [todayInfo, setTodayInfo] = useState({
    day: 1,
    month: 1,
    year: 2025,
  });

  // Set actual date on client side only
  useEffect(() => {
    const now = new Date();
    setTodayInfo({
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
  }, []);

  const { state, setState: setAgentState } = useCoAgent<AgentState>({
    name: "attendance_agent",
    initialState: {
      attendance_entries: [],
      stats: {
        total_entries: 0,
        total_working_hours: 0,
        total_overtime_hours: 0,
        total_late_night_hours: 0,
        total_deductions: 0,
        approved_count: 0,
        pending_count: 0,
        holiday_count: 0,
      },
      today_day: 1,
      today_month: 1,
      today_year: 2025,
    },
  });

  // Update agent state when todayInfo changes (after client hydration)
  // Set actual date on client side only
// Set actual date on client side only
  useEffect(() => {
    const now = new Date();
    setTodayInfo({
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
  }, []);

  useEffect(() => {
    setAgentState((prev) => ({
      attendance_entries: prev?.attendance_entries || [],
      stats: prev?.stats || {
        total_entries: 0,
        total_working_hours: 0,
        total_overtime_hours: 0,
        total_late_night_hours: 0,
        total_deductions: 0,
        approved_count: 0,
        pending_count: 0,
        holiday_count: 0,
      },
      today_day: todayInfo.day,
      today_month: todayInfo.month,
      today_year: todayInfo.year,
    }));
  }, [todayInfo]);




  const updateEntriesAndStats = useCallback(
    (entries: AttendanceEntry[]) => {
      const transformedEntries = entries.map(transformEntry);
      const newStats = calculateStats(transformedEntries);
      setAgentState({
        ...state,
        attendance_entries: transformedEntries,
        stats: newStats,
      });
    },
    [state, setAgentState]
  );


useFrontendTool({
  name: "fetchAttendanceEntriesByDateRange",
  description:
    "Fetch attendance entries from the backend for a specific date range. Default limit is 30 entries, max 40.",
  parameters: [
    {
      name: "start_date",
      description: "Start date in YYYY-MM-DD format (e.g., '2026-01-01')",
      type: "string",
      required: true,
    },
    {
      name: "end_date",
      description: "End date in YYYY-MM-DD format (e.g., '2026-01-31')",
      type: "string",
      required: true,
    },
    {
      name: "limit",
      description: "Maximum number of entries to return (default 30, max 40)",
      type: "number",
      required: false,
    },
  ],
  handler: async ({ start_date, end_date, limit }) => {
    const fetchLimit = Math.min(limit || 30, 40);

    try {
      const response = await fetch(`${API_URL}/attendance/date-range`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date,
          end_date,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch attendance entries`);
      }

      let entries: AttendanceEntry[] = await response.json();
      entries = entries.slice(0, fetchLimit);

      updateEntriesAndStats(entries);

      const stats = calculateStats(entries.map(transformEntry));

      return `Successfully loaded ${entries.length} attendance entries from ${start_date} to ${end_date}. ` +
        `Stats: ${stats.total_working_hours.toFixed(1)}h worked, ${stats.total_overtime_hours.toFixed(1)}h overtime, ` +
        `${stats.approved_count} approved, ${stats.pending_count} pending, ${stats.holiday_count} holidays.`;
    } catch (error) {
      console.error("Error fetching entries:", error);
      return `Error fetching entries: ${error}`;
    }
  },
});


useFrontendTool({
  name: "fetchAttendanceEntriesByLastNDays",
  description:
    "Fetch attendance entries from the backend for the last N days from a given end date. Default limit is 30 entries, max 40.",
  parameters: [
    {
      name: "end_date",
      description: "End date in YYYY-MM-DD format (e.g., '2026-02-03')",
      type: "string",
      required: true,
    },
    {
      name: "days",
      description: "Number of days to fetch entries for (e.g., 10)",
      type: "number",
      required: true,
    },
    {
      name: "limit",
      description: "Maximum number of entries to return (default 30, max 40)",
      type: "number",
      required: false,
    },
  ],
  handler: async ({ end_date, days, limit }) => {
    const fetchLimit = Math.min(limit || 30, 40);

    try {
      const response = await fetch(`${API_URL}/attendance/last-n-days`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          end_date,
          days,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch attendance entries`);
      }

      let entries: AttendanceEntry[] = await response.json();
      entries = entries.slice(0, fetchLimit);

      updateEntriesAndStats(entries);

      const stats = calculateStats(entries.map(transformEntry));

      return `Successfully loaded ${entries.length} attendance entries for the last ${days} days ending on ${end_date}. ` +
        `Stats: ${stats.total_working_hours.toFixed(1)}h worked, ${stats.total_overtime_hours.toFixed(1)}h overtime, ` +
        `${stats.approved_count} approved, ${stats.pending_count} pending, ${stats.holiday_count} holidays.`;
    } catch (error) {
      console.error("Error fetching entries:", error);
      return `Error fetching entries: ${error}`;
    }
  },
});



  // Tool: Fetch attendance entries
  useFrontendTool({
    name: "fetchAttendanceEntries",
    description:
      "Fetch attendance entries from the backend. Default is last 30 entries, max 40. Can specify year, month, and half (first/second).",
    parameters: [
      {
        name: "year",
        description: "Year to fetch entries for (e.g., 2025)",
        type: "number",
        required: false,
      },
      {
        name: "month",
        description: "Month to fetch entries for (1-12)",
        type: "number",
        required: false,
      },
      {
        name: "half",
        description: "Which half of the month: 'first' (days 1-15) or 'second' (days 16-end)",
        type: "string",
        required: false,
      },
      {
        name: "limit",
        description: "Maximum number of entries to return (default 30, max 40)",
        type: "number",
        required: false,
      },
    ],
    handler: async ({ year, month, half, limit }) => {
      const fetchYear = year || todayInfo.year;
      const fetchMonth = month || todayInfo.month;
      const fetchHalf = half || (todayInfo.day <= 15 ? "first" : "second");

      const fetchLimit = Math.min(limit || 30, 40);

      try {
        const response = await fetch(`${API_URL}/attendance/period`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: fetchYear,
            month: fetchMonth,
            half: fetchHalf,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to fetch attendance entries`);
        }

        let entries: AttendanceEntry[] = await response.json();
        entries = entries.slice(0, fetchLimit);

        updateEntriesAndStats(entries);

        const stats = calculateStats(entries.map(transformEntry));
        
        return `Successfully loaded ${entries.length} attendance entries for ${fetchYear}/${fetchMonth} (${fetchHalf} half). ` +
          `Stats: ${stats.total_working_hours.toFixed(1)}h worked, ${stats.total_overtime_hours.toFixed(1)}h overtime, ` +
          `${stats.approved_count} approved, ${stats.pending_count} pending, ${stats.holiday_count} holidays.`;
      } catch (error) {
        console.error("Error fetching entries:", error);
        return `Error fetching entries: ${error}`;
      }
    },
  });


useHumanInTheLoop(
  {
    name: "applyAttendance",
    description: "Apply for attendance (work or holiday) for specific dates. Requires human approval before submission.",
    parameters: [
      {
        name: "requests",
        description: "Array of apply requests. Each object needs: date_day (int), date_month (int), date_year (int), category ('通常' for work or '休暇' for holiday), working_system (optional, 'A'/'B'/'C', default 'A'), start_hour (optional int), start_minute (optional int), end_hour (optional int), end_minute (optional int), work_contents (optional string)",
        type: "object[]",
        required: true,
      },
    ],
    render: ({ args, respond, status }) => {
      const safeRequests = Array.isArray(args.requests) ? args.requests : [];

      return (
        <ApplyAttendanceCard
          requests={safeRequests}
          themeColor={themeColor}
          status={status}
          respond={respond}
          onSuccess={async (updatedEntries) => {
            try {
              console.log("Updating entries:", updatedEntries);

              for (const entry of updatedEntries) {
                const response = await fetch(`${API_URL}/attendance/update`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(entry),
                });

                if (!response.ok) {
                  throw new Error(`Failed to update entry: ${await response.text()}`);
                }

                console.log("Updated entry response:", await response.json());
              }

              const existingEntries = [...state.attendance_entries];
              updatedEntries.forEach((updated) => {
                const idx = existingEntries.findIndex(
                  (e) =>
                    e.date_day === updated.date_day &&
                    e.date_month === updated.date_month &&
                    e.date_year === updated.date_year
                );
                if (idx >= 0) {
                  existingEntries[idx] = transformEntry(updated);
                } else {
                  existingEntries.push(transformEntry(updated));
                }
              });

              existingEntries.sort((a, b) => {
                const dateA = new Date(a.date_year, a.date_month - 1, a.date_day);
                const dateB = new Date(b.date_year, b.date_month - 1, b.date_day);
                return dateA.getTime() - dateB.getTime();
              });

              updateEntriesAndStats(existingEntries);
            } catch (error) {
              console.error("Error updating entries:", error);
            }
          }}
        />
      );
    },
  },
  [themeColor, state, updateEntriesAndStats]
);


  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="min-h-screen flex justify-center items-start py-8 px-4 transition-colors duration-300 overflow-auto"
    >
      <AttendanceCard state={state} stats={state.stats} />
    </div>
  );
}
