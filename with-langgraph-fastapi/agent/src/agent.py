"""
Attendance System Agent
"""

from typing import List, Optional
from datetime import datetime

from copilotkit import CopilotKitState
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import Command
from typing_extensions import Literal, TypedDict

from src.util import should_route_to_tool_node


class AttendanceEntry(TypedDict, total=False):
    id: int
    date_day: int
    date_month: int
    date_year: int
    day: str
    category: str
    state: str
    start_hour: Optional[int]
    start_minute: Optional[int]
    end_hour: Optional[int]
    end_minute: Optional[int]
    time_range: str
    working_system: str
    rest_minutes: int
    deductions: float
    working_time: float
    overtime: float
    late_night: float
    work_contents: str
    remarks: str


class AttendanceStats(TypedDict):
    total_entries: int
    total_working_hours: float
    total_overtime_hours: float
    total_late_night_hours: float
    total_deductions: float
    approved_count: int
    pending_count: int
    holiday_count: int


class AgentState(CopilotKitState):
    """Agent state for attendance system"""
    attendance_entries: List[AttendanceEntry]
    stats: AttendanceStats
    today_day: int
    today_month: int
    today_year: int


def format_entries_for_llm(entries: List[AttendanceEntry]) -> str:
    """Format entries for LLM context"""
    if not entries:
        return "No entries loaded yet. Use fetchAttendanceEntries to load attendance data."
    
    lines = []
    for entry in entries[:40]:
        date_str = f"{entry.get('date_year', 0)}-{entry.get('date_month', 0):02d}-{entry.get('date_day', 0):02d}"
        day = entry.get('day', '')
        category = entry.get('category', '') or '-'
        state = entry.get('state', '') or '-'
        
        start_h = entry.get('start_hour')
        start_m = entry.get('start_minute')
        end_h = entry.get('end_hour')
        end_m = entry.get('end_minute')
        
        start_time = f"{start_h:02d}:{start_m:02d}" if start_h is not None and start_m is not None else "-"
        end_time = f"{end_h:02d}:{end_m:02d}" if end_h is not None and end_m is not None else "-"
        
        working_time = entry.get('working_time', 0)
        overtime = entry.get('overtime', 0)
        system = entry.get('working_system', 'A')
        
        lines.append(
            f"  {date_str} ({day}): Category={category} | State={state} | "
            f"Time={start_time}-{end_time} | System={system} | Work={working_time}h | OT={overtime}h"
        )
    
    return "\n".join(lines)


async def chat_node(
    state: AgentState, config: RunnableConfig
) -> Command[Literal["tool_node", "__end__"]]:
    """
    Standard chat node based on the ReAct design pattern.
    """
    # print("=== Chat Node State ===")
    # from pprint import pprint
    # pprint(state)

    model = ChatOpenAI(model="meta/llama-3.1-8b-instruct", base_url="https://integrate.api.nvidia.com/v1", temperature=0.2, api_key="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")

    fe_tools = state.get("copilotkit", {}).get("actions", [])
    model_with_tools = model.bind_tools([*fe_tools])

    entries = state.get("attendance_entries", [])
    stats = state.get("stats", {})

    # --- Set today's date immutably on the backend ---
    now = datetime.now()
    today_day = now.day
    today_month = now.month
    today_year = now.year
    # ---

    system_message = SystemMessage(
        content=f"""You are an attendance management assistant for a Japanese company. You help users manage their 勤怠 (attendance) records.

## Today's Date
{today_year}-{today_month:02d}-{today_day:02d}

## Current Statistics
- Total Entries: {stats.get('total_entries', 0)}
- Total Working Hours: {stats.get('total_working_hours', 0):.2f}h
- Total Overtime Hours: {stats.get('total_overtime_hours', 0):.2f}h
- Total Late Night Hours: {stats.get('total_late_night_hours', 0):.2f}h
- Total Deductions: {stats.get('total_deductions', 0):.2f}h
- Approved Entries: {stats.get('approved_count', 0)}
- Pending Entries: {stats.get('pending_count', 0)}
- Holiday Entries: {stats.get('holiday_count', 0)}

## Current Attendance Entries ({len(entries)} records)
{format_entries_for_llm(entries)}

## Available Tools

1. **fetchAttendanceEntries** - Fetch attendance entries from the backend
   - Parameters: year (optional), month (optional), half ("first" or "second", optional), limit (default 30, max 40)
   - Use this when user wants to see their attendance data for a specific month and half.

2. **fetchAttendanceEntriesByDateRange** - Fetch attendance entries for a specific date range
   - Parameters: start_date (YYYY-MM-DD, required), end_date (YYYY-MM-DD, required), limit (default 30, max 40)
   - Use this when user wants to see their attendance data for a specific date range (e.g., "from January 1 to January 15").

3. **fetchAttendanceEntriesByLastNDays** - Fetch attendance entries for the last N days from a specific end date
   - Parameters: end_date (YYYY-MM-DD, required), days (number of days, required), limit (default 30, max 40)
   - Use this when user wants to see their attendance data for the last N days (e.g., "last 10 days").

4. **applyAttendance** - Apply for attendance (requires human approval)
   - Parameters: requests (array of objects)
   - Each request object needs:
     - date_day, date_month, date_year (required)
     - category: "通常" (normal work) or "休暇" (holiday) (required)
     - working_system: "A" (8:45-17:15), "B" (9:00-18:00), or "C" (7:00-16:00) - default is "A"
     - start_hour, start_minute, end_hour, end_minute (optional - uses system defaults if not provided)
     - work_contents (optional)
   - This will show the user a confirmation dialog before applying.

5. **setThemeColor** - Change the UI theme color
   - Parameters: themeColor (hex format, e.g., "#6366f1")
   - Use this when the user wants to customize the UI theme.

## Important Rules
- Cannot apply attendance for future dates
- Approved entries (承認済) cannot be modified
- For work entries (通常), always include time information
- For holiday entries (休暇), no time information is needed
- Default working system is "A" unless user specifies otherwise
- When user asks to "apply for today" or similar, calculate the correct date components

## Category Values
- "通常" = Normal work day
- "休暇" = Holiday/Leave

## State Values
- "未承認" = Pending approval
- "承認済" = Approved (cannot modify)

## Working Systems
- A: 8:45-17:15 (standard)
- B: 9:00-18:00 (late shift)
- C: 7:00-16:00 (early shift)

When summarizing or responding about attendance, be helpful and provide insights about working hours, overtime, and any entries that may need attention.
"""
    )

    response = await model_with_tools.ainvoke(
        [system_message, *state["messages"]],
        config,
    )

    tool_calls = response.tool_calls
    if tool_calls and should_route_to_tool_node(tool_calls, fe_tools):
        return Command(goto="tool_node", update={"messages": response})

    return Command(goto="__end__", update={"messages": response})


# Define the workflow graph
workflow = StateGraph(AgentState)
workflow.add_node("chat_node", chat_node)
workflow.add_node("tool_node", ToolNode(tools=[]))
workflow.add_edge("tool_node", "chat_node")
workflow.set_entry_point("chat_node")

checkpointer = MemorySaver()
graph = workflow.compile(checkpointer=checkpointer)