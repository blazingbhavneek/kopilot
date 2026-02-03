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
    date: str
    day: str
    category: Literal["通常", "休暇", ""] = ""
    state: Literal["", "未承認", "承認済"] = ""
    start_time: str = ""
    end_time: str = ""
    time_range: str = "8:45-17:15"
    working_system: Literal["A", "B", "C"] = "A"
    rest_minutes: int = 0
    deductions: float = 0.0
    working_time: float = 0.0
    overtime: float = 0.0
    late_night: float = 0.0
    work_contents: str = ""
    remarks: str = ""

class AttendanceUpdate(BaseModel):
    date: str
    category: Optional[str] = None
    state: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    work_contents: Optional[str] = None
    working_system: Optional[str] = None

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
        # Test connection
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

# AFTER CHANGES
def generate_realistic_times_with_variations(working_system: str) -> tuple[str, str]:
    """Generate realistic start and end times with specific variations for human entry"""
    # Get base times for the system
    time_range = get_time_range_for_system(working_system)
    expected_start, expected_end = time_range.split('-')
    exp_start_hour, exp_start_min = int(expected_start.split(':')[0]), int(expected_start.split(':')[1])
    exp_end_hour, exp_end_min = int(expected_end.split(':')[0]), int(expected_end.split(':')[1])
    
    # Generate start time with specific variation for human entry 
    # More probability of coming early (-30min to +5min)
    early_options = list(range(-30, 6))  # -30 to -1 has higher chance
    late_options = list(range(-5, 1))   # -5 to 0 has normal chance
    # Combine options to give more weight to early arrivals
    start_variation = choice(early_options + late_options)
    start_total_min = exp_start_hour * 60 + exp_start_min + start_variation
    start_hour = start_total_min // 60
    start_min = start_total_min % 60
    start_time = f"{start_hour:02d}{start_min:02d}"
    
    # Generate end time with variation for overtime possibilities
    # More probability of overtime (-5min to +2 hours)
    end_variation_options = [-5, -3, -1, 0, 0, 0, 5, 10, 15, 30, 45, 60, 90, 120]
    end_variation = choice(end_variation_options)
    end_total_min = exp_end_hour * 60 + exp_end_min + end_variation
    end_hour = end_total_min // 60
    end_min = end_total_min % 60
    end_time = f"{end_hour:02d}{end_min:02d}"
    
    return start_time, end_time

def get_time_period_status(date_obj: datetime) -> str:
    """Determine which time period the date falls into relative to today"""
    today = datetime.now().date()
    entry_date = date_obj.date()
    
    # Calculate days difference
    days_diff = (today - entry_date).days
    
    if days_diff >= 90:  # -3 months or older
        return "old"
    elif days_diff >= 10:  # -3 months to -10 days
        return "approved"
    elif days_diff >= 3:  # -10 days to -3 days
        return "pending"
    elif days_diff >= 1:  # -3 days to yesterday
        return "system_only"
    else:  # Today
        return "empty"


