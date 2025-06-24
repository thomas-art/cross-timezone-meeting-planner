import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapLocationPicker from './components/MapLocationPicker';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment-timezone';
import ct from 'countries-and-timezones';

const steps = [
  'Pick locations',
  'Calendar',
  'Time',
  'Finalize',
];

const localizer = momentLocalizer(moment);

// Example: hardcoded holidays for demonstration
const demoHolidays = [
  // Format: 'YYYY-MM-DD'
  '2024-07-04', // US Independence Day
  '2024-10-01', // China National Day
  '2024-12-25', // Christmas
];

const countryColors = [
  '#f87171', // red
  '#60a5fa', // blue
  '#34d399', // green
  '#fbbf24', // yellow
  '#a78bfa', // purple
  '#fb7185', // pink
  '#f472b6', // peach
  '#38bdf8', // cyan
  '#facc15', // gold
];

// 获取代表性IANA时区名
function getTimezoneByCountryCode(countryCode) {
  const country = ct.getCountry((countryCode || '').toUpperCase());
  if (country && country.timezones && country.timezones.length > 0) {
    return country.timezones[0]; // 多时区国家取第一个
  }
  return 'UTC';
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isHoliday(date) {
  const d = moment(date).format('YYYY-MM-DD');
  return demoHolidays.includes(d);
}

function isWorkday(date) {
  return !isWeekend(date) && !isHoliday(date);
}

// 计算当前视图涉及的所有年份
function getYearsInRange(start, end) {
  const years = new Set();
  if (!start || !end) return years;
  let d = new Date(start);
  while (d <= end) {
    years.add(d.getFullYear());
    d.setDate(d.getDate() + 1);
  }
  return years;
}

export default function App() {
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [currentStep, setCurrentStep] = useState(0); // Initial step is 0, start with location selection
  const [filterType, setFilterType] = useState('workday');
  const [holidaysByCountry, setHolidaysByCountry] = useState({});
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [calendarTz, setCalendarTz] = useState('UTC');
  const [calendarRange, setCalendarRange] = useState({ start: null, end: null });
  const [calendarView, setCalendarView] = useState('month');
  const holidaysCache = useRef({}); // { code: { year: holidays[] } }
  // Record last fetch key to avoid infinite loop
  const lastFetchKey = useRef('');
  const [selectedDate, setSelectedDate] = useState(null); // User selected date
  const [awakeStart, setAwakeStart] = useState(8); // Default awake start hour
  const [awakeEnd, setAwakeEnd] = useState(22); // Default awake end hour
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null); // User selected hour
  const [showResult, setShowResult] = useState(false); // Show result page or not

  // Get all selected country ISO2 codes and timezones
  const countryCodes = Array.from(new Set(selectedParticipants.map(p => p.iso2).filter(Boolean)));
  const timezones = Array.from(new Set(selectedParticipants.map(p => p.timezone.split(' ')[0]).filter(Boolean)));

  // Set default timezone to the first participant's timezone
  useEffect(() => {
    if (timezones.length > 0 && !timezones.includes(calendarTz)) {
      setCalendarTz(timezones[0]);
    }
  }, [timezones]);

  // Fetch holidays
  useEffect(() => {
    if (!calendarRange.start || !calendarRange.end || countryCodes.length === 0) return;
    const years = Array.from(getYearsInRange(calendarRange.start, calendarRange.end));
    const fetchKey = countryCodes.join(',') + '|' + years.join(',');
    if (lastFetchKey.current === fetchKey) return; // No change, do not fetch
    lastFetchKey.current = fetchKey;
    setLoadingHolidays(true);
    const fetchTasks = [];
    countryCodes.forEach(code => {
      if (!holidaysCache.current[code]) holidaysCache.current[code] = {};
      years.forEach(year => {
        if (!holidaysCache.current[code][year]) {
          fetchTasks.push(
            fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`)
              .then(res => res.ok ? res.json() : [])
              .then(data => { holidaysCache.current[code][year] = data; })
              .catch(() => { holidaysCache.current[code][year] = []; })
          );
        }
      });
    });
    Promise.all(fetchTasks).then(() => {
      // Merge all holidays for all countries and years
      const byCountry = {};
      countryCodes.forEach(code => {
        byCountry[code] = [];
        years.forEach(year => {
          if (holidaysCache.current[code][year]) {
            byCountry[code] = byCountry[code].concat(holidaysCache.current[code][year]);
          }
        });
      });
      setHolidaysByCountry(byCountry);
      setLoadingHolidays(false);
    });
  }, [calendarRange.start, calendarRange.end, countryCodes.join(',')]);

  // 监听日历视图和范围变化
  const handleRangeChange = useCallback((range, view) => {
    if (Array.isArray(range)) {
      // week/day view: range is array of dates
      setCalendarRange({ start: range[0], end: range[range.length - 1] });
    } else if (range && range.start && range.end) {
      // month view: range is {start, end}
      setCalendarRange({ start: range.start, end: range.end });
    }
  }, []);
  const handleViewChange = useCallback((view) => {
    setCalendarView(view);
  }, []);

  // 生成当前视图范围内所有日期
  const allDates = [];
  if (calendarRange.start && calendarRange.end) {
    let d = new Date(calendarRange.start);
    while (d <= calendarRange.end) {
      allDates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
  }

  // 判断某天是否所有国家都放假/都上班/都周末
  function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }
  function isHoliday(date) {
    const dstr = date.toISOString().slice(0, 10);
    return countryCodes.every(code =>
      (holidaysByCountry[code] || []).some(h => h.date === dstr)
    );
  }
  function isWorkday(date) {
    return countryCodes.every(code => {
      const dstr = date.toISOString().slice(0, 10);
      const isHol = (holidaysByCountry[code] || []).some(h => h.date === dstr);
      return !isHol && !isWeekend(date);
    });
  }

  // 过滤结果
  const filteredDates = allDates.filter(d => {
    if (filterType === 'workday') return isWorkday(d);
    if (filterType === 'weekend') return isWeekend(d);
    if (filterType === 'holiday') return isHoliday(d);
    return false;
  });

  // 日历 events：1. 各国节假日分别标注 2. 过滤结果高亮
  let events = [];
  // 1. 各国节假日
  countryCodes.forEach((code, idx) => {
    (holidaysByCountry[code] || []).forEach(h => {
      // 只渲染 type 为 'Public' 的节假日为"全体放假"，其他类型用不同颜色
      const isPublic = h.type === 'Public';
      // 节假日本地日期转为当前日历时区的区间
      // nager.at 的 date 是 'YYYY-MM-DD'，本地时区为 h.countryCode（不是 countyCode）
      const localStart = moment.tz(h.date, 'YYYY-MM-DD', getTimezoneByCountryCode(h.countryCode || code));
      const localEnd = localStart.clone().add(1, 'day');
      // 转为当前日历时区
      const start = localStart.clone().tz(calendarTz).toDate();
      const end = localEnd.clone().tz(calendarTz).toDate();
      // 判断是否在当前视图范围
      if (calendarRange.start && calendarRange.end && end > calendarRange.start && start < calendarRange.end) {
        events.push({
          title: `${code}: ${h.localName}`,
          start,
          end,
          allDay: true,
          resource: {
            type: isPublic ? 'countryHoliday' : 'otherHoliday',
            code,
            color: isPublic ? countryColors[idx % countryColors.length] : '#d1d5db',
            holidayType: h.type,
            description: h.name,
            localName: h.localName,
          },
        });
      }
    });
  });
  // 2. 过滤结果高亮
  filteredDates.forEach(d => {
    // 只在所有国家都为 type==='Public' 的节假日时才高亮"放假"
    let isAllPublicHoliday = false;
    if (filterType === 'holiday') {
      isAllPublicHoliday = countryCodes.every(code => {
        const dstr = moment(d).format('YYYY-MM-DD');
        return (holidaysByCountry[code] || []).some(h => h.date === dstr && h.type === 'Public');
      });
    }
    if (
      (filterType === 'holiday' && isAllPublicHoliday) ||
      (filterType === 'weekend' && isWeekend(d)) ||
      (filterType === 'workday' && isWorkday(d))
    ) {
      events.push({
        title: filterType === 'holiday' ? 'All: Holiday' : filterType === 'weekend' ? 'All: Weekend' : 'All: Workday',
        start: d,
        end: d,
        allDay: true,
        resource: { type: 'filter', filterType },
      });
    }
  });

  const handleAddParticipant = (participant) => {
    if (!selectedParticipants.some(p => p.id === participant.id)) {
      setSelectedParticipants([...selectedParticipants, participant]);
    }
  };

  const handleRemoveParticipant = (id) => {
    setSelectedParticipants(selectedParticipants.filter(p => p.id !== id));
  };

  // Initially set calendarRange to the current month
  useEffect(() => {
    if (!calendarRange.start || !calendarRange.end) {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);
      setCalendarRange({ start: startOfMonth, end: endOfMonth });
    }
  }, [calendarRange.start, calendarRange.end]);

  // Calculate all hours in a day when all participants are awake (in the current calendar timezone)
  function getCommonAwakeHours(date, tz = calendarTz) {
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const dt = moment(date).tz(tz).hour(h).minute(0).second(0);
      const allAwake = selectedParticipants.every(p => {
        const local = dt.clone().tz(p.timezone.split(' ')[0]);
        const hour = local.hour();
        return hour >= awakeStart && hour < awakeEnd;
      });
      if (allAwake) hours.push(h);
    }
    return hours;
  }

  // Calendar event click handler
  function handleSelectSlot(slotInfo) {
    if (slotInfo && slotInfo.start) {
      setSelectedDate(slotInfo.start);
      setShowTimeFilter(true);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-md z-10">
        <h1 className="text-2xl font-bold tracking-tight text-blue-700">Cross Timezone Meeting Planner</h1>
        <button className="px-4 py-2 rounded bg-red-100 text-red-700 font-semibold hover:bg-red-200 transition" onClick={() => setSelectedParticipants([])}>Reset</button>
      </header>

      {/* Step Tracker */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-20">
        <nav className="flex items-center space-x-4 bg-white rounded-full shadow-lg px-6 py-2">
          {steps.map((step, idx) => (
            <div key={step} className="flex items-center">
              <span className={
                idx === currentStep
                  ? 'text-blue-600 font-bold'
                  : 'text-gray-400'
              }>
                {idx + 1}. {step}
              </span>
              {idx < steps.length - 1 && (
                <span className="mx-2 text-gray-300">→</span>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center relative">
        <div className="w-full h-[80vh] flex items-center justify-center">
          {currentStep === 0 && (
            <MapLocationPicker onAddParticipant={handleAddParticipant} selectedParticipants={selectedParticipants} />
          )}
          {currentStep === 1 && (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <h2 className="text-xl font-bold text-blue-700 mb-4">Calendar & Time</h2>
              <div className="mb-4 flex space-x-2 items-center">
                <span className="font-semibold">Current Timezone:</span>
                <select
                  className="px-2 py-1 rounded border border-blue-200 bg-white text-blue-700 font-semibold"
                  value={calendarTz}
                  onChange={e => setCalendarTz(e.target.value)}
                >
                  {timezones.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                  {!timezones.includes('UTC') && <option value="UTC">UTC</option>}
                </select>
              </div>
              <div className="mb-4 flex space-x-2">
                <button
                  className={`px-4 py-2 rounded ${filterType === 'workday' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'} font-semibold`}
                  onClick={() => setFilterType('workday')}
                >
                  Common Workdays
                </button>
                <button
                  className={`px-4 py-2 rounded ${filterType === 'weekend' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'} font-semibold`}
                  onClick={() => setFilterType('weekend')}
                >
                  Common Weekends
                </button>
                <button
                  className={`px-4 py-2 rounded ${filterType === 'holiday' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'} font-semibold`}
                  onClick={() => setFilterType('holiday')}
                >
                  Common Holidays
                </button>
              </div>
              <div className="w-full max-w-4xl h-[600px] bg-white rounded-xl shadow-lg p-4">
                <Calendar
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: 500 }}
                  timeslots={1}
                  step={60}
                  views={['month', 'week', 'day']}
                  defaultView={calendarView}
                  onRangeChange={handleRangeChange}
                  onView={handleViewChange}
                  timeslotPropGetter={() => ({ style: { backgroundColor: '#f9fafb' } })}
                  eventPropGetter={(event) => {
                    if (event.resource?.type === 'countryHoliday') {
                      return { style: { backgroundColor: event.resource.color, color: 'white', borderRadius: 6, border: '1px solid #fff' }, title: `${event.title}\n${event.resource.localName} (${event.resource.holidayType})` };
                    }
                    if (event.resource?.type === 'otherHoliday') {
                      return { style: { backgroundColor: event.resource.color, color: '#374151', borderRadius: 6, border: '1px solid #fff', fontStyle: 'italic' }, title: `${event.title}\n${event.resource.localName} (${event.resource.holidayType})` };
                    }
                    if (event.resource?.type === 'filter') {
                      if (event.resource.filterType === 'holiday') {
                        return { style: { backgroundColor: '#f87171', color: 'white', borderRadius: 6, border: '2px solid #111' } };
                      }
                      if (event.resource.filterType === 'weekend') {
                        return { style: { backgroundColor: '#fbbf24', color: 'white', borderRadius: 6, border: '2px solid #111' } };
                      }
                      if (event.resource.filterType === 'workday') {
                        return { style: { backgroundColor: '#34d399', color: 'white', borderRadius: 6, border: '2px solid #111' } };
                      }
                    }
                    return {};
                  }}
                  selectable
                  onSelectSlot={slotInfo => {
                    // Only show modal when a single day is selected
                    if (slotInfo && slotInfo.start && slotInfo.end && moment(slotInfo.start).isSame(slotInfo.end, 'day')) {
                      setSelectedDate(slotInfo.start);
                      setShowTimeFilter(true);
                    }
                  }}
                  onDrillDown={date => {
                    // Prevent automatic view switch, show modal directly
                    setSelectedDate(date);
                    setShowTimeFilter(true);
                    return false;
                  }}
                />
              </div>
              <div className="mt-4 text-gray-500 text-sm">(Filter and highlight common workdays, weekends, or holidays. Each country's holidays are marked with different colors.)</div>
            </div>
          )}
        </div>
        {/* Floating panel for selected participants */}
        {currentStep === 0 && (
          <div className="fixed top-28 right-8 w-80 bg-white rounded-xl shadow-lg p-4 z-50 border border-blue-100" style={{zIndex: 9999}}>
            <h2 className="text-lg font-semibold mb-2 text-blue-700">Selected Participants</h2>
            {selectedParticipants.length === 0 ? (
              <div className="text-gray-400">No locations selected yet.</div>
            ) : (
              <ul className="space-y-2">
                {selectedParticipants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between bg-blue-50 rounded px-3 py-2">
                    <div>
                      <div className="font-medium text-blue-800">{p.name}</div>
                      <div className="text-xs text-blue-600">{p.timezone}</div>
                      <div className="text-xs text-gray-500">{p.time}</div>
                    </div>
                    <button className="ml-2 text-red-500 hover:text-red-700" onClick={() => handleRemoveParticipant(p.id)} title="Remove">&times;</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* Step navigation buttons */}
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex space-x-4 z-[99999]">
          {currentStep > 0 && (
            <button
              className="px-6 py-2 rounded bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition"
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              Previous
            </button>
          )}
          {currentStep < 1 && (
            <button
              className="px-6 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={currentStep === 0 && selectedParticipants.length === 0}
            >
              Next
            </button>
          )}
        </div>
        {/* Time filter modal */}
        {showTimeFilter && selectedDate && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[999999]">
            <div className="bg-white rounded-xl shadow-lg p-6 w-[500px] relative">
              <button className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-2xl" onClick={() => setShowTimeFilter(false)}>&times;</button>
              <h3 className="text-lg font-bold mb-2">Time Filter for {moment(selectedDate).format('YYYY-MM-DD')}</h3>
              <div className="mb-2 flex items-center space-x-2">
                <span>Progress bar timezone:</span>
                <select
                  className="px-2 py-1 rounded border border-blue-200 bg-white text-blue-700 font-semibold"
                  value={calendarTz}
                  onChange={e => setCalendarTz(e.target.value)}
                >
                  {timezones.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                  {!timezones.includes('UTC') && <option value="UTC">UTC</option>}
                </select>
              </div>
              <div className="mb-2">Awake range (local time for each participant):</div>
              <div className="flex space-x-2 mb-4">
                <label>Start:
                  <input type="number" min={0} max={23} value={awakeStart} onChange={e => setAwakeStart(Number(e.target.value))} className="ml-1 w-12 border rounded px-1" />
                </label>
                <label>End:
                  <input type="number" min={1} max={24} value={awakeEnd} onChange={e => setAwakeEnd(Number(e.target.value))} className="ml-1 w-12 border rounded px-1" />
                </label>
              </div>
              <div className="mb-2 font-semibold">All participants are awake at:</div>
              {/* Progress bar style awake time visualization, clickable */}
              <div className="flex flex-col items-center w-full mb-2">
                <div className="relative w-full h-8 bg-gray-200 rounded-full overflow-hidden flex items-center cursor-pointer">
                  {[...Array(24)].map((_, h) => {
                    const dt = moment(selectedDate).tz(calendarTz).hour(h).minute(0).second(0);
                    const allAwake = selectedParticipants.length > 0 && selectedParticipants.every(p => {
                      const local = dt.clone().tz(p.timezone.split(' ')[0]);
                      const hour = local.hour();
                      return hour >= awakeStart && hour < awakeEnd;
                    });
                    const isSelected = selectedHour === h;
                    return (
                      <div
                        key={h}
                        className={
                          `h-full ${allAwake ? (isSelected ? 'bg-pink-500' : 'bg-blue-500 hover:bg-pink-400') : 'bg-gray-300'} transition-all duration-200 ${allAwake ? 'cursor-pointer' : 'cursor-not-allowed'}`
                        }
                        style={{ width: '4.16%', minWidth: 8, borderRight: h < 23 ? '1px solid #fff' : undefined, opacity: allAwake ? 1 : 0.5, boxShadow: isSelected ? '0 0 8px 2px #f472b6' : undefined }}
                        title={`${h}:00`}
                        onClick={() => allAwake && setSelectedHour(h)}
                      />
                    );
                  })}
                  {/* Hour ticks */}
                  <div className="absolute top-full left-0 w-full flex justify-between text-xs text-gray-500 mt-1">
                    {[0, 6, 12, 18, 23].map(h => (
                      <span key={h} style={{ left: `${(h / 23) * 100}%`, position: 'absolute', transform: 'translateX(-50%)' }}>{h}:00</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {getCommonAwakeHours(selectedDate, calendarTz).length === 0 ? (
                  <span className="text-red-500">No common awake hours</span>
                ) : (
                  getCommonAwakeHours(selectedDate, calendarTz).map(h => (
                    <span key={h} className={`px-2 py-1 rounded font-mono ${selectedHour === h ? 'bg-pink-500 text-white' : 'bg-blue-100 text-blue-800'} cursor-pointer`} onClick={() => setSelectedHour(h)}>{h}:00</span>
                  ))
                )}
              </div>
              <button
                className="mt-2 px-6 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition w-full disabled:bg-gray-300 disabled:text-gray-500"
                onClick={() => { setShowTimeFilter(false); setShowResult(true); }}
                disabled={selectedHour === null}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
        {/* 结果页面：美化卡片式显示每个地区的本地时间 */}
        {showResult && selectedDate && selectedHour !== null && (
          <div className="fixed inset-0 bg-gradient-to-br from-blue-100 via-pink-100 to-yellow-100 flex items-center justify-center z-[999999]">
            <div className="bg-white/90 rounded-3xl shadow-2xl p-10 w-[600px] max-w-full relative flex flex-col items-center">
              <button className="absolute top-4 right-6 text-gray-400 hover:text-red-500 text-3xl" onClick={() => {
                setShowResult(false);
                setSelectedHour(null);
                setSelectedDate(null);
                setShowTimeFilter(false);
                setCurrentStep(0);
              }}>&times;</button>
              <h2 className="text-2xl font-extrabold text-pink-600 mb-6 tracking-wide drop-shadow">Meeting Local Times</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                {selectedParticipants.map((p, idx) => {
                  const refMoment = moment.tz(moment(selectedDate).format('YYYY-MM-DD'), calendarTz).hour(selectedHour).minute(0).second(0);
                  const local = refMoment.clone().tz(p.timezone.split(' ')[0]);
                  return (
                    <div key={p.id} className="rounded-2xl bg-gradient-to-br from-white via-blue-50 to-pink-50 shadow-lg p-6 flex flex-col items-center border-2 border-blue-200">
                      <div className="text-lg font-bold text-blue-700 mb-1 flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: countryColors[idx % countryColors.length] }}></span>
                        {p.name}
                      </div>
                      <div className="text-xs text-gray-500 mb-2">{p.timezone.split(' ')[0]}</div>
                      <div className="text-3xl font-mono text-pink-600 mb-2 drop-shadow">
                        {local.format('YYYY-MM-DD')}<br/>{local.format('HH:mm')}
                      </div>
                      <div className="text-sm text-gray-700">Local time</div>
                    </div>
                  );
                })}
              </div>
              <button className="mt-8 px-8 py-3 rounded-full bg-blue-600 text-white font-bold text-lg shadow hover:bg-blue-700 transition" onClick={() => {
                setShowResult(false);
                setSelectedHour(null);
                setSelectedDate(null);
                setShowTimeFilter(false);
                setCurrentStep(0);
              }}>Reset</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 