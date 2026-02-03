import { useState, useEffect, useRef } from 'react';

const translations = {
  ja: {
    title: '勤怠管理システム',
    employee: '従業員',
    workplace: '勤務地',
    dateRange: '期間',
    firstHalf: '前半',
    secondHalf: '後半',
    operations: '操作',
    register: '登録',
    holiday: '休暇',
    category: '区分',
    state: '状態',
    date: '日付',
    day: '曜日',
    startTime: '開始時刻',
    endTime: '終了時刻',
    time: '時間',
    workingSystem: '勤務体系',
    rest: '休憩',
    deductions: '控除',
    workingTime: '勤務時間',
    overtime: '残業',
    lateNight: '深夜',
    workContents: '作業内容',
    remarks: '備考',
    normal: '通常',
    remote: '在宅',
    holidayType: '休暇',
    approved: '承認済',
    pending: '未承認',
    minutes: '分',
    hours: '時間',
    mon: '月',
    tue: '火',
    wed: '水',
    thu: '木',
    fri: '金',
    sat: '土',
    sun: '日',
  },
  en: {
    title: 'Attendance Management System',
    employee: 'Employee',
    workplace: 'Workplace',
    dateRange: 'Date Range',
    firstHalf: 'First Half',
    secondHalf: 'Second Half',
    operations: 'Operations',
    register: 'Register',
    holiday: 'Holiday',
    category: 'Category',
    state: 'State',
    date: 'Date',
    day: 'Day',
    startTime: 'Start Time',
    endTime: 'End Time',
    time: 'Time',
    workingSystem: 'Work System',
    rest: 'Rest',
    deductions: 'Deductions',
    workingTime: 'Working Time',
    overtime: 'Overtime',
    lateNight: 'Late Night',
    workContents: 'Work Contents',
    remarks: 'Remarks',
    normal: 'Normal',
    remote: 'Remote',
    holidayType: 'Holiday',
    approved: 'Approved',
    pending: 'Pending',
    minutes: 'min',
    hours: 'h',
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  }
};

const API_URL = 'http://localhost:8000/api';

function App() {
  const [lang, setLang] = useState('ja');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [half, setHalf] = useState('first');
  const [attendanceData, setAttendanceData] = useState([]);
  const [employeeInfo, setEmployeeInfo] = useState({ name: '', workplace: '' });
  const [loading, setLoading] = useState(true);
  const inputRefs = useRef({});

  const t = translations[lang];

  useEffect(() => {
    loadData();
  }, [currentDate, half]);

const loadData = async () => {
  setLoading(true);
  try {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    const [attendanceRes, employeeRes] = await Promise.all([
      fetch(`${API_URL}/attendance/${year}/${month}/${half}`),
      fetch(`${API_URL}/employee`)
    ]);

    let attendance = await attendanceRes.json();
    const employee = await employeeRes.json();

    // Ensure entries with categories have pending state
    attendance = attendance.map(entry => ({
      ...entry,
      state: entry.category ? (entry.state || '未承認') : entry.state
    }));

    setAttendanceData(attendance);
    setEmployeeInfo(employee);
  } catch (error) {
    console.error('Error loading data:', error);
  } finally {
    setLoading(false);
  }
};

  const navigateHalf = (direction) => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      if (half === 'first') {
        newDate.setMonth(newDate.getMonth() - 1);
        setHalf('second');
      } else {
        setHalf('first');
      }
    } else {
      if (half === 'second') {
        newDate.setMonth(newDate.getMonth() + 1);
        setHalf('first');
      } else {
        setHalf('second');
      }
    }
    setCurrentDate(newDate);
  };

const handleRegister = async (date) => {
  // Check if date is today or future
  const today = new Date().toISOString().split('T')[0];
  if (new Date(date) > new Date(today)) {
    alert('Cannot apply for future dates');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/attendance/${date}/register`, { method: 'POST' });
    const result = await response.json();
    
    // Ensure state is set to pending after registration
    const updatedEntry = {
      ...result.entry,
      state: result.entry.state || '未承認' // Set to pending if not already set
    };
    
    // Update local state with the registered entry
    setAttendanceData(prevData => 
      prevData.map(entry => 
        entry.date === date 
          ? updatedEntry
          : entry
      )
    );
  } catch (error) {
    console.error('Error registering:', error);
  }
};

const handleHoliday = async (date) => {
  // Check if date is today or future
  const today = new Date().toISOString().split('T')[0];
  if (new Date(date) > new Date(today)) {
    alert('Cannot apply for future dates');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/attendance/${date}/holiday`, { method: 'POST' });
    const result = await response.json();
    
    // Ensure state is set to pending after holiday registration
    const updatedEntry = {
      ...result.entry,
      state: result.entry.state || '未承認' // Set to pending if not already set
    };
    
    // Update local state with the holiday entry
    setAttendanceData(prevData => 
      prevData.map(entry => 
        entry.date === date 
          ? updatedEntry
          : entry
      )
    );
  } catch (error) {
    console.error('Error registering holiday:', error);
  }
};

