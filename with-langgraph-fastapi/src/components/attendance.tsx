import { AgentState, AttendanceStats } from "@/lib/types";

export interface AttendanceCardProps {
  state: AgentState;
  stats: AttendanceStats;
}

export function AttendanceCard({ state, stats }: AttendanceCardProps) {
  const entries = state.attendance_entries || [];
  
  // Add default stats to handle undefined
  const safeStats: AttendanceStats = stats || {
    total_entries: 0,
    total_working_hours: 0,
    total_overtime_hours: 0,
    total_late_night_hours: 0,
    total_deductions: 0,
    approved_count: 0,
    pending_count: 0,
    holiday_count: 0,
  };


  const getCategoryColor = (category: string) => {
    if (category === "通常") return "bg-cyan-500/30 text-cyan-100";
    if (category === "休暇") return "bg-red-500/30 text-red-100";
    return "bg-gray-500/30 text-gray-300";
  };

  const getStateColor = (entryState: string) => {
    if (entryState === "承認済") return "bg-green-500/30 text-green-100";
    if (entryState === "未承認") return "bg-yellow-500/30 text-yellow-100";
    return "bg-gray-500/30 text-gray-300";
  };

  const getDayColor = (day: string) => {
    if (day === "土") return "text-blue-300 bg-blue-500/20";
    if (day === "日") return "text-red-300 bg-red-500/20";
    return "text-white/80 bg-white/10";
  };

  const formatTime = (time?: string) => {
    if (!time || time.length !== 4) return "-";
    return `${time.slice(0, 2)}:${time.slice(2)}`;
  };

  return (
    <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-xl w-full max-w-6xl">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white mb-1">
          勤怠管理
        </h1>
        <p className="text-white/60 text-sm">
          Attendance Management System
        </p>
        <p className="text-white/40 text-xs mt-1">
          Today: {state.today_year}-{String(state.today_month).padStart(2, "0")}-{String(state.today_day).padStart(2, "0")}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Entries" value={safeStats.total_entries} />
        <StatCard 
          label="Working Hours" 
          value={`${safeStats.total_working_hours.toFixed(1)}h`} 
        />
        <StatCard 
          label="Overtime" 
          value={`${safeStats.total_overtime_hours.toFixed(1)}h`}
          color="text-green-300"
        />
        <StatCard 
          label="Deductions" 
          value={`${safeStats.total_deductions.toFixed(1)}h`}
          color="text-red-300"
        />
        <StatCard 
          label="Approved" 
          value={safeStats.approved_count}
          color="text-green-300"
        />
        <StatCard 
          label="Pending" 
          value={safeStats.pending_count}
          color="text-yellow-300"
        />
        <StatCard 
          label="Holidays" 
          value={safeStats.holiday_count}
        />
        <StatCard 
          label="Late Night" 
          value={`${safeStats.total_late_night_hours.toFixed(1)}h`}
          color="text-purple-300"
        />
      </div>

      <hr className="border-white/10 my-4" />

      {/* Entries Table */}
      {entries.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-white/60 text-lg mb-2">No entries loaded</p>
          <p className="text-white/40 text-sm">
            Ask the assistant to "load my attendance entries"
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50 text-xs uppercase tracking-wider border-b border-white/10">
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Day</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-left">State</th>
                <th className="px-3 py-3 text-left">Start</th>
                <th className="px-3 py-3 text-left">End</th>
                <th className="px-3 py-3 text-right">Work</th>
                <th className="px-3 py-3 text-right">OT</th>
                <th className="px-3 py-3 text-center">Sys</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr
                  key={`${entry.date_year}-${entry.date_month}-${entry.date_day}-${entry.id ?? idx}`} 
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="px-3 py-2.5 text-white font-mono text-xs">
                    {entry.date}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${getDayColor(entry.day)}`}
                    >
                      {entry.day}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {entry.category ? (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(entry.category)}`}
                      >
                        {entry.category}
                      </span>
                    ) : (
                      <span className="text-white/30 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {entry.state ? (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getStateColor(entry.state)}`}
                      >
                        {entry.state}
                      </span>
                    ) : (
                      <span className="text-white/30 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-white/80 font-mono text-xs">
                    {formatTime(entry.start_time)}
                  </td>
                  <td className="px-3 py-2.5 text-white/80 font-mono text-xs">
                    {formatTime(entry.end_time)}
                  </td>
                  <td className="px-3 py-2.5 text-white font-mono text-xs text-right">
                    {entry.working_time > 0 ? `${entry.working_time}h` : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-green-300 font-mono text-xs text-right">
                    {entry.overtime > 0 ? `${entry.overtime}h` : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-white/60 font-mono text-xs text-center">
                    {entry.working_system}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {entries.length > 0 && (
        <div className="mt-4 text-center text-white/40 text-xs">
          Showing {entries.length} entries
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  color = "text-white" 
}: { 
  label: string; 
  value: string | number; 
  color?: string;
}) {
  return (
    <div className="bg-white/10 p-3 rounded-xl text-center">
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}