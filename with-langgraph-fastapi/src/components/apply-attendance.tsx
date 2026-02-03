import { SYSTEM_TIMES } from "@/lib/constants";

interface ApplyRequest {
  date_day: number;
  date_month: number;
  date_year: number;
  category: string;
  working_system?: string;
  start_hour?: number;
  start_minute?: number;
  end_hour?: number;
  end_minute?: number;
  work_contents?: string;
}

interface ApplyAttendanceCardProps {
  requests: ApplyRequest[];
  themeColor: string;
  status: string;
  respond?: (response: any) => void;
  onSuccess: (updatedEntries: any[]) => void;
}

export function ApplyAttendanceCard({ requests, themeColor, status, respond, onSuccess }: ApplyAttendanceCardProps) {
  const safeRequests = Array.isArray(requests) ? requests : [];

  const formatTime = (hour: number | undefined, minute: number | undefined) => {
    if (hour === undefined || minute === undefined) return "--:--";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const handleCancel = () => {
    console.log("Rejecting attendance application.");
    respond?.({ status: "canceled" });
  };

  const handleConfirm = async () => {
    console.log("Confirming attendance application:", safeRequests);
    respond?.({ status: "approved", requests: safeRequests });
    try {
      onSuccess(safeRequests);
    } catch (error) {
      console.error("Error in onSuccess:", error);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/20">
      <h3 className="text-xl font-bold text-white mb-4">Confirm Attendance Application</h3>

      <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
        {safeRequests.map((req, idx) => {
          const workingSystem = req.working_system || "A";
          const systemDefaults = SYSTEM_TIMES[workingSystem as keyof typeof SYSTEM_TIMES] || SYSTEM_TIMES.A;
          const startTime = formatTime(req.start_hour, req.start_minute);
          const endTime = formatTime(req.end_hour, req.end_minute);

          return (
            <div key={idx} className="bg-white/5 p-3 rounded-lg border border-white/10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-medium">
                    {req.date_year}-{String(req.date_month).padStart(2, "0")}-{String(req.date_day).padStart(2, "0")}
                  </p>
                  <p className="text-white/60 text-xs">
                    {req.category === "通常" ? "Work" : "Holiday"}
                  </p>
                </div>
                {req.category === "通常" && (
                  <div className="text-right">
                    <p className="text-white/80 text-sm">
                      {workingSystem} System: {systemDefaults.start} - {systemDefaults.end}
                    </p>
                    <p className="text-white font-mono text-sm">
                      {startTime} - {endTime}
                    </p>
                  </div>
                )}
              </div>
              {req.work_contents && (
                <p className="text-white/70 text-xs mt-2">
                  Contents: {req.work_contents}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end space-x-3">
        <button
          onClick={handleCancel}
          className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30"
        >
          Reject
        </button>
        <button
          onClick={handleConfirm}
          className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors border border-white/20"
          style={{ backgroundColor: themeColor }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