# AFTER CHANGES
def generate_random_attendance_entry(date_obj: datetime, entry_id: int) -> AttendanceEntry:
    """Generate random attendance data for a date with different rules based on time period"""
    date_str = date_obj.strftime("%Y-%m-%d")
    day_name = get_day_name(date_str, "ja")
    
    # Determine if weekend
    is_weekend = day_name in ['土', '日']
    
    # Get time period status
    period_status = get_time_period_status(date_obj)
    
    # Set defaults
    category = ""
    state = ""
    start_time = ""
    end_time = ""
    working_system = "A"  # Default to System A as requested
    
    if is_weekend:
        # For all weekends regardless of time period, mark as holiday but not approved by admin
        category = "休暇"
        # Weekends remain unapproved as they require admin approval
        # For old/pending periods, we might want them unapproved; for others leave blank
        if period_status in ["old", "approved"]:
            state = "承認済"  # approved by admin
        else:
            state = ""  # For recent periods, no approval needed yet
    else:
        # It's a weekday, apply period-specific rules
        if period_status == "old":
            # -3 months to -10 days: System timing A with human input time matching system time (approved and non-editable)
            category = choice(['通常'])  # Work or work from home
            start_time, end_time = generate_realistic_times_with_variations(working_system)
            state = "承認済"  # Approved and non-editable
        
        elif period_status == "approved":
            # -3 months to -10 days: Same as old period
            category = choice(['通常'])  # Work or work from home
            start_time, end_time = generate_realistic_times_with_variations(working_system)
            state = "承認済"  # Approved and non-editable
        
        elif period_status == "pending":
            # -10 days to -3 days: Realistic human entry times, editable since not approved
            category = choice(['通常'])  # Work or work from home
            start_time, end_time = generate_realistic_times_with_variations(working_system)
            state = "未承認"  # Not approved, editable
        
        elif period_status == "system_only":
            # -3 days to yesterday: Only system-generated times, non-editable
            category = choice(['通常'])  # Work or work from home
            start_time, end_time = generate_realistic_times_with_variations(working_system)
            state = ""  # No approval status
        
        elif period_status == "empty":
            # Today: Fully empty since PC hasn't shut down yet
            pass  # Leave everything as default empty values
    
    # Random work contents (for applicable periods)
    work_contents_options = [
        '',
        'プロジェクトA作業',
        '会議対応',
        '資料作成',
        '顧客対応',
        'システム開発',
    ]
    work_contents = choice(work_contents_options) if start_time or end_time else ""
    
    entry = AttendanceEntry(
        id=entry_id,
        date=date_str,
        day=day_name,
        category=category,
        state=state,
        start_time=start_time,
        end_time=end_time,
        time_range=get_time_range_for_system(working_system),
        working_system=working_system,
        work_contents=work_contents,
    )
    
    # Calculate times if start and end are present
    if start_time and end_time:
        entry = calculate_times(entry)
    
    return entry

# AUTO DATA MAKER FLOW SECTION (Can be removed later)
# This section generates false data only when there is no data in MongoDB to pull from
async def check_and_generate_auto_data(year: int, month: int, half: str) -> bool:
    """Check if data exists in MongoDB and generate auto data if none exists"""
    existing_data = await get_attendance_from_db(year, month, half)
    
    if existing_data is None:
        # Generate auto data since no data exists in MongoDB
        entries = generate_attendance_data(year, month, half)
        await save_attendance_to_db(year, month, half, entries)
        return True  # Data was generated
    
    return False  # Data already existed, no need to generate

def get_day_name(date_str: str, lang: str = "ja") -> str:
    """Get day of week name"""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    if lang == "ja":
        days = ["月", "火", "水", "木", "金", "土", "日"]
    else:
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return days[date.weekday()]

def get_time_range_for_system(system: str) -> str:
    """Get time range based on working system"""
    return WORKING_SYSTEMS.get(system, "8:45-17:15")


def calculate_rest_time(start: str, end: str, working_system: str = "A") -> int:
    """Calculate rest time in minutes based on working hours and system"""
    if not start or not end:
        return 0
    
    try:
        start_hour = int(start[:2])
        start_min = int(start[2:])
        end_hour = int(end[:2])
        end_min = int(end[2:])
        
        rest = 0
        
        # Lunch break: 12:30-13:15 (45 min) - applies to all systems
        if start_hour < 13 or (start_hour == 13 and start_min < 15):
            if end_hour > 12 or (end_hour == 12 and end_min > 30):
                rest += 45
        
        # Get expected start and end times based on working system
        time_range = get_time_range_for_system(working_system)
        expected_start, expected_end = time_range.split('-')
        exp_start_hour, exp_start_min = int(expected_start.split(':')[0]), int(expected_start.split(':')[1])
        exp_end_hour, exp_end_min = int(expected_end.split(':')[0]), int(expected_end.split(':')[1])
        
        # Morning break before expected start time (up to 10 min)
        if start_hour < exp_start_hour or (start_hour == exp_start_hour and start_min < exp_start_min):
            morning_break = min(10, (exp_start_hour * 60 + exp_start_min) - (start_hour * 60 + start_min))
            rest += max(0, morning_break)
        
        # Evening break after expected end time (up to 15 min)
        if end_hour > exp_end_hour or (end_hour == exp_end_hour and end_min > exp_end_min):
            evening_break = min(15, (end_hour * 60 + end_min) - (exp_end_hour * 60 + exp_end_min))
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
    # Subtract standard lunch break (45 min)
    return (total_min - 45) / 60

