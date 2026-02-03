from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional, Literal
import uvicorn
from motor.motor_asyncio import AsyncIOMotorClient
import os
from random import choice, randint

app = FastAPI(title="Attendance System API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = "attendance_system"
client = None
db = None

# Working System Time Ranges
WORKING_SYSTEMS = {
    "A": "8:45-17:15",   # Standard hours
    "B": "9:00-18:00",   # Late shift
    "C": "7:00-16:00",   # Early shift
}

# Models
class AttendanceEntry(BaseModel):
    id: int
    date_day: int
    date_month: int
    date_year: int
    day: str
    category: Literal["通常", "休暇", ""] = ""
    state: Literal["", "未承認", "承認済"] = ""
    start_hour: Optional[int] = None
    start_minute: Optional[int] = None
    end_hour: Optional[int] = None
    end_minute: Optional[int] = None
    time_range: str = "8:45-17:15"
    working_system: Literal["A", "B", "C"] = "A"
    rest_minutes: int = 0
    deductions: float = 0.0
    working_time: float = 0.0
    overtime: float = 0.0
    late_night: float = 0.0
    work_contents: str = ""
    remarks: str = ""

class AttendancePeriodRequest(BaseModel):
    year: int
    month: int
    half: Literal["first", "second"]

class AttendanceDateRequest(BaseModel):
    date_day: int
    date_month: int
    date_year: int


class EmployeeInfo(BaseModel):
    name: str
    workplace: str

# Startup/Shutdown events
@app.on_event("startup")
async def startup_db_client():
    global client, db
    try:
        client = AsyncIOMotorClient(MONGODB_URL)
        db = client[DB_NAME]
        await db.command('ping')
        print(f"✅ Connected to MongoDB at {MONGODB_URL}")
    except Exception as e:
        print(f"⚠️ MongoDB connection failed: {e}")
        print("📝 Using in-memory storage instead")
        db = None

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()

# Helper Functions
def generate_realistic_times_with_variations(working_system: str) -> tuple[Optional[int], Optional[int], Optional[int], Optional[int]]:
    """Generate realistic start and end times with specific variations for human entry"""
    time_range = get_time_range_for_system(working_system)
    expected_start, expected_end = time_range.split('-')
    exp_start_hour, exp_start_min = int(expected_start.split(':')[0]), int(expected_start.split(':')[1])
    exp_end_hour, exp_end_min = int(expected_end.split(':')[0]), int(expected_end.split(':')[1])

    early_options = list(range(-30, 6))
    late_options = list(range(-5, 1))
    start_variation = choice(early_options + late_options)
    start_total_min = exp_start_hour * 60 + exp_start_min + start_variation
    start_hour = start_total_min // 60
    start_minute = start_total_min % 60

    end_variation_options = [-5, -3, -1, 0, 0, 0, 5, 10, 15, 30, 45, 60, 90, 120]
    end_variation = choice(end_variation_options)
    end_total_min = exp_end_hour * 60 + exp_end_min + end_variation
    end_hour = end_total_min // 60
    end_minute = end_total_min % 60

    return start_hour, start_minute, end_hour, end_minute

def get_time_period_status(date_obj: datetime) -> str:
    """Determine which time period the date falls into relative to today"""
    today = datetime.now().date()
    entry_date = date_obj.date()
    days_diff = (today - entry_date).days

    if days_diff >= 90:
        return "old"
    elif days_diff >= 10:
        return "approved"
    elif days_diff >= 3:
        return "pending"
    elif days_diff >= 1:
        return "system_only"
    else:
        return "empty"

def calculate_rest_time(start_hour: Optional[int], start_minute: Optional[int],
                        end_hour: Optional[int], end_minute: Optional[int],
                        working_system: str = "A") -> int:
    """Calculate rest time in minutes based on working hours and system"""
    if start_hour is None or start_minute is None or end_hour is None or end_minute is None:
        return 0

    try:
        rest = 0
        if start_hour < 13 or (start_hour == 13 and start_minute < 15):
            if end_hour > 12 or (end_hour == 12 and end_minute > 30):
                rest += 45

        time_range = get_time_range_for_system(working_system)
        expected_start, expected_end = time_range.split('-')
        exp_start_hour, exp_start_min = int(expected_start.split(':')[0]), int(expected_start.split(':')[1])
        exp_end_hour, exp_end_min = int(expected_end.split(':')[0]), int(expected_end.split(':')[1])

        if start_hour < exp_start_hour or (start_hour == exp_start_hour and start_minute < exp_start_min):
            morning_break = min(10, (exp_start_hour * 60 + exp_start_min) - (start_hour * 60 + start_minute))
            rest += max(0, morning_break)

        if end_hour > exp_end_hour or (end_hour == exp_end_hour and end_minute > exp_end_min):
            evening_break = min(15, (end_hour * 60 + end_minute) - (exp_end_hour * 60 + exp_end_min))
            rest += max(0, evening_break)

        return rest
    except:
        return 0

def calculate_standard_hours(working_system: str) -> float:
    """Calculate standard working hours based on system"""
    time_range = get_time_range_for_system(working_system)
    start, end = time_range.split('-')
    start_hour, start_min = map(int, start.split(':'))
    end_hour, end_min = map(int, end.split(':'))

    total_min = (end_hour * 60 + end_min) - (start_hour * 60 + start_min)
    return (total_min - 45) / 60

def calculate_times(entry: AttendanceEntry) -> AttendanceEntry:
    """Calculate working time, overtime, deductions, etc."""
    if entry.start_hour is None or entry.start_minute is None or entry.end_hour is None or entry.end_minute is None:
        return entry

    try:
        total_min = (entry.end_hour * 60 + entry.end_minute) - (entry.start_hour * 60 + entry.start_minute)

        entry.rest_minutes = calculate_rest_time(
            entry.start_hour, entry.start_minute,
            entry.end_hour, entry.end_minute,
            entry.working_system
        )

        entry.working_time = round((total_min - entry.rest_minutes) / 60, 2)

        standard_hours = calculate_standard_hours(entry.working_system)

        if entry.working_time < standard_hours:
            entry.deductions = round(standard_hours - entry.working_time, 2)
        else:
            entry.deductions = 0.0

        entry.overtime = round(max(0, entry.working_time - standard_hours), 2)

        if entry.end_hour >= 20:
            late_night_start = max(20 * 60, entry.start_hour * 60 + entry.start_minute)
            late_night_min = (entry.end_hour * 60 + entry.end_minute) - late_night_start
            if late_night_min > 0:
                entry.late_night = round(late_night_min / 60, 2)
            else:
                entry.late_night = 0.0
        else:
            entry.late_night = 0.0

    except Exception as e:
        print(f"Calculation error: {e}")

    return entry

def get_day_name_from_date(date_obj: datetime, lang: str = "ja") -> str:
    """Get day of week name from datetime object"""
    if lang == "ja":
        days = ["月", "火", "水", "木", "金", "土", "日"]
    else:
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return days[date_obj.weekday()]

def get_day_name(day: int, month: int, year: int, lang: str = "ja") -> str:
    """Get day of week name from int components"""
    date_obj = datetime(year, month, day)
    return get_day_name_from_date(date_obj, lang)

def get_time_range_for_system(system: str) -> str:
    """Get time range based on working system"""
    return WORKING_SYSTEMS.get(system, "8:45-17:15")

def generate_random_attendance_entry(date_obj: datetime, entry_id: int) -> AttendanceEntry:
    """Generate random attendance data for a date with different rules based on time period"""
    day_name = get_day_name_from_date(date_obj, "ja")
    is_weekend = day_name in ['土', '日']
    period_status = get_time_period_status(date_obj)

    category = ""
    state = ""
    start_hour = None
    start_minute = None
    end_hour = None
    end_minute = None
    working_system = "A"

    if is_weekend:
        category = "休暇"
        if period_status in ["old", "approved"]:
            state = "承認済"
        else:
            state = ""
    else:
        if period_status == "old":
            category = choice(['通常'])
            start_hour, start_minute, end_hour, end_minute = generate_realistic_times_with_variations(working_system)
            state = "承認済"

        elif period_status == "approved":
            category = choice(['通常'])
            start_hour, start_minute, end_hour, end_minute = generate_realistic_times_with_variations(working_system)
            state = "承認済"

        elif period_status == "pending":
            category = choice(['通常'])
            start_hour, start_minute, end_hour, end_minute = generate_realistic_times_with_variations(working_system)
            state = "未承認"

        elif period_status == "system_only":
            category = choice(['通常'])
            start_hour, start_minute, end_hour, end_minute = generate_realistic_times_with_variations(working_system)
            state = ""

        elif period_status == "empty":
            pass

    work_contents_options = [
        '',
        'プロジェクトA作業',
        '会議対応',
        '資料作成',
        '顧客対応',
        'システム開発',
    ]
    work_contents = choice(work_contents_options) if start_hour is not None else ""

    entry = AttendanceEntry(
        id=entry_id,
        date_day=date_obj.day,
        date_month=date_obj.month,
        date_year=date_obj.year,
        day=day_name,
        category=category,
        state=state,
        start_hour=start_hour,
        start_minute=start_minute,
        end_hour=end_hour,
        end_minute=end_minute,
        time_range=get_time_range_for_system(working_system),
        working_system=working_system,
        work_contents=work_contents,
    )

    if start_hour is not None and end_hour is not None:
        entry = calculate_times(entry)

    return entry

def generate_attendance_data(year: int, month: int, half: Literal["first", "second"]) -> List[AttendanceEntry]:
    """Generate attendance data for a half month period"""
    from calendar import monthrange
    _, days_in_month = monthrange(year, month)

    if half == "first":
        start_day = 1
        end_day = 15
    else:
        start_day = 16
        end_day = days_in_month

    entries = []
    entry_id = 1

    for day in range(start_day, end_day + 1):
        date_obj = datetime(year, month, day)
        today = datetime.now().date()
        entry_date = date_obj.date()

        if entry_date < today:
            entry = generate_random_attendance_entry(date_obj, entry_id)
        else:
            day_name = get_day_name(day, month, year, "ja")
            entry = AttendanceEntry(
                id=entry_id,
                date_day=day,
                date_month=month,
                date_year=year,
                day=day_name,
                category="",
                state="",
                start_hour=None,
                start_minute=None,
                end_hour=None,
                end_minute=None,
                time_range=get_time_range_for_system("A"),
                working_system="A",
            )

        entries.append(entry)
        entry_id += 1

    return entries

# Database Functions
async def get_attendance_from_db(year: int, month: int, half: str) -> List[AttendanceEntry]:
    """Get attendance data from MongoDB"""
    if db is None:
        return None

    try:
        key = f"{year}-{month:02d}-{half}"
        result = await db.attendance.find_one({"_id": key})

        if result and "entries" in result:
            return [AttendanceEntry(**entry) for entry in result["entries"]]
        return None
    except Exception as e:
        print(f"Error fetching from DB: {e}")
        return None

async def save_attendance_to_db(year: int, month: int, half: str, entries: List[AttendanceEntry]):
    """Save attendance data to MongoDB"""
    if db is None:
        return

    try:
        key = f"{year}-{month:02d}-{half}"
        await db.attendance.update_one(
            {"_id": key},
            {"$set": {"entries": [entry.dict() for entry in entries]}},
            upsert=True
        )
    except Exception as e:
        print(f"Error saving to DB: {e}")

# In-memory fallback storage
memory_storage = {}
employee_info = EmployeeInfo(name="山田太郎", workplace="東京本社")

# API Endpoints
@app.get("/")
def read_root():
    db_status = "connected" if db is not None else "in-memory"
    return {
        "message": "Attendance System API",
        "version": "2.0",
        "database": db_status
    }

@app.get("/api/employee")
async def get_employee() -> EmployeeInfo:
    """Get current employee information"""
    if db is not None:
        try:
            result = await db.employee.find_one({"_id": "current"})
            if result:
                return EmployeeInfo(**result["info"])
        except:
            pass
    return employee_info

@app.put("/api/employee")
async def update_employee(info: EmployeeInfo) -> EmployeeInfo:
    """Update employee information"""
    global employee_info
    employee_info = info

    if db is not None:
        try:
            await db.employee.update_one(
                {"_id": "current"},
                {"$set": {"info": info.dict()}},
                upsert=True
            )
        except:
            pass

    return employee_info

@app.post("/api/attendance/period")
async def get_attendance(request: AttendancePeriodRequest) -> List[AttendanceEntry]:
    """Get attendance data for a specific period"""
    if request.half not in ["first", "second"]:
        raise HTTPException(status_code=400, detail="Half must be 'first' or 'second'")

    entries = await get_attendance_from_db(request.year, request.month, request.half)

    if entries is not None:
        return entries

    key = f"{request.year}-{request.month:02d}-{request.half}"

    if key not in memory_storage:
        entries = generate_attendance_data(request.year, request.month, request.half)
        memory_storage[key] = entries
        await save_attendance_to_db(request.year, request.month, request.half, entries)

    return memory_storage[key]








def generate_attendance_data_by_date_range(start_date_str: str, end_date_str: str) -> List[AttendanceEntry]:
    """Generate attendance data for a specific date range"""
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d")

    entries = []
    entry_id = 1

    current_date = start_date
    while current_date <= end_date:
        date_obj = current_date
        today = datetime.now().date()
        entry_date = date_obj.date()

        if entry_date < today:
            entry = generate_random_attendance_entry(date_obj, entry_id)
        else:
            day_name = get_day_name_from_date(date_obj, "ja")
            entry = AttendanceEntry(
                id=entry_id,
                date_day=date_obj.day,
                date_month=date_obj.month,
                date_year=date_obj.year,
                day=day_name,
                category="",
                state="",
                start_hour=None,
                start_minute=None,
                end_hour=None,
                end_minute=None,
                time_range=get_time_range_for_system("A"),
                working_system="A",
            )

        entries.append(entry)
        entry_id += 1
        current_date += timedelta(days=1)

    return entries


async def save_attendance_to_db_by_date_range(start_date_str: str, end_date_str: str, entries: List[AttendanceEntry]):
    """Save attendance data to MongoDB for a specific date range"""
    if db is None:
        return

    try:
        key = f"{start_date_str}-{end_date_str}"
        await db.attendance.update_one(
            {"_id": key},
            {"$set": {"entries": [entry.dict() for entry in entries]}},
            upsert=True
        )
    except Exception as e:
        print(f"Error saving to DB: {e}")

async def get_attendance_from_db_by_date_range(start_date_str: str, end_date_str: str) -> List[AttendanceEntry]:
    """Get attendance data from MongoDB for a specific date range"""
    if db is None:
        return None

    try:
        key = f"{start_date_str}-{end_date_str}"
        result = await db.attendance.find_one({"_id": key})

        if result and "entries" in result:
            return [AttendanceEntry(**entry) for entry in result["entries"]]
        return None
    except Exception as e:
        print(f"Error fetching from DB: {e}")
        return None

async def get_attendance(period_request: AttendancePeriodRequest) -> List[AttendanceEntry]:
    """Get attendance data for a specific period"""
    entries = await get_attendance_from_db(period_request.year, period_request.month, period_request.half)

    if entries is not None:
        return entries

    key = f"{period_request.year}-{period_request.month:02d}-{period_request.half}"

    if key not in memory_storage:
        entries = generate_attendance_data(period_request.year, period_request.month, period_request.half)
        memory_storage[key] = entries
        await save_attendance_to_db(period_request.year, period_request.month, period_request.half, entries)

    return memory_storage[key]


class AttendanceDateRangeRequest(BaseModel):
    start_date: str
    end_date: str


@app.post("/api/attendance/date-range")
async def get_attendance_by_date_range(request: AttendanceDateRangeRequest) -> List[AttendanceEntry]:
    """Get attendance data for a specific date range"""
    try:
        start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
        end_date = datetime.strptime(request.end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date.")

    key = f"{request.start_date}-{request.end_date}"

    if key not in memory_storage:
        entries = generate_attendance_data_by_date_range(request.start_date, request.end_date)
        memory_storage[key] = entries
        await save_attendance_to_db_by_date_range(request.start_date, request.end_date, entries)

    return memory_storage[key]


@app.post("/api/attendance/date-range")
async def get_attendance_by_date_range(request: AttendanceDateRangeRequest) -> List[AttendanceEntry]:
    """Get attendance data for a specific date range"""
    try:
        start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
        end_date = datetime.strptime(request.end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date.")

    key = f"{request.start_date}-{request.end_date}"

    if key not in memory_storage:
        entries = generate_attendance_data_by_date_range(request.start_date, request.end_date)
        memory_storage[key] = entries
        await save_attendance_to_db_by_date_range(request.start_date, request.end_date, entries)

    return memory_storage[key]

class AttendanceLastNDaysRequest(BaseModel):
    end_date: str
    days: int

@app.post("/api/attendance/last-n-days")
async def get_attendance_by_last_n_days(request: AttendanceLastNDaysRequest) -> List[AttendanceEntry]:
    """Get attendance data for the last N days from a given end date"""
    try:
        end_date = datetime.strptime(request.end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if request.days <= 0:
        raise HTTPException(status_code=400, detail="Number of days must be positive.")

    start_date = end_date - timedelta(days=request.days - 1)

    key = f"{start_date.date()}-{end_date.date()}"

    if key not in memory_storage:
        entries = generate_attendance_data_by_date_range(str(start_date.date()), str(end_date.date()))
        memory_storage[key] = entries
        await save_attendance_to_db_by_date_range(str(start_date.date()), str(end_date.date()), entries)

    return memory_storage[key]


from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AttendanceUpdate(BaseModel):
    date_day: int
    date_month: int
    date_year: int
    category: Optional[str] = None
    state: Optional[str] = None
    start_hour: Optional[int] = None
    start_minute: Optional[int] = None
    end_hour: Optional[int] = None
    end_minute: Optional[int] = None
    work_contents: Optional[str] = None
    working_system: Optional[str] = None

@app.put("/api/attendance/update")
async def update_attendance(update: AttendanceUpdate) -> AttendanceEntry:
    """Update attendance entry for a specific date"""
    year = update.date_year
    month = update.date_month
    day = update.date_day
    half = "first" if day <= 15 else "second"

    period_request = AttendancePeriodRequest(year=year, month=month, half=half)
    entries = await get_attendance(period_request)

    updated_entry = None
    for entry in entries:
        if entry.date_day == day and entry.date_month == month and entry.date_year == year:
            if update.working_system is not None:
                entry.working_system = update.working_system
                entry.time_range = get_time_range_for_system(update.working_system)

            if update.category is not None:
                entry.category = update.category
            if update.state is not None:
                entry.state = update.state
            if update.start_hour is not None:
                entry.start_hour = update.start_hour
            if update.start_minute is not None:
                entry.start_minute = update.start_minute
            if update.end_hour is not None:
                entry.end_hour = update.end_hour
            if update.end_minute is not None:
                entry.end_minute = update.end_minute
            if update.work_contents is not None:
                entry.work_contents = update.work_contents

            if entry.start_hour is not None and entry.end_hour is not None:
                entry = calculate_times(entry)

            updated_entry = entry
            break

    if updated_entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")

    key = f"{year}-{month:02d}-{half}"
    memory_storage[key] = entries
    await save_attendance_to_db(year, month, half, entries)

    return updated_entry


@app.post("/api/attendance/register")
async def register_attendance(request: AttendanceDateRequest):
    """Register attendance for a specific date"""
    year = request.date_year
    month = request.date_month
    day = request.date_day
    half = "first" if day <= 15 else "second"

    period_request = AttendancePeriodRequest(year=year, month=month, half=half)
    entries = await get_attendance(period_request)

    for entry in entries:
        if entry.date_day == day and entry.date_month == month and entry.date_year == year:
            entry.category = "通常"
            entry.state = ""

            if entry.start_hour is None or entry.end_hour is None:
                start_hour, start_minute, end_hour, end_minute = generate_realistic_times_with_variations(entry.working_system)
                entry.start_hour = start_hour
                entry.start_minute = start_minute
                entry.end_hour = end_hour
                entry.end_minute = end_minute
                entry = calculate_times(entry)

            key = f"{year}-{month:02d}-{half}"
            memory_storage[key] = entries
            await save_attendance_to_db(year, month, half, entries)

            return {"message": "Registered successfully", "entry": entry}

    raise HTTPException(status_code=404, detail="Entry not found")

@app.post("/api/attendance/holiday")
async def register_holiday(request: AttendanceDateRequest):
    """Register holiday for a specific date"""
    year = request.date_year
    month = request.date_month
    day = request.date_day
    half = "first" if day <= 15 else "second"

    period_request = AttendancePeriodRequest(year=year, month=month, half=half)
    entries = await get_attendance(period_request)

    for entry in entries:
        if entry.date_day == day and entry.date_month == month and entry.date_year == year:
            entry.category = "休暇"
            entry.state = ""

            key = f"{year}-{month:02d}-{half}"
            memory_storage[key] = entries
            await save_attendance_to_db(year, month, half, entries)

            return {"message": "Holiday registered successfully", "entry": entry}

    raise HTTPException(status_code=404, detail="Entry not found")

@app.post("/api/attendance/approve")
async def approve_attendance(request: AttendanceDateRequest):
    """Approve attendance entry"""
    year = request.date_year
    month = request.date_month
    day = request.date_day
    half = "first" if day <= 15 else "second"

    period_request = AttendancePeriodRequest(year=year, month=month, half=half)
    entries = await get_attendance(period_request)

    for entry in entries:
        if entry.date_day == day and entry.date_month == month and entry.date_year == year:
            entry.state = "承認済"

            key = f"{year}-{month:02d}-{half}"
            memory_storage[key] = entries
            await save_attendance_to_db(year, month, half, entries)

            return {"message": "Approved successfully", "entry": entry}

    raise HTTPException(status_code=404, detail="Entry not found")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