const handleInputChange = async (date, field, value) => {
  // Check if entry is approved
  const entry = attendanceData.find(e => e.date === date);
  if (entry?.state === '承認済') {
    alert('Cannot modify after approval');
    return;
  }
    
    try {
      // Update local state immediately to prevent focus loss and flickering
      setAttendanceData(prevData => 
        prevData.map(item => 
          item.date === date 
            ? { ...item, [field]: value }
            : item
        )
      );
      
      // Send update to server
      const response = await fetch(`${API_URL}/attendance/${date}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, [field]: value })
      });
      
      // Get the updated entry with calculated fields
      const updatedEntry = await response.json();
      
      // Update local state with calculated fields (without reloading everything)
      setAttendanceData(prevData => 
        prevData.map(item => 
          item.date === date 
            ? updatedEntry
            : item
        )
      );
    } catch (error) {
      console.error('Error updating:', error);
      // Reload data on error
      loadData();
    }
  };

  const formatDateRange = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    if (half === 'first') {
      return `${year}/${month}/1 - ${year}/${month}/15`;
    } else {
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}/${month}/16 - ${year}/${month}/${lastDay}`;
    }
  };

  const translateCategory = (category) => {
    if (!category) return '';
    const map = {
      '通常': t.normal,
      '在宅': t.remote,
      '休暇': t.holidayType,
    };
    return lang === 'ja' ? category : (map[category] || category);
  };

  const translateState = (state) => {
    if (!state) return '';
    const map = {
      '承認済': t.approved,
      '未承認': t.pending,
    };
    return lang === 'ja' ? state : (map[state] || state);
  };

  const translateDay = (day) => {
    const dayMap = {
      '月': t.mon, '火': t.tue, '水': t.wed,
      '木': t.thu, '金': t.fri, '土': t.sat, '日': t.sun
    };
    return dayMap[day] || day;
  };

  const getDayColor = (day) => {
    if (day === '土' || day === 'Sat') return 'text-blue-600 bg-blue-50';
    if (day === '日' || day === 'Sun') return 'text-red-600 bg-red-50';
    return '';
  };

  const getCategoryColor = (category) => {
    if (category === '通常' || category === 'Normal') return 'bg-cyan-100 text-cyan-800';
    if (category === '在宅' || category === 'Remote') return 'bg-yellow-100 text-yellow-800';
    if (category === '休暇' || category === 'Holiday') return 'bg-red-100 text-red-800';
    return '';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Internationalization Button Only */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
          className="px-6 py-3 bg-white border border-gray-300 rounded-lg text-black shadow-md hover:bg-gray-50 transition-all duration-300 font-mono text-sm font-medium"
        >
          {lang === 'ja' ? 'EN' : '日本語'}
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto p-8 pt-16">
        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-7 mb-6 border-l-4 border-primary">
          <div className="flex flex-wrap gap-6 items-center">
            {/* Date Range Navigation */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                {t.dateRange}
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigateHalf('prev')}
                  className="w-9 h-9 bg-primary text-black rounded-lg hover:bg-primary-dark transition-all duration-300 flex items-center justify-center text-lg font-bold shadow-md hover:-translate-y-0.5 hover:shadow-lg"
                >
                  ‹‹
                </button>
                <div className="bg-gray-50 px-4 py-2 rounded-lg font-mono text-base font-medium min-w-[200px] text-center text-gray-900">
                  {formatDateRange()}
                </div>
                <button
                  onClick={() => navigateHalf('next')}
                  className="w-9 h-9 bg-primary text-black rounded-lg hover:bg-primary-dark transition-all duration-300 flex items-center justify-center text-lg font-bold shadow-md hover:-translate-y-0.5 hover:shadow-lg"
                >
                  ››
                </button>
              </div>
            </div>

            {/* Employee Name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                {t.employee}
              </label>
              <div className="bg-gray-50 px-4 py-2 rounded-lg text-base text-gray-900">
                {employeeInfo.name}
              </div>
            </div>

            {/* Workplace */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                {t.workplace}
              </label>
              <div className="bg-gray-50 px-4 py-2 rounded-lg text-base text-gray-900">
                {employeeInfo.workplace}
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin mb-4"></div>
            <div className="text-gray-900">Loading...</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-primary-dark to-primary text-black">
                  <tr>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.operations}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.category}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.state}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.date}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.day}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.startTime}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.endTime}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.time}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.workingSystem}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.rest}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.deductions}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.workingTime}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.overtime}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.lateNight}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium border-r border-white/10 text-black">
                      {t.workContents}
                    </th>
                    <th className="px-3 py-4 text-left text-xs uppercase tracking-wider font-medium text-black">
                      {t.remarks}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {attendanceData.map((entry, idx) => {
                    const isApplied = !!entry.category; // Entry is applied if category exists
                    const isApproved = entry.state === '承認済';
                    const today = new Date().toISOString().split('T')[0];
                    const isTodayOrPast = new Date(entry.date) <= new Date(today);

                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-gray-200 hover:bg-gray-50 transition-colors bg-white"
                      >
                        {/* Operations */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          {isTodayOrPast && !isApproved ? (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleRegister(entry.date)}
                                className="px-4 py-2 bg-primary text-black rounded-md text-xs font-medium hover:bg-primary-dark transition-all duration-300 shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                              >
                                {t.register}
                              </button>
                              <button
                                onClick={() => handleHoliday(entry.date)}
                                className="px-4 py-2 bg-accent text-black rounded-md text-xs font-medium hover:bg-accent-light transition-all duration-300 shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                              >
                                {t.holiday}
                              </button>
                            </div>
                          ) : (
                            <div className="text-gray-400 text-xs italic">
                              {isApproved ? 'Approved' : 'Not available'}
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          {entry.category && (
                            <span className={`px-2.5 py-1 rounded text-xs font-medium ${getCategoryColor(entry.category)}`}>
                              {translateCategory(entry.category)}
                            </span>
                          )}
                        </td>

                        {/* State - Controlled by system, not user */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          {entry.state ? (
                            <span className={`px-2.5 py-1 rounded text-xs font-medium ${
                              entry.state === '承認済' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {translateState(entry.state)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs italic">-</span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="px-3 py-3.5 border-r border-gray-200 font-mono text-gray-900">
                          {entry.date}
                        </td>

                        {/* Day */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getDayColor(entry.day)}`}>
                            {translateDay(entry.day)}
                          </span>
                        </td>

                        {/* Start Time */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          <input
                            type="text"
                            value={entry.start_time}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                              handleInputChange(entry.date, 'start_time', value);
                            }}
                            placeholder={
                              entry.working_system === 'A' ? '0845' :
                              entry.working_system === 'B' ? '0900' :
                              entry.working_system === 'C' ? '0700' : '0845'
                            }
                            maxLength="4"
                            disabled={isApproved} // Disabled only when approved
                            className={`w-[70px] px-2 py-1.5 border border-gray-300 rounded text-center font-mono text-sm text-gray-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${
                              isApproved ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                          />
                        </td>

                        {/* End Time */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          <input
                            type="text"
                            value={entry.end_time}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                              handleInputChange(entry.date, 'end_time', value);
                            }}
                            placeholder={
                              entry.working_system === 'A' ? '1715' :
                              entry.working_system === 'B' ? '1800' :
                              entry.working_system === 'C' ? '1600' : '1715'
                            }
                            maxLength="4"
                            disabled={isApproved} // Disabled only when approved
                            className={`w-[70px] px-2 py-1.5 border border-gray-300 rounded text-center font-mono text-sm text-gray-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${
                              isApproved ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                          />
                        </td>

                        {/* Time Range - System controlled */}
                        <td className="px-3 py-3.5 border-r border-gray-200 font-mono text-sm text-gray-900">
                          {entry.time_range || '-'}
                        </td>

                        {/* Working System - Selectable */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          <select
                            value={entry.working_system}
                            onChange={(e) => handleInputChange(entry.date, 'working_system', e.target.value)}
                            disabled={isApproved} // Disabled only when approved
                            className={`w-full px-2 py-1.5 border border-gray-300 rounded text-center font-mono text-sm text-gray-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer ${
                              isApproved ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                            }`}
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        </td>

                        {/* Rest */}
                        <td className="px-3 py-3.5 border-r border-gray-200 text-right font-mono text-gray-900">
                          {entry.rest_minutes > 0 ? `${entry.rest_minutes}${t.minutes}` : ''}
                        </td>

                        {/* Deductions */}
                        <td className="px-3 py-3.5 border-r border-gray-200 text-right font-mono text-red-600 font-medium">
                          {entry.deductions > 0 ? `${entry.deductions}${t.hours}` : ''}
                        </td>

                        {/* Working Time */}
                        <td className="px-3 py-3.5 border-r border-gray-200 text-right font-mono font-medium text-gray-900">
                          {entry.working_time > 0 ? `${entry.working_time}${t.hours}` : ''}
                        </td>

                        {/* Overtime */}
                        <td className="px-3 py-3.5 border-r border-gray-200 text-right font-mono text-green-600 font-medium">
                          {entry.overtime > 0 ? `${entry.overtime}${t.hours}` : ''}
                        </td>

                        {/* Late Night */}
                        <td className="px-3 py-3.5 border-r border-gray-200 text-right font-mono text-green-600 font-medium">
                          {entry.late_night > 0 ? `${entry.late_night}${t.hours}` : ''}
                        </td>

                        {/* Work Contents */}
                        <td className="px-3 py-3.5 border-r border-gray-200">
                          <input
                            type="text"
                            value={entry.work_contents}
                            onChange={(e) => handleInputChange(entry.date, 'work_contents', e.target.value)}
                            disabled={isApproved} // Disabled only when approved
                            className={`w-full min-w-[150px] px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${
                              isApproved ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                          />
                        </td>

                        {/* Remarks */}
                        <td className="px-3 py-3.5 text-gray-600 text-sm">
                          {entry.remarks}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;