def calculate_times(entry: AttendanceEntry) -> AttendanceEntry:
    """Calculate working time, overtime, deductions, etc."""
    if not entry.start_time or not entry.end_time:
        return entry
    
    try:
        # Parse times
        start_hour = int(entry.start_time[:2])
        start_min = int(entry.start_time[2:])
        end_hour = int(entry.end_time[:2])
        end_min = int(entry.end_time[2:])
        
        # Total time in minutes
        total_min = (end_hour * 60 + end_min) - (start_hour * 60 + start_min)
        
        # Rest time based on working system
        entry.rest_minutes = calculate_rest_time(entry.start_time, entry.end_time, entry.working_system)
        
        # Working time (hours)
        entry.working_time = round((total_min - entry.rest_minutes) / 60, 2)
        
        # Standard work time based on working system
        standard_hours = calculate_standard_hours(entry.working_system)
        
        # Deductions (negative if less than standard)
        if entry.working_time < standard_hours:
            entry.deductions = round(standard_hours - entry.working_time, 2)
        else:
            entry.deductions = 0.0
        
        # Overtime (only positive overtime counts)
        entry.overtime = round(max(0, entry.working_time - standard_hours), 2)
        
        # Late night work (after 20:00 / 8pm)
        if end_hour >= 20:
            late_night_start = max(20 * 60, start_hour * 60 + start_min)
            late_night_min = (end_hour * 60 + end_min) - late_night_start
            # Subtract any rest during late night period
            if late_night_min > 0:
                entry.late_night = round(late_night_min / 60, 2)
            else:
                entry.late_night = 0.0
        else:
            entry.late_night = 0.0
        
    except Exception as e:
        print(f"Calculation error: {e}")
    
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
        
        # If it's today, keep it empty
        # If it's in the past, generate random data
        if entry_date < today:
            entry = generate_random_attendance_entry(date_obj, entry_id)
        else:
            # Future dates or today - keep empty
            date_str = date_obj.strftime("%Y-%m-%d")
            day_name = get_day_name(date_str, "ja")
            entry = AttendanceEntry(
                id=entry_id,
                date=date_str,
                day=day_name,
                category="",
                state="",
                start_time="",
                end_time="",
                time_range=get_time_range_for_system("A"),
                working_system="A",
            )
        
        entries.append(entry)
        entry_id += 1
    
    return entries

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

async def update_attendance_entry_in_db(date: str, updates: dict):
    """Update a specific attendance entry in MongoDB"""
    if db is None:
        return
    
    try:
        # Find which period this date belongs to
        date_obj = datetime.strptime(date, "%Y-%m-%d")
        year = date_obj.year
        month = date_obj.month
        day = date_obj.day
        half = "first" if day <= 15 else "second"
        key = f"{year}-{month:02d}-{half}"
        
        # Build update query for the specific entry
        update_fields = {}
        for field, value in updates.items():
            update_fields[f"entries.$[elem].{field}"] = value
        
        await db.attendance.update_one(
            {"_id": key},
            {"$set": update_fields},
            array_filters=[{"elem.date": date}]
        )
    except Exception as e:
        print(f"Error updating entry in DB: {e}")

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

@app.get("/api/attendance/{year}/{month}/{half}")
async def get_attendance(year: int, month: int, half: str) -> List[AttendanceEntry]:
    """Get attendance data for a specific period"""
    if half not in ["first", "second"]:
        raise HTTPException(status_code=400, detail="Half must be 'first' or 'second'")
    
    # Try to get from MongoDB first
    entries = await get_attendance_from_db(year, month, half)
    
    if entries is not None:
        return entries
    
    # Generate historical data from last year to yesterday
    # Or use in-memory storage
    key = f"{year}-{month:02d}-{half}"
    
    if key not in memory_storage:
        entries = generate_attendance_data(year, month, half)
        memory_storage[key] = entries
        
        # Save to MongoDB if available
        await save_attendance_to_db(year, month, half, entries)
    
    return memory_storage[key]

@app.put("/api/attendance/{date}")
async def update_attendance(date: str, update: AttendanceUpdate) -> AttendanceEntry:
    """Update attendance entry for a specific date"""
    # Parse date to find the correct period
    date_obj = datetime.strptime(date, "%Y-%m-%d")
    year = date_obj.year
    month = date_obj.month
    day = date_obj.day
    half = "first" if day <= 15 else "second"
    
    # Get current entries
    entries = await get_attendance(year, month, half)
    
    # Find and update the entry
    updated_entry = None
    for entry in entries:
        if entry.date == date:
            # Update working_system first if provided (affects time_range)
            if update.working_system is not None:
                entry.working_system = update.working_system
                entry.time_range = get_time_range_for_system(update.working_system)
            
            # Update other fields
            if update.category is not None:
                entry.category = update.category
            if update.state is not None:
                entry.state = update.state
            if update.start_time is not None:
                entry.start_time = update.start_time
            if update.end_time is not None:
                entry.end_time = update.end_time
            if update.work_contents is not None:
                entry.work_contents = update.work_contents
            
            # Recalculate times only if both start and end time exist
            if entry.start_time and entry.end_time:
                entry = calculate_times(entry)
            
            updated_entry = entry
            break
    
    if updated_entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Save to storage
    key = f"{year}-{month:02d}-{half}"
    memory_storage[key] = entries
    await save_attendance_to_db(year, month, half, entries)
    
    return updated_entry

@app.post("/api/attendance/{date}/register")
async def register_attendance(date: str):
    """Register attendance for a specific date"""
    date_obj = datetime.strptime(date, "%Y-%m-%d")
    year = date_obj.year
    month = date_obj.month
    day = date_obj.day
    half = "first" if day <= 15 else "second"
    
    entries = await get_attendance(year, month, half)
    
    for entry in entries:
        if entry.date == date:
            entry.category = "通常"
            entry.state = ""
            
            # If no times are set, generate realistic default times based on working system
            if not entry.start_time or not entry.end_time:
                start_time, end_time = generate_realistic_times(entry.working_system)
                entry.start_time = start_time
                entry.end_time = end_time
                entry = calculate_times(entry)
            
            key = f"{year}-{month:02d}-{half}"
            memory_storage[key] = entries
            await save_attendance_to_db(year, month, half, entries)
            
            return {"message": "Registered successfully", "entry": entry}
    
    raise HTTPException(status_code=404, detail="Entry not found")

@app.post("/api/attendance/{date}/holiday")
async def register_holiday(date: str):
    """Register holiday for a specific date"""
    date_obj = datetime.strptime(date, "%Y-%m-%d")
    year = date_obj.year
    month = date_obj.month
    day = date_obj.day
    half = "first" if day <= 15 else "second"
    
    entries = await get_attendance(year, month, half)
    
    for entry in entries:
        if entry.date == date:
            entry.category = "休暇"
            entry.state = ""
            
            key = f"{year}-{month:02d}-{half}"
            memory_storage[key] = entries
            await save_attendance_to_db(year, month, half, entries)
            
            return {"message": "Holiday registered successfully", "entry": entry}
    
    raise HTTPException(status_code=404, detail="Entry not found")

@app.post("/api/attendance/{date}/approve")
async def approve_attendance(date: str):
    """Approve attendance entry"""
    date_obj = datetime.strptime(date, "%Y-%m-%d")
    year = date_obj.year
    month = date_obj.month
    day = date_obj.day
    half = "first" if day <= 15 else "second"
    
    entries = await get_attendance(year, month, half)
    
    for entry in entries:
        if entry.date == date:
            entry.state = "承認済"
            
            key = f"{year}-{month:02d}-{half}"
            memory_storage[key] = entries
            await save_attendance_to_db(year, month, half, entries)
            
            return {"message": "Approved successfully", "entry": entry}
    
    raise HTTPException(status_code=404, detail="Entry not found")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)