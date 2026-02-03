"use client";

import { useState, useMemo } from "react";
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
  onSuccess: (updatedEntries: any[]) => Promise<void>;
}

export function ApplyAttendanceCard({ 
  requests, 
  themeColor, 
  status, 
  respond, 
  onSuccess 
}: ApplyAttendanceCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse requests safely
  const safeRequests = useMemo(() => {
    let parsed: ApplyRequest[] = [];
    
    if (!requests) return parsed;
    
    if (Array.isArray(requests)) {
      parsed = requests.filter(req => req && typeof req === 'object' && req.date_day);
    } else if (typeof requests === 'object' && (requests as any).date_day) {
      parsed = [requests as unknown as ApplyRequest];
    }
    
    return parsed;
  }, [requests]);

  // Don't render if status is complete
  if (status === "complete") {
    return null;
  }

  // Show loading state while args are still streaming (empty but in progress)
  if (status === "inProgress" && safeRequests.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/20">
        <h3 className="text-xl font-bold text-black mb-4">Attendance Application</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-3 text-black/60">Loading request details...</span>
        </div>
      </div>
    );
  }

  // If we're executing but have no requests, something went wrong
  if (safeRequests.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/20">
        <h3 className="text-xl font-bold text-black mb-4">Attendance Application</h3>
        <p className="text-red-300 mb-4">No valid attendance requests received.</p>
        <div className="flex justify-end">
          <button
            onClick={() => respond?.({ status: "canceled", message: "No valid requests" })}
            className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const formatTime = (hour: number | undefined, minute: number | undefined) => {
    if (hour === undefined || minute === undefined) return "--:--";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const handleCancel = () => {
    console.log("Rejecting attendance application.");
    if (respond) {
      respond({ status: "canceled", message: "User rejected the attendance application" });
    }
  };

  const handleConfirm = async () => {
    console.log("Confirming attendance application:", safeRequests);
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onSuccess(safeRequests);
      
      if (respond) {
        respond({ 
          status: "approved", 
          message: `Successfully applied attendance for ${safeRequests.length} entries`,
          requests: safeRequests 
        });
      }
    } catch (err) {
      console.error("Error in handleConfirm:", err);
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/20">
      <h3 className="text-xl font-bold text-black mb-4">
        ✏️ Confirm Attendance Application
      </h3>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4">
          <p className="text-red-300 text-sm">❌ {error}</p>
        </div>
      )}

      <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
        {safeRequests.map((req, idx) => {
          const workingSystem = req.working_system || "A";
          const systemDefaults = SYSTEM_TIMES?.[workingSystem as keyof typeof SYSTEM_TIMES] || { start: "08:45", end: "17:15" };
          const startTime = formatTime(req.start_hour, req.start_minute);
          const endTime = formatTime(req.end_hour, req.end_minute);

          return (
            <div key={`${req.date_year}-${req.date_month}-${req.date_day}-${idx}`} className="bg-white/5 p-4 rounded-lg border border-white/10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-black font-semibold text-lg">
                    📅 {req.date_year}-{String(req.date_month).padStart(2, "0")}-{String(req.date_day).padStart(2, "0")}
                  </p>
                  <p className="text-black/70 text-sm mt-1">
                    {req.category === "通常" ? "🏢 Normal Work" : req.category === "休暇" ? "🏖️ Holiday" : `📋 ${req.category}`}
                  </p>
                </div>
                {req.category === "通常" && (
                  <div className="text-right bg-white/5 p-2 rounded-lg">
                    <p className="text-black/50 text-xs">
                      System {workingSystem} ({systemDefaults.start}-{systemDefaults.end})
                    </p>
                    <p className="text-black font-mono text-lg font-semibold">
                      ⏰ {startTime !== "--:--" ? startTime : systemDefaults.start} → {endTime !== "--:--" ? endTime : systemDefaults.end}
                    </p>
                  </div>
                )}
              </div>
              {req.work_contents && (
                <p className="text-black/60 text-sm mt-3 border-t border-white/10 pt-2">
                  📝 {req.work_contents}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end space-x-3 pt-2 border-t border-white/10">
        <button
          onClick={handleCancel}
          disabled={isSubmitting}
          className="px-5 py-2.5 bg-red-500/20 text-black-800 rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          ✖ Reject
        </button>
        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="px-5 py-2.5 text-white rounded-lg hover:opacity-90 transition-all border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg"
          style={{ backgroundColor: themeColor }}
        >
          {isSubmitting ? (
            <>
              <span className="animate-spin">⏳</span> Submitting...
            </>
          ) : (
            <>✓ Confirm</>
          )}
        </button>
      </div>
    </div>
  );
}
