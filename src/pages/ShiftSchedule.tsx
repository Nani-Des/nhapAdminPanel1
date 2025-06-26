import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { useHospital } from '../contexts/HospitalContext';
import Layout from '../components/layout/Layout';
import ShiftTable from '../components/ui/ShiftTable';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { collection, addDoc, onSnapshot, query, where, getDoc, doc, getDocs, Timestamp, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Schedule, Users } from '../types';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import toast from 'react-hot-toast';

interface ShiftTiming {
  Morning: { Start: string; End: string };
  Afternoon: { Start: string; End: string };
  Evening: { Start: string; End: string };
}

interface CustomShift {
  date: Date;
  shift: string;
}

interface Leave {
  startDate: Date;
  endDate: Date;
  type: string;
}

const ShiftSchedule: React.FC = () => {
  const { users, departments } = useHospital();
  const hospitalId = users[0]?.['Hospital ID'] || 'hospital1';
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [userSchedules, setUserSchedules] = useState<Record<string, Schedule | null>>({});
  const [doctorShifts, setDoctorShifts] = useState<Record<string, Record<string, string>>>({});
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [shiftTimings, setShiftTimings] = useState<ShiftTiming | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDoctorsLoading, setIsDoctorsLoading] = useState(false);
  const [selectedShift, setSelectedShift] = useState<string>('MS');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  useEffect(() => {
    if (users.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const initialSchedules: Record<string, Schedule | null> = {};
    users.forEach((user) => {
      initialSchedules[user.id] = null;
    });
    setUserSchedules(initialSchedules);

    const fetchHospitalData = async () => {
      try {
        const hospitalDoc = await getDoc(doc(db, 'Hospitals', hospitalId));
        if (hospitalDoc.exists()) {
          setShiftTimings(hospitalDoc.data()['Shift Timings'] as ShiftTiming || {
            Morning: { Start: '08:00', End: '14:00' },
            Afternoon: { Start: '14:00', End: '20:00' },
            Evening: { Start: '20:00', End: '08:00' },
          });
        }
      } catch (e) {
        console.error('Error fetching hospital data:', e);
      }
    };

    const holidayUnsub = onSnapshot(collection(db, 'Holidays'), (snapshot) => {
      setHolidays(snapshot.docs.map(doc => doc.data().Date.toDate()));
    }, (error) => {
      console.error('Error fetching holidays:', error);
    });

    const unsubs: (() => void)[] = [];
    users.forEach((user) => {
      // Listen to schedule changes for each user
      const scheduleRef = collection(db, 'Users', user.id, 'Schedule');
      const unsubSchedule = onSnapshot(scheduleRef, (snapshot) => {
        const updated = { ...userSchedules };
        if (snapshot.empty) {
          // Create default schedule if none exists
          const defaultSchedule: Schedule = {
            Shift: 1, // Default to whole day shifts
            'Active Days': 5,
            'Off Days': 2,
            'Shift Switch': 5,
            'Shift Start': Timestamp.fromDate(new Date())
          };
          setDoc(doc(scheduleRef), defaultSchedule)
            .then(() => {
              updated[user.id] = defaultSchedule;
              setUserSchedules(updated);
            })
            .catch(console.error);
        } else {
          updated[user.id] = snapshot.docs[0].data() as Schedule;
          setUserSchedules(updated);
        }
        fetchDoctorSchedules();
      }, (error) => {
        console.error(`Error fetching schedule for user ${user.id}:`, error);
      });
      unsubs.push(unsubSchedule);

      // Listen to custom shifts
      const customShiftsQuery = query(
        collection(db, 'Users', user.id, 'CustomShifts'),
        where('Date', '>=', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)),
        where('Date', '<', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))
      );
      const unsubCustom = onSnapshot(customShiftsQuery, () => {
        fetchDoctorSchedules();
      }, (error) => {
        console.error(`Error fetching custom shifts for user ${user.id}:`, error);
      });
      unsubs.push(unsubCustom);

      // Listen to leaves
      const leavesQuery = query(
        collection(db, 'Users', user.id, 'Leaves'),
        where('StartDate', '<=', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0)),
        where('EndDate', '>=', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1))
      );
      const unsubLeaves = onSnapshot(leavesQuery, () => {
        fetchDoctorSchedules();
      }, (error) => {
        console.error(`Error fetching leaves for user ${user.id}:`, error);
      });
      unsubs.push(unsubLeaves);
    });

    fetchHospitalData();
    setLoading(false);

    return () => unsubs.forEach(unsub => unsub());
  }, [users, selectedMonth]);

  const fetchDoctorSchedules = async () => {
  setIsDoctorsLoading(true);
  const newDoctorShifts: Record<string, Record<string, string>> = {};

  for (const user of filteredUsers) {
    try {
      // Get the user's schedule from Firebase
      const scheduleSnapshot = await getDocs(collection(db, 'Users', user.id, 'Schedule'));
      const schedule = scheduleSnapshot.empty ? null : scheduleSnapshot.docs[0].data() as Schedule;

      // Ensure we have the latest schedule data
      if (!userSchedules[user.id] && schedule) {
        setUserSchedules(prev => ({ ...prev, [user.id]: schedule }));
      }

      if (schedule) {
        const shifts = await generateShiftSchedule(
          schedule['Active Days'] || 5,
          schedule['Off Days'] || 2,
          schedule['Shift Switch'] || 5,
          schedule.Shift || 1,
          schedule['Shift Start'] ? schedule['Shift Start'].toDate() : new Date(),
          user.id
        );
        newDoctorShifts[user.id] = shifts;
      } else {
        // If no schedule exists, create a default one
        const defaultSchedule = {
          Shift: 1,
          'Active Days': 5,
          'Off Days': 2,
          'Shift Switch': 5,
          'Shift Start': Timestamp.fromDate(new Date())
        };
        await setDoc(doc(collection(db, 'Users', user.id, 'Schedule')), defaultSchedule);
        const shifts = await generateShiftSchedule(5, 2, 5, 1, new Date(), user.id);
        newDoctorShifts[user.id] = shifts;
        setUserSchedules(prev => ({ ...prev, [user.id]: defaultSchedule }));
      }
    } catch (e) {
      console.error(`Error generating schedule for ${user.id}:`, e);
      newDoctorShifts[user.id] = {};
    }
  }

  setDoctorShifts(newDoctorShifts);
  detectConflicts(newDoctorShifts);
  setIsDoctorsLoading(false);
};

  const generateShiftSchedule = async (
    activeDays: number,
    offDays: number,
    shiftSwitch: number,
    shiftType: number,
    shiftStart: Date,
    userId: string
  ): Promise<Record<string, string>> => {
    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    const schedule: Record<string, string> = {};

    // Fetch custom shifts
    const customShiftsQuery = query(
      collection(db, 'Users', userId, 'CustomShifts'),
      where('Date', '>=', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)),
      where('Date', '<', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))
    );
    const customShiftsSnapshot = await getDocs(customShiftsQuery);
    const customShiftMap: Record<string, string> = {};
    customShiftsSnapshot.forEach(doc => {
      const date = doc.data().Date.toDate();
      customShiftMap[date.getDate().toString()] = doc.data().Shift || 'WD';
    });

    // Fetch leaves
    const leavesQuery = query(
      collection(db, 'Users', userId, 'Leaves'),
      where('StartDate', '<=', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), daysInMonth)),
      where('EndDate', '>=', new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1))
    );
    const leavesSnapshot = await getDocs(leavesQuery);
    const leaveDays: Date[] = [];
    leavesSnapshot.forEach(doc => {
      const start = doc.data().StartDate.toDate();
      const end = doc.data().EndDate.toDate();
      for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        if (day.getMonth() === selectedMonth.getMonth() && day.getFullYear() === selectedMonth.getFullYear()) {
          leaveDays.push(new Date(day));
        }
      }
    });

    const cycleLength = activeDays + offDays;

    for (let i = 1; i <= daysInMonth; i++) {
      const day = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), i);
      const dayStr = i.toString();

          // Days before shift start date should be N/A
    if (day < new Date(shiftStart.setHours(0, 0, 0, 0))) {
      schedule[dayStr] = 'N/A';
      continue;
    }

      // Apply custom shifts first
      if (customShiftMap[dayStr]) {
        schedule[dayStr] = customShiftMap[dayStr];
        continue;
      }

      // Apply leaves
      if (leaveDays.some(d => d.getDate() === i && d.getMonth() === selectedMonth.getMonth())) {
        schedule[dayStr] = 'LV';
        continue;
      }

      // Apply holidays
      if (holidays.some(h => h.getDate() === i && h.getMonth() === selectedMonth.getMonth())) {
        schedule[dayStr] = 'HO';
        continue;
      }

      const daysSinceStart = Math.floor((day.getTime() - shiftStart.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceStart < 0) {
        schedule[dayStr] = 'WD';
        continue;
      }

      const cycleIndex = daysSinceStart % cycleLength;
      if (cycleIndex >= activeDays) {
        schedule[dayStr] = 'OF';
        continue;
      }

      // Generate base shift schedule based on shift type
      const fullCycles = Math.floor(daysSinceStart / cycleLength);
      const activeDayIndex = fullCycles * activeDays + cycleIndex;

      switch (shiftType) {
        case 1: // Whole day only
          schedule[dayStr] = 'WD';
          break;
        case 2: // Morning or Evening only
          const block2 = Math.floor(activeDayIndex / shiftSwitch);
          schedule[dayStr] = block2 % 2 === 0 ? 'MS' : 'NS';
          break;
        case 3: // Morning, Afternoon or Evening
          const block3 = Math.floor(activeDayIndex / shiftSwitch);
          const modBlock = block3 % 3;
          schedule[dayStr] = modBlock === 0 ? 'MS' : modBlock === 1 ? 'AS' : 'NS';
          break;
        default:
          schedule[dayStr] = 'WD';
      }
    }
    return schedule;
  };

  const detectConflicts = (shifts: Record<string, Record<string, string>>) => {
    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    const conflictDays: string[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dayStr = i.toString();
      const activeDoctors = filteredUsers.reduce((count, user) => {
        const shift = shifts[user.id]?.[dayStr] || '';
        return (shift !== 'OF' && shift !== 'HO' && shift !== 'LV') ? count + 1 : count;
      }, 0);
      if (activeDoctors === 0) {
        conflictDays.push(dayStr);
      }
    }
    setConflicts(conflictDays);
  };

  const filteredUsers = users.filter(
    (user) =>
      `${user.Fname} ${user.Lname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      departments
        .find((d) => d.id === user['Department ID'])
        ?.['Department Name']?.toLowerCase()
        ?.includes(searchTerm.toLowerCase())
  ).filter(user => !selectedDepartmentId || user['Department ID'] === selectedDepartmentId);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getPageNumbers = () => {
    const maxPagesToShow = 5;
    const pages: number[] = [];
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const markLeaveDay = async () => {
    if (!selectedUserId || !selectedDay) return;

    setIsDoctorsLoading(true);
    try {
      const leaveDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), parseInt(selectedDay));
      await addDoc(collection(db, 'Users', selectedUserId, 'Leaves'), {
        StartDate: Timestamp.fromDate(leaveDate),
        EndDate: Timestamp.fromDate(leaveDate),
        Type: 'Manual'
      });
      setIsLeaveModalOpen(false);
      setSelectedUserId(null);
      setSelectedDay(null);
      fetchDoctorSchedules(); // Refresh schedules after marking leave
    } catch (e) {
      alert('Failed to mark leave. Check connectivity!');
    }
    setIsDoctorsLoading(false);
  };

const updateShift = async () => {
  if (!selectedUserId || !selectedDay) return;

  setIsDoctorsLoading(true);
  try {
    const shiftDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), parseInt(selectedDay));
    
    // Get the user's current schedule
    const scheduleSnapshot = await getDocs(collection(db, 'Users', selectedUserId, 'Schedule'));
    const schedule = scheduleSnapshot.empty ? null : scheduleSnapshot.docs[0].data() as Schedule;
    const shiftType = schedule?.Shift || 1;

    // For shift type 1, only allow changing to leave
    if (shiftType === 1 && selectedShift !== 'LV') {
      alert('This doctor is set to Whole Day shifts only and can only be marked as leave.');
      return;
    }

    // For shift type 2, only allow MS or NS
    if (shiftType === 2 && !['MS', 'NS'].includes(selectedShift)) {
      alert('This doctor can only be assigned Morning or Night shifts.');
      return;
    }

    // Check for existing custom shift
    const customShiftsQuery = query(
      collection(db, 'Users', selectedUserId, 'CustomShifts'),
      where('Date', '==', shiftDate)
    );
    const existingShifts = await getDocs(customShiftsQuery);

    if (existingShifts.empty) {
      await addDoc(collection(db, 'Users', selectedUserId, 'CustomShifts'), {
        Date: Timestamp.fromDate(shiftDate),
        Shift: selectedShift
      });
    } else {
      const docId = existingShifts.docs[0].id;
      await updateDoc(doc(db, 'Users', selectedUserId, 'CustomShifts', docId), {
        Shift: selectedShift
      });
    }

    setIsShiftModalOpen(false);
    setSelectedUserId(null);
    setSelectedDay(null);
    fetchDoctorSchedules();
  } catch (e) {
    alert('Failed to update shift. Check connectivity!');
  }
  setIsDoctorsLoading(false);
};

  const getShiftColor = (shift: string): string => {
    switch (shift) {
    case 'N/A': return 'bg-gray-800';
      case 'WD': return 'bg-teal-500';
      case 'MS': return 'bg-blue-600';
      case 'AS': return 'bg-orange-600';
      case 'NS': return 'bg-purple-600';
      case 'OF': return 'bg-gray-500';
      case 'HO': return 'bg-red-500';
      case 'LV': return 'bg-yellow-600';
      default: return 'bg-gray-300';
    }
  };

  const getShiftTooltip = (shift: string): string => {
    if (!shiftTimings) return shift;
    switch (shift) {
        case 'N/A': return 'Not available (before shift start date)';
      case 'MS': return `Morning Shift (${shiftTimings.Morning.Start} - ${shiftTimings.Morning.End})`;
      case 'AS': return `Afternoon Shift (${shiftTimings.Afternoon.Start} - ${shiftTimings.Afternoon.End})`;
      case 'NS': return `Night Shift (${shiftTimings.Evening.Start} - ${shiftTimings.Evening.End})`;
      case 'WD': return 'Whole Day';
      case 'OF': return 'Day Off';
      case 'HO': return 'Holiday';
      case 'LV': return 'Leave';
      default: return shift;
    }
  };

  const generateDays = () => {
    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    const days: { day: string; date: string }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
        new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), i).getDay()
      ];
      days.push({ day: weekday, date: i.toString() });
    }
    return days;
  };

  const days = generateDays();

const handleCellClick = async (user: Users, day: string) => {
  setSelectedUserId(user.id);
  setSelectedDay(day);
  
  // Get the current shift for this day
  const currentShift = doctorShifts[user.id]?.[day] || 'WD';
  setSelectedShift(currentShift);
  
  // Non-editable shifts
  if (currentShift === 'OF' || currentShift === 'HO' || currentShift === 'N/A') {
    // Don't show any modal for non-editable shifts
    toast.error(`Cannot edit this day (${currentShift})`);
    setIsShiftModalOpen(false);
    setIsLeaveModalOpen(false);
    return;
  }

  // Get the user's schedule to check their shift type
  const userSchedule = userSchedules[user.id];
  const shiftType = userSchedule?.Shift || 1;
  
  // Check if this is a custom shift
  const shiftDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), parseInt(day));
  const customShiftsQuery = query(
    collection(db, 'Users', user.id, 'CustomShifts'),
    where('Date', '==', shiftDate)
  );
  const existingShifts = await getDocs(customShiftsQuery);
  const isCustomShift = !existingShifts.empty;

  // Check if this is a leave day
  const isLeaveDay = currentShift === 'LV';

  if (shiftType === 1 && !isCustomShift && !isLeaveDay) {
    // Regular whole day shifts can only be marked as leave
    setIsLeaveModalOpen(true);
    setIsShiftModalOpen(false);
  } else {
    // For shift types 2 and 3, or custom shifts, show shift selection
    // Also allow editing leave days to change them back to regular shifts
    setIsShiftModalOpen(true);
    setIsLeaveModalOpen(false);
  }
};

  return (
    <Layout>
      <div className="space-y-6 p-6 rounded-lg text-gray-100">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-teal-900">Shift Calendar</h1>
            <p className="mt-2 text-base text-teal-900">View daily shift schedules for physicians</p>
          </div>
          <Button
            onClick={() => {
              const newDate = window.prompt('Enter month (YYYY-MM):', `${selectedMonth.getFullYear()}-${selectedMonth.getMonth() + 1}`);
              if (newDate) {
                const [year, month] = newDate.split('-').map(Number);
                if (year >= 2020 && year <= 2030 && month >= 1 && month <= 12) {
                  setSelectedMonth(new Date(year, month - 1));
                }
              }
            }}
            className="bg-teal-500 text-gray-900 hover:bg-teal-400"
          >
            <Calendar className="mr-1 h-4 w-4" />
            Change Month
          </Button>
        </div>

        {conflicts.length > 0 && (
          <div className="bg-red-600 text-white p-4 rounded-xl">
            Warning: No physicians available on days {conflicts.join(', ')}
          </div>
        )}

        <div className="sticky top-0 z-10 py-4 flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search by physician name or department..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="max-w-md bg-teal-100 border-teal-200 text-teal-900 placeholder-teal-600"
          />
          <select
            value={selectedDepartmentId || ''}
            onChange={(e) => {
              setSelectedDepartmentId(e.target.value || null);
              setCurrentPage(1);
            }}
            className="border border-teal-500 rounded-xl p-2 text-teal-700 focus:ring-teal-500 focus:border-teal-400"
          >
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>
                {dept['Department Name']}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-bold text-teal-800">Legend</h2>
          <div className="flex flex-wrap gap-4 mt-2">
            {[
              { code: 'WD', meaning: 'Whole Day', color: 'bg-teal-500' },
              { code: 'MS', meaning: 'Morning Shift', color: 'bg-blue-600' },
              { code: 'AS', meaning: 'Afternoon Shift', color: 'bg-orange-600' },
              { code: 'NS', meaning: 'Night Shift', color: 'bg-purple-600' },
              { code: 'OF', meaning: 'Day Off', color: 'bg-gray-600' },
              { code: 'HO', meaning: 'Holiday', color: 'bg-red-600' },
              { code: 'LV', meaning: 'Leave', color: 'bg-yellow-600' },
                { code: 'N/A', meaning: 'Not Available', color: 'bg-gray-800' },
            ].map(item => (
              <Tippy key={item.code} content={getShiftTooltip(item.code)} placement="bottom">
                <div className="flex cursor-pointer">
                  <div className={`w-4 h-4 ${item.color} rounded-md mr-2 border`}></div>
                  <div>
                    <div className="text-xs font-semibold text-teal-900">{item.code}</div>
                    <div className="text-xs text-gray-400">{item.meaning}</div>
                  </div>
                </div>
              </Tippy>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Spinner />
            <span className="text-teal-500 mt-2">Loading schedules...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 text-lg">No physicians found.</p>
          </div>
        ) : (
          <div className="bg-gray-800 shadow-lg rounded-xl overflow-hidden">
            <ShiftTable>
              <ShiftTable.Header>
                <ShiftTable.Row className="bg-gray-800">
                  <ShiftTable.Head className="text-white font-semibold">Physician</ShiftTable.Head>
                  {days.map(day => (
                    <ShiftTable.Head key={day.date} className="text-teal-400 font-semibold text-center">
                      <div className={`font-semibold ${day.day === 'Sun' || conflicts.includes(day.date) ? 'text-red-400' : 'text-white'}`}>
                        {day.day}
                      </div>
                      <div className={`mt-1 text-sm ${conflicts.includes(day.date) ? 'bg-red-900' : 'bg-teal-700'} rounded-full px-3 py-1 text-white`}>
                        {day.date}
                      </div>
                    </ShiftTable.Head>
                  ))}
                </ShiftTable.Row>
              </ShiftTable.Header>
              <ShiftTable.Body>
                {paginatedUsers.map((user, index) => (
                  <ShiftTable.Row
                    key={user.id}
                    className={`hover:bg-gray-600 transition-colors ${index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-700'}`}
                  >
                    <ShiftTable.Cell className="font-semibold text-white">
                      <div className="flex items-center space-x-3">
                        {user['User Pic'] ? (
                          <img
                            src={user['User Pic']?.toString()}
                            alt={`${user.Fname} ${user.Lname}`}
                            className="h-12 w-12 rounded-full object-cover shadow-sm"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-teal-400 to-teal-500 flex items-center justify-center text-sm font-semibold text-gray-800 shadow-sm">
                            {user.Fname?.[0] || 'P'}
                          </div>
                        )}
                        <span>{user.Title} {user.Fname} {user.Lname}</span>
                      </div>
                    </ShiftTable.Cell>
                    {days.map(day => (
                      <Tippy
                        key={day.date}
                        content={getShiftTooltip(doctorShifts[user.id]?.[day.date] || 'N/A')}
                        placement="top"
                      >
                        <ShiftTable.Cell
                          className={`text-center text-sm ${getShiftColor(doctorShifts[user.id]?.[day.date] || 'N/A')} text-white font-semibold cursor-pointer hover:opacity-80`}
                          onClick={() => handleCellClick(user, day.date)}
                        >
                          {doctorShifts[user.id]?.[day.date] || 'N/A'}
                        </ShiftTable.Cell>
                      </Tippy>
                    ))}
                  </ShiftTable.Row>
                ))}
              </ShiftTable.Body>
            </ShiftTable>

            {filteredUsers.length > itemsPerPage && (
              <div className="flex justify-between items-center mt-4 px-4 pb-4">
                <p className="text-sm text-white">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg bg-teal-500 text-gray-900 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </Button>
                  {getPageNumbers().map(page => (
                    <Button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 rounded-lg ${currentPage === page ? 'bg-teal-400 text-gray-900' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'}`}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg bg-teal-500 text-gray-900 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <Modal
          isOpen={isLeaveModalOpen}
          onClose={() => {
            setIsLeaveModalOpen(false);
            setSelectedUserId(null);
            setSelectedDay(null);
          }}
          title="Mark Leave Day"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-teal-400 text-sm">
              Mark {selectedDay}/{selectedMonth.getMonth() + 1}/{selectedMonth.getFullYear()} as a leave day for{' '}
              {users.find(u => u.id === selectedUserId)?.Fname} {users.find(u => u.id === selectedUserId)?.Lname}?
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                onClick={() => {
                  setIsLeaveModalOpen(false);
                  setSelectedUserId(null);
                  setSelectedDay(null);
                }}
                className="bg-gray-400 text-gray-900 hover:bg-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={markLeaveDay}
                className="bg-teal-400 text-gray-900 hover:bg-teal-300"
                disabled={isDoctorsLoading}
              >
                Confirm
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={isShiftModalOpen}
          onClose={() => {
            setIsShiftModalOpen(false);
            setSelectedUserId(null);
            setSelectedDay(null);
          }}
          title="Change Shift"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-teal-400 text-sm">
              Change shift for {users.find(u => u.id === selectedUserId)?.Fname} {users.find(u => u.id === selectedUserId)?.Lname} on{' '}
              {selectedDay}/{selectedMonth.getMonth() + 1}/{selectedMonth.getFullYear()}
            </p>
            
            <div className="flex flex-col space-y-2">
              <label className="text-white">Select Shift:</label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="border border-teal-500 rounded-xl p-2 text-teal-700 focus:ring-teal-500 focus:border-teal-400"
              >
                {userSchedules[selectedUserId || '']?.Shift === 2 ? (
                  <>
                    <option value="MS">Morning Shift</option>
                    <option value="NS">Night Shift</option>
                  </>
                ) : (
                  <>
                    <option value="MS">Morning Shift</option>
                    <option value="AS">Afternoon Shift</option>
                    <option value="NS">Night Shift</option>
                  </>
                )}
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                onClick={() => {
                  setIsShiftModalOpen(false);
                  setSelectedUserId(null);
                  setSelectedDay(null);
                }}
                className="bg-gray-400 text-gray-900 hover:bg-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={updateShift}
                className="bg-teal-400 text-gray-900 hover:bg-teal-300"
                disabled={isDoctorsLoading}
              >
                Update Shift
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default ShiftSchedule;