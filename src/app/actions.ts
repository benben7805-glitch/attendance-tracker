'use server';

import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { normalizeSubjectType } from '@/lib/attendance';
import {
  signSession,
  verifySession,
  timingSafeEqual,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '@/lib/auth';
import { sanitizeRollNumber, sanitizeText } from '@/lib/security';
import { checkRateLimit } from '@/lib/rate-limit';

// ==========================================
// SESSION & AUTHORIZATION HELPERS
// ==========================================

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const verified = await verifySession(token);
    if (verified) {
      return { role: verified.role, rollNumber: verified.rollNumber || null };
    }
  }

  return { role: null, rollNumber: null };
}

export async function assertAdmin() {
  const session = await getSession();
  if (session.role !== 'admin') {
    throw new Error('Unauthorized: Administrative privileges are required.');
  }
  return session;
}

export async function assertAuthenticated() {
  const session = await getSession();
  if (!session.role) {
    throw new Error('Unauthorized: Authentication required.');
  }
  return session;
}

// ==========================================
// AUTH ACTIONS
// ==========================================

export async function loginAction(input: string) {
  const trimmed = (input || '').trim();

  // Rate limiting to prevent brute-force attacks
  const rateLimitResult = checkRateLimit(`login:${trimmed.slice(0, 30)}`, 10, 60 * 1000);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: 'Too many login attempts. Please wait a minute and try again.',
    };
  }

  const pin = process.env.ADMIN_PIN || '1234';

  // Check admin PIN with constant-time equality
  if (timingSafeEqual(trimmed, pin)) {
    const sessionToken = await signSession({ role: 'admin' });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS,
    });
    return { success: true, redirect: '/admin' };
  }

  // Check if roll number exists in students table
  const cleanRoll = sanitizeRollNumber(trimmed);
  if (!cleanRoll) {
    return { success: false, error: 'Invalid Roll Number or Admin PIN.' };
  }

  const { data: student } = await supabase
    .from('students')
    .select('roll_number, name')
    .eq('roll_number', cleanRoll)
    .single();

  if (student) {
    const sessionToken = await signSession({
      role: 'student',
      rollNumber: student.roll_number,
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS,
    });
    return { success: true, redirect: '/student', name: student.name };
  }

  return { success: false, error: 'Invalid Roll Number or Admin PIN.' };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return { success: true };
}

// ==========================================
// STUDENT ACTIONS
// ==========================================

export async function getStudents() {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addStudent(rollNumber: string, name: string) {
  await assertAdmin();

  const cleanRoll = sanitizeRollNumber(rollNumber);
  const cleanName = sanitizeText(name, 100);

  if (!cleanRoll || !cleanName) {
    throw new Error('Valid Roll Number and Name are required.');
  }

  const { data, error } = await supabase
    .from('students')
    .insert([{ roll_number: cleanRoll, name: cleanName }])
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
  await assertAdmin();

  const cleanRoll = sanitizeRollNumber(rollNumber);
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('roll_number', cleanRoll);

  if (error) throw new Error(error.message);
  return { success: true };
}

// ==========================================
// SUBJECT ACTIONS
// ==========================================

export async function getSubjects() {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addSubject(name: string, type: string) {
  await assertAdmin();

  const cleanName = sanitizeText(name, 100);
  if (!cleanName) {
    throw new Error('Subject Name is required.');
  }

  const { data, error } = await supabase
    .from('subjects')
    .insert([{ name: cleanName, type: normalizeSubjectType(type) }])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Subject with this name and type already exists.');
    }
    if (error.code === 'PGRST204') {
      throw new Error(
        'Database schema is out of date. Run the migration in supabase_schema.sql (Supabase Dashboard > SQL Editor).'
      );
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteSubject(id: string) {
  await assertAdmin();

  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getSubjectAttendanceReport(subjectId: string) {
  await assertAuthenticated();

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

  // 4. Get attendance records for those classes with pagination to prevent 1000-row PostgREST truncation
  const attendanceRecords: { class_id: string; student_roll_number: string; status: string }[] = [];
  if (classes && classes.length > 0) {
    const classIds = classes.map((c) => c.id);
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('attendance')
        .select('class_id, student_roll_number, status')
        .in('class_id', classIds)
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        attendanceRecords.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }
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
// CLASSES & DAILY MANAGER ACTIONS
// ==========================================

export async function getClassesForDate(dateStr: string) {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('classes')
    .select('*, subjects(id, name, type), batches(id, name)')
    .eq('date', dateStr)
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addCustomClass(
  subjectId: string,
  dateStr: string,
  startTime: string,
  endTime: string,
  batchId?: string
) {
  await assertAdmin();

  if (!startTime || !endTime) {
    throw new Error('Start time and End time are required.');
  }
  if (startTime >= endTime) {
    throw new Error('Start time must be earlier than End time.');
  }

  const insertPayload = {
    subject_id: subjectId,
    date: dateStr,
    start_time: startTime,
    end_time: endTime,
    ...(batchId ? { batch_id: batchId } : {}),
  };

  const { data, error } = await supabase
    .from('classes')
    .insert([insertPayload])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A class for this subject and batch at this time already exists on this day.');
    }
    if (error.code === '23514') {
      throw new Error('Start time must be strictly earlier than end time.');
    }
    throw new Error(error.message);
  }
  return data;
}

export async function getBatchMemberRollNumbers(batchId: string) {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('batch_students')
    .select('student_roll_number')
    .eq('batch_id', batchId);

  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.student_roll_number);
}

export async function deleteClass(classId: string) {
  await assertAdmin();

  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', classId);

  if (error) throw new Error(error.message);
  return { success: true };
}

// ==========================================
// ATTENDANCE ACTIONS
// ==========================================

export async function getClassAttendance(classId: string) {
  await assertAuthenticated();

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
  await assertAdmin();

  if (records.length === 0) return { success: true };

  const upsertData = records.map((r) => ({
    class_id: classId,
    student_roll_number: sanitizeRollNumber(r.student_roll_number),
    status: r.status === 'absent' ? 'absent' : 'present',
  }));

  // Chunk upserts in batches of 500 to avoid payload size/timeout limits
  const CHUNK_SIZE = 500;
  for (let i = 0; i < upsertData.length; i += CHUNK_SIZE) {
    const chunk = upsertData.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('attendance')
      .upsert(chunk, { onConflict: 'class_id,student_roll_number' });

    if (error) throw new Error(error.message);
  }

  return { success: true };
}

// ==========================================
// STUDENT REPORT ACTIONS
// ==========================================

export async function getStudentReport(rollNumber: string) {
  const session = await assertAuthenticated();

  const cleanRoll = sanitizeRollNumber(rollNumber);

  // IDOR Defense: Students can only query their own report; Admins can query any student
  if (session.role === 'student' && session.rollNumber !== cleanRoll) {
    throw new Error('Unauthorized: You can only view your own attendance report.');
  }

  // 1. Get student info
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('roll_number', cleanRoll)
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

  // 4. Fetch this student's attendance records with range pagination to avoid truncation
  const attendanceRecords: { class_id: string; status: string }[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('attendance')
      .select('class_id, status')
      .eq('student_roll_number', cleanRoll)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      attendanceRecords.push(...data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    } else {
      hasMore = false;
    }
  }

  // Create lookup dictionary for attendance: classId -> status
  const attendanceMap = new Map<string, 'present' | 'absent'>();
  attendanceRecords.forEach((rec) => {
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

    const timeFormatted = `${cls.start_time.substring(0, 5)} - ${cls.end_time.substring(0, 5)}`;

    if (stats) {
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

// ==========================================
// BATCH ACTIONS
// ==========================================

export async function getBatches() {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('batches')
    .select('*, subjects(id, name, type)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getBatchesForSubject(subjectId: string) {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('subject_id', subjectId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addBatch(subjectId: string, name: string) {
  await assertAdmin();

  const cleanName = sanitizeText(name, 100);
  if (!cleanName) {
    throw new Error('Batch name is required.');
  }

  const { data, error } = await supabase
    .from('batches')
    .insert([{ subject_id: subjectId, name: cleanName }])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A batch with this name already exists for this subject.');
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteBatch(batchId: string) {
  await assertAdmin();

  const { error } = await supabase
    .from('batches')
    .delete()
    .eq('id', batchId);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getBatchStudents(batchId: string) {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('batch_students')
    .select('student_roll_number, students(roll_number, name)')
    .eq('batch_id', batchId);

  if (error) throw new Error(error.message);
  return (data || []).map((r) => {
    const student = Array.isArray(r.students) ? r.students[0] : r.students;
    return {
      roll_number: student?.roll_number || r.student_roll_number,
      name: student?.name || 'Unknown',
    };
  });
}

export async function addStudentToBatch(batchId: string, rollNumber: string) {
  await assertAdmin();

  const cleanRoll = sanitizeRollNumber(rollNumber);
  const { error } = await supabase
    .from('batch_students')
    .insert([{ batch_id: batchId, student_roll_number: cleanRoll }]);

  if (error) {
    if (error.code === '23505') {
      throw new Error('Student is already in this batch.');
    }
    throw new Error(error.message);
  }
  return { success: true };
}

export async function addMultipleStudentsToBatch(batchId: string, rollNumbers: string[]) {
  await assertAdmin();

  if (rollNumbers.length === 0) return { success: true };

  const insertData = rollNumbers
    .map((r) => sanitizeRollNumber(r))
    .filter(Boolean)
    .map((r) => ({
      batch_id: batchId,
      student_roll_number: r,
    }));

  const { error } = await supabase
    .from('batch_students')
    .upsert(insertData, { onConflict: 'batch_id,student_roll_number' });

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function removeStudentFromBatch(batchId: string, rollNumber: string) {
  await assertAdmin();

  const cleanRoll = sanitizeRollNumber(rollNumber);
  const { error } = await supabase
    .from('batch_students')
    .delete()
    .eq('batch_id', batchId)
    .eq('student_roll_number', cleanRoll);

  if (error) throw new Error(error.message);
  return { success: true };
}

// ==========================================
// EVENT ACTIONS
// ==========================================

export async function getEvents() {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addEvent(title: string, description: string, date: string) {
  await assertAdmin();

  const cleanTitle = sanitizeText(title, 150);
  const cleanDesc = sanitizeText(description, 500);

  if (!cleanTitle) {
    throw new Error('Event title is required.');
  }

  const { data, error } = await supabase
    .from('events')
    .insert([{ title: cleanTitle, description: cleanDesc || null, date }])
    .select();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEvent(eventId: string) {
  await assertAdmin();

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) throw new Error(error.message);
  return { success: true };
}
