'use server';

import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { normalizeSubjectType } from '@/lib/attendance';

// ==========================================
// AUTH ACTIONS
// ==========================================

export async function loginAction(input: string) {
  const pin = process.env.ADMIN_PIN || '1234';

  // Check admin PIN
  if (input.trim() === pin) {
    const cookieStore = await cookies();
    cookieStore.set('auth_role', 'admin', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    return { success: true, redirect: '/admin' };
  }

  // Check if roll number exists in students table
  const { data: student, error } = await supabase
    .from('students')
    .select('roll_number, name')
    .eq('roll_number', input.trim())
    .single();

  if (student) {
    const cookieStore = await cookies();
    cookieStore.set('auth_role', 'student', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.set('auth_roll_number', student.roll_number, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    });
    return { success: true, redirect: '/student', name: student.name };
  }

  return { success: false, error: 'Invalid Roll Number or Admin PIN.' };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_role');
  cookieStore.delete('auth_roll_number');
  return { success: true };
}

export async function getSession() {
  const cookieStore = await cookies();
  const role = cookieStore.get('auth_role')?.value || null;
  const rollNumber = cookieStore.get('auth_roll_number')?.value || null;
  return { role, rollNumber };
}

// ==========================================
// STUDENT ACTIONS
// ==========================================

export async function getStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addStudent(rollNumber: string, name: string) {
  if (!rollNumber.trim() || !name.trim()) {
    throw new Error('Roll Number and Name are required.');
  }

  const { data, error } = await supabase
    .from('students')
    .insert([{ roll_number: rollNumber.trim(), name: name.trim() }])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Student with this Roll Number already exists.');
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteStudent(rollNumber: string) {
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('roll_number', rollNumber);

  if (error) throw new Error(error.message);
  return { success: true };
}

// ==========================================
// SUBJECT ACTIONS
// ==========================================

export async function getSubjects() {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addSubject(name: string, type: string) {
  if (!name.trim()) {
    throw new Error('Subject Name is required.');
  }

  const { data, error } = await supabase
    .from('subjects')
    .insert([{ name: name.trim(), type: normalizeSubjectType(type) }])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Subject with this name already exists.');
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteSubject(id: string) {
  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getSubjectAttendanceReport(subjectId: string) {
  // 1. Get the subject
  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', subjectId)
    .single();

  if (subjectError || !subject) {
    throw new Error('Subject not found.');
  }

  // 2. Get all students
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('*')
    .order('name', { ascending: true });

  if (studentsError) throw new Error(studentsError.message);

  // 3. Get all classes held for this subject
  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('*')
    .eq('subject_id', subjectId)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });

  if (classesError) throw new Error(classesError.message);

  // 4. Get attendance records for those classes
  let attendanceRecords: { class_id: string; student_roll_number: string; status: string }[] = [];
  if (classes && classes.length > 0) {
    const classIds = classes.map((c) => c.id);
    const { data, error } = await supabase
      .from('attendance')
      .select('class_id, student_roll_number, status')
      .in('class_id', classIds);

    if (error) throw new Error(error.message);
    attendanceRecords = data || [];
  }

  // Per-student tally: rollNumber -> { attended, absent }
  const tallyMap = new Map<string, { attended: number; absent: number }>();
  attendanceRecords.forEach((rec) => {
    const tally = tallyMap.get(rec.student_roll_number) || { attended: 0, absent: 0 };
    if (rec.status === 'present') {
      tally.attended += 1;
    } else if (rec.status === 'absent') {
      tally.absent += 1;
    }
    tallyMap.set(rec.student_roll_number, tally);
  });

  const rows =
    students?.map((s) => {
      const tally = tallyMap.get(s.roll_number) || { attended: 0, absent: 0 };
      const totalClasses = tally.attended + tally.absent;
      return {
        rollNumber: s.roll_number,
        name: s.name,
        attended: tally.attended,
        absent: tally.absent,
        totalClasses,
        pct: totalClasses > 0 ? Math.round((tally.attended / totalClasses) * 100) : null,
      };
    }) || [];

  // Lowest attendance first (students with no marked classes go last)
  rows.sort((a, b) => {
    if (a.pct === null && b.pct === null) return a.name.localeCompare(b.name);
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    if (a.pct !== b.pct) return a.pct - b.pct;
    return a.name.localeCompare(b.name);
  });

  return {
    subject: {
      id: subject.id,
      name: subject.name,
      type: normalizeSubjectType(subject.type),
    },
    totalClassesHeld: classes?.length || 0,
    rows,
  };
}

// ==========================================
// WEEKLY SCHEDULE ACTIONS
// ==========================================

export async function getWeeklySchedule() {
  const { data, error } = await supabase
    .from('weekly_schedule')
    .select('*, subjects(id, name)')
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addWeeklySchedule(
  subjectId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string
) {
  const { data, error } = await supabase
    .from('weekly_schedule')
    .insert([
      {
        subject_id: subjectId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      },
    ])
    .select();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteWeeklySchedule(id: string) {
  const { error } = await supabase
    .from('weekly_schedule')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return { success: true };
}

// ==========================================
// CLASSES & DAILY MANAGER ACTIONS
// ==========================================

export async function getClassesForDate(dateStr: string) {
  const { data, error } = await supabase
    .from('classes')
    .select('*, subjects(id, name)')
    .eq('date', dateStr)
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addCustomClass(
  subjectId: string,
  dateStr: string,
  startTime: string,
  endTime: string
) {
  const { data, error } = await supabase
    .from('classes')
    .insert([
      {
        subject_id: subjectId,
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
      },
    ])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A class for this subject at this time already exists on this day.');
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteClass(classId: string) {
  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', classId);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function initializeClassesFromSchedule(dateStr: string) {
  // Parse day of week from dateStr (format YYYY-MM-DD)
  // Note: JavaScript Date.getDay() uses 0 for Sunday, 1 for Monday, etc.
  const dateObj = new Date(dateStr);
  const dayOfWeek = dateObj.getDay();

  // Fetch weekly schedule for this day of week
  const { data: scheduleItems, error: scheduleError } = await supabase
    .from('weekly_schedule')
    .select('*')
    .eq('day_of_week', dayOfWeek);

  if (scheduleError) throw new Error(scheduleError.message);

  if (!scheduleItems || scheduleItems.length === 0) {
    return { success: false, message: 'No classes in weekly schedule for this day.' };
  }

  // Fetch existing classes for this date to avoid duplicate insertion
  const { data: existingClasses, error: existingError } = await supabase
    .from('classes')
    .select('*')
    .eq('date', dateStr);

  if (existingError) throw new Error(existingError.message);

  const existingTimes = new Set(
    existingClasses?.map((c) => `${c.subject_id}_${c.start_time}`) || []
  );

  // Filter schedule items to insert
  const itemsToInsert = scheduleItems
    .filter((s) => !existingTimes.has(`${s.subject_id}_${s.start_time}`))
    .map((s) => ({
      subject_id: s.subject_id,
      date: dateStr,
      start_time: s.start_time,
      end_time: s.end_time,
    }));

  if (itemsToInsert.length === 0) {
    return { success: true, message: 'All scheduled classes are already initialized for this day.' };
  }

  const { error: insertError } = await supabase
    .from('classes')
    .insert(itemsToInsert);

  if (insertError) throw new Error(insertError.message);

  return { success: true, message: `Successfully loaded ${itemsToInsert.length} classes.` };
}

// ==========================================
// ATTENDANCE ACTIONS
// ==========================================

export async function getClassAttendance(classId: string) {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('class_id', classId);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveAttendance(
  classId: string,
  records: { student_roll_number: string; status: 'present' | 'absent' }[]
) {
  if (records.length === 0) return { success: true };

  // Prepare upsert records
  const upsertData = records.map((r) => ({
    class_id: classId,
    student_roll_number: r.student_roll_number,
    status: r.status,
  }));

  const { data, error } = await supabase
    .from('attendance')
    .upsert(upsertData, { onConflict: 'class_id,student_roll_number' })
    .select();

  if (error) throw new Error(error.message);
  return { success: true, data };
}

// ==========================================
// STUDENT REPORT ACTIONS
// ==========================================

export async function getStudentReport(rollNumber: string) {
  // 1. Get student info
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('roll_number', rollNumber)
    .single();

  if (studentError || !student) {
    throw new Error('Student not found.');
  }

  // 2. Fetch all subjects
  const { data: subjects, error: subjectsError } = await supabase
    .from('subjects')
    .select('*')
    .order('name', { ascending: true });

  if (subjectsError) throw new Error(subjectsError.message);

  // 3. Fetch all class instances held
  const { data: allClasses, error: classesError } = await supabase
    .from('classes')
    .select('*, subjects(id, name)')
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });

  if (classesError) throw new Error(classesError.message);

  // 4. Fetch this student's attendance records
  const { data: attendanceRecords, error: attendanceError } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_roll_number', rollNumber);

  if (attendanceError) throw new Error(attendanceError.message);

  // Create lookup dictionary for attendance: classId -> status
  const attendanceMap = new Map<string, 'present' | 'absent'>();
  attendanceRecords?.forEach((rec) => {
    attendanceMap.set(rec.class_id, rec.status as 'present' | 'absent');
  });

  // Compile stats per subject
  const subjectStatsMap = new Map<
    string,
    { id: string; name: string; type: string; totalClasses: number; attended: number; absent: number }
  >();

  // Initialize with 0s for all subjects
  subjects?.forEach((sub) => {
    subjectStatsMap.set(sub.id, {
      id: sub.id,
      name: sub.name,
      type: normalizeSubjectType(sub.type),
      totalClasses: 0,
      attended: 0,
      absent: 0,
    });
  });

  const absentDays: { date: string; time: string; subject: string }[] = [];
  const fullAttendanceLog: {
    classId: string;
    subjectName: string;
    date: string;
    time: string;
    status: 'present' | 'absent' | 'unmarked';
  }[] = [];

  // Group and count classes and attendance
  allClasses?.forEach((cls) => {
    const status = attendanceMap.get(cls.id) || 'unmarked';
    const subId = cls.subject_id;
    const stats = subjectStatsMap.get(subId);

    // Format time: HH:MM
    const timeFormatted = `${cls.start_time.substring(0, 5)} - ${cls.end_time.substring(0, 5)}`;

    if (stats) {
      // We only count classes that have been marked or if they are in the past
      // For absolute correctness, a class counts towards total if the student has been marked present or absent.
      // If unmarked, we could assume they were unmarked (or absent), but standard practice is:
      // A class counts in the percentage calculation if there's an attendance record for this student in it.
      // Let's count all classes that have at least one attendance entry in the DB, OR if this student specifically has a record.
      // Let's count a class if it is present in the student's attendance map (marked present or absent)
      // Or we can count all classes that have occurred. Let's count classes that have been marked.
      if (status !== 'unmarked') {
        stats.totalClasses += 1;
        if (status === 'present') {
          stats.attended += 1;
        } else if (status === 'absent') {
          stats.absent += 1;
        }
      }
    }

    if (status === 'absent') {
      absentDays.push({
        date: cls.date,
        time: timeFormatted,
        subject: cls.subjects?.name || 'Unknown',
      });
    }

    fullAttendanceLog.push({
      classId: cls.id,
      subjectName: cls.subjects?.name || 'Unknown',
      date: cls.date,
      time: timeFormatted,
      status,
    });
  });

  const subjectStats = Array.from(subjectStatsMap.values());

  return {
    student,
    subjectStats,
    absentDays,
    fullAttendanceLog,
  };
}
