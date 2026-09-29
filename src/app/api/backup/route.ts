import ExcelJS from 'exceljs';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/app/actions';
import { verifyOrigin, sanitizeFormula } from '@/lib/security';
import {
  normalizeSubjectType,
  getSubjectTypeOption,
  getMinAttendance,
  meetsMinimumAttendance,
  classesNeededToReachMinimum,
} from '@/lib/attendance';

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(time: string | null | undefined): string {
  return time ? time.substring(0, 5) : '';
}

function formatDateOnly(value: string | null | undefined): string {
  return value ? value.substring(0, 10) : '';
}

function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF8B5CF6' },
  };
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Partial<ExcelJS.Column>[],
  rows: (string | number)[][]
) {
  const ws = workbook.addWorksheet(name);
  ws.columns = columns;
  ws.addRows(rows);
  styleHeaderRow(ws);
  return ws;
}

interface BackupClass {
  id: string;
  admin_id?: string;
  subject_id: string;
  batch_id?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  subjects?: { id: string; name: string } | null;
  batches?: { id: string; name: string } | null;
}

interface BackupAttendance {
  id: string;
  class_id: string;
  student_roll_number: string;
  status: string;
  marked_at?: string;
}

export async function GET(request: Request) {
  // CSRF verification
  if (!verifyOrigin(request)) {
    return new Response('Forbidden: Cross-site request rejected.', { status: 403 });
  }

  // Admin or Super Admin session authentication
  const session = await getSession();
  if (session.role !== 'admin' && session.role !== 'super_admin') {
    return new Response('Unauthorized: Admin access required.', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetClassroomId = searchParams.get('classroom_id');
  const exportAll = searchParams.get('all') === 'true' && session.role === 'super_admin';

  let effectiveAdminId: string | null = null;
  if (session.role === 'admin') {
    effectiveAdminId = session.adminId;
  } else if (session.role === 'super_admin') {
    if (targetClassroomId) {
      effectiveAdminId = targetClassroomId;
    } else if (!exportAll && session.activeAdminId) {
      effectiveAdminId = session.activeAdminId;
    }
  }

  try {
    // 1. Build queries based on scoping
    let studentsQ = supabase.from('students').select('*').order('name', { ascending: true });
    let subjectsQ = supabase.from('subjects').select('*').order('name', { ascending: true });
    let batchesQ = supabase.from('batches').select('*, subjects(id, name, type)').order('name', { ascending: true });
    const batchStudentsQ = supabase.from('batch_students').select('*, batches(id, name, subject_id, admin_id)');
    let eventsQ = supabase.from('events').select('*').order('date', { ascending: true });

    if (effectiveAdminId) {
      studentsQ = studentsQ.eq('admin_id', effectiveAdminId);
      subjectsQ = subjectsQ.eq('admin_id', effectiveAdminId);
      batchesQ = batchesQ.eq('admin_id', effectiveAdminId);
      eventsQ = eventsQ.or(`admin_id.eq.${effectiveAdminId},is_global.eq.true`);
    }

    const [studentsRes, subjectsRes, batchesRes, batchStudentsRes, eventsRes, adminsRes] = await Promise.all([
      studentsQ,
      subjectsQ,
      batchesQ,
      batchStudentsQ,
      eventsQ,
      supabase.from('admins').select('*').order('classroom_name', { ascending: true }),
    ]);

    const initialError =
      studentsRes.error ||
      subjectsRes.error ||
      batchesRes.error ||
      batchStudentsRes.error ||
      eventsRes.error;
    if (initialError) throw new Error(initialError.message);

    const students = studentsRes.data || [];
    const subjects = subjectsRes.data || [];
    const batches = batchesRes.data || [];
    const allBatchStudents = batchStudentsRes.data || [];
    const batchStudents = effectiveAdminId
      ? allBatchStudents.filter((bs) => (bs.batches as unknown as { admin_id: string })?.admin_id === effectiveAdminId)
      : allBatchStudents;
    const events = eventsRes.data || [];
    const admins = adminsRes.data || [];

    // 2. Fetch Classes with pagination
    const classes: BackupClass[] = [];
    const PAGE_SIZE = 1000;
    let fromClass = 0;
    let hasMoreClasses = true;

    while (hasMoreClasses) {
      let classesQ = supabase
        .from('classes')
        .select('*, subjects(id, name, type), batches(id, name)')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .range(fromClass, fromClass + PAGE_SIZE - 1);

      if (effectiveAdminId) {
        classesQ = classesQ.eq('admin_id', effectiveAdminId);
      }

      const { data, error } = await classesQ;
      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        classes.push(...(data as unknown as BackupClass[]));
        if (data.length < PAGE_SIZE) hasMoreClasses = false;
        else fromClass += PAGE_SIZE;
      } else {
        hasMoreClasses = false;
      }
    }

    // 3. Fetch Attendance records with pagination
    const attendance: BackupAttendance[] = [];
    const classIds = classes.map((c) => c.id);

    if (classIds.length > 0) {
      let fromAtt = 0;
      let hasMoreAtt = true;

      while (hasMoreAtt) {
        const attQ = supabase
          .from('attendance')
          .select('*')
          .in('class_id', classIds)
          .range(fromAtt, fromAtt + PAGE_SIZE - 1);

        const { data, error } = await attQ;
        if (error) throw new Error(error.message);
        if (data && data.length > 0) {
          attendance.push(...(data as unknown as BackupAttendance[]));
          if (data.length < PAGE_SIZE) hasMoreAtt = false;
          else fromAtt += PAGE_SIZE;
        } else {
          hasMoreAtt = false;
        }
      }
    }

    // Lookup maps
    const studentNameByRoll = new Map(students.map((s) => [s.roll_number, s.name]));
    const classById = new Map(classes.map((c) => [c.id, c]));
    const batchNameById = new Map(batches.map((b) => [b.id, b.name]));
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    // Aggregate summary
    const summaryTally = new Map<
      string,
      { rollNumber: string; subjectId: string; attended: number; absent: number }
    >();
    attendance.forEach((rec) => {
      const cls = classById.get(rec.class_id);
      if (!cls) return;
      if (rec.status !== 'present' && rec.status !== 'absent') return;
      const key = `${rec.student_roll_number}|${cls.subject_id}`;
      const entry =
        summaryTally.get(key) || {
          rollNumber: rec.student_roll_number,
          subjectId: cls.subject_id,
          attended: 0,
          absent: 0,
        };
      if (rec.status === 'present') entry.attended += 1;
      else entry.absent += 1;
      summaryTally.set(key, entry);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Attendance Hub Enterprise';
    workbook.created = new Date();

    // Sheet 0: Classrooms (if Super Admin master export)
    if (exportAll) {
      addSheet(
        workbook,
        'Classrooms',
        [
          { header: 'Classroom Name', key: 'cname', width: 30 },
          { header: 'Classroom Code', key: 'code', width: 18 },
          { header: 'Admin Name', key: 'aname', width: 25 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Created On', key: 'created', width: 16 },
        ],
        admins.map((a) => [
          sanitizeFormula(a.classroom_name),
          sanitizeFormula(a.classroom_code),
          sanitizeFormula(a.name),
          a.is_active ? 'Active' : 'Inactive',
          formatDateOnly(a.created_at),
        ])
      );
    }

    // Sheet 1: Students
    addSheet(
      workbook,
      'Students',
      [
        { header: 'Student Login ID', key: 'sid', width: 22 },
        { header: 'Roll Number', key: 'roll', width: 16 },
        { header: 'Name', key: 'name', width: 30 },
        ...(exportAll ? [{ header: 'Classroom Code', key: 'ccode', width: 16 }] : []),
        { header: 'Registered On', key: 'reg', width: 16 },
      ],
      students.map((s) => {
        const cCode = adminMap.get(s.admin_id)?.classroom_code || '';
        const studentLoginId = `${cCode}${s.roll_number}`;
        return [
          sanitizeFormula(studentLoginId),
          sanitizeFormula(s.roll_number),
          sanitizeFormula(s.name),
          ...(exportAll ? [sanitizeFormula(cCode)] : []),
          formatDateOnly(s.created_at),
        ];
      })
    );

    // Sheet 2: Subjects
    addSheet(
      workbook,
      'Subjects',
      [
        { header: 'Name', key: 'name', width: 35 },
        { header: 'Type', key: 'type', width: 14 },
        { header: 'Min Required %', key: 'min', width: 16 },
        ...(exportAll ? [{ header: 'Classroom Code', key: 'ccode', width: 16 }] : []),
        { header: 'Created On', key: 'created', width: 16 },
      ],
      subjects.map((s) => [
        sanitizeFormula(s.name),
        getSubjectTypeOption(s.type).label,
        getMinAttendance(s.type),
        ...(exportAll ? [sanitizeFormula(adminMap.get(s.admin_id)?.classroom_code || '')] : []),
        formatDateOnly(s.created_at),
      ])
    );

    // Sheet 3: Batches
    addSheet(
      workbook,
      'Batches',
      [
        { header: 'Batch Name', key: 'name', width: 25 },
        { header: 'Subject', key: 'subject', width: 35 },
        ...(exportAll ? [{ header: 'Classroom Code', key: 'ccode', width: 16 }] : []),
        { header: 'Created On', key: 'created', width: 16 },
      ],
      batches.map((b) => [
        sanitizeFormula(b.name),
        sanitizeFormula(b.subjects?.name || 'Unknown'),
        ...(exportAll ? [sanitizeFormula(adminMap.get(b.admin_id)?.classroom_code || '')] : []),
        formatDateOnly(b.created_at),
      ])
    );

    // Sheet 4: Batch Students
    addSheet(
      workbook,
      'Batch Students',
      [
        { header: 'Batch Name', key: 'batch', width: 25 },
        { header: 'Subject', key: 'subject', width: 35 },
        { header: 'Roll Number', key: 'roll', width: 20 },
        { header: 'Student Name', key: 'name', width: 30 },
      ],
      batchStudents.map((bs) => {
        const batch = batches.find((b) => b.id === bs.batch_id);
        return [
          sanitizeFormula(batch?.name || 'Unknown'),
          sanitizeFormula(batch?.subjects?.name || 'Unknown'),
          sanitizeFormula(bs.student_roll_number),
          sanitizeFormula(studentNameByRoll.get(bs.student_roll_number) || ''),
        ];
      })
    );

    // Sheet 5: Classes
    addSheet(
      workbook,
      'Classes',
      [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Day', key: 'day', width: 12 },
        { header: 'Subject', key: 'subject', width: 35 },
        { header: 'Batch', key: 'batch', width: 20 },
        { header: 'Start Time', key: 'start', width: 12 },
        { header: 'End Time', key: 'end', width: 12 },
      ],
      classes.map((c) => [
        formatDateOnly(c.date),
        DAY_NAMES[new Date(`${c.date}T00:00:00`).getDay()] || '',
        sanitizeFormula(c.subjects?.name || 'Unknown'),
        sanitizeFormula(c.batches?.name || (c.batch_id ? batchNameById.get(c.batch_id) || '' : 'All Students')),
        formatTime(c.start_time),
        formatTime(c.end_time),
      ])
    );

    // Sheet 6: Attendance Log
    addSheet(
      workbook,
      'Attendance Log',
      [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Start Time', key: 'start', width: 12 },
        { header: 'Subject', key: 'subject', width: 35 },
        { header: 'Batch', key: 'batch', width: 20 },
        { header: 'Roll Number', key: 'roll', width: 20 },
        { header: 'Student Name', key: 'name', width: 30 },
        { header: 'Status', key: 'status', width: 10 },
      ],
      attendance
        .map((rec) => ({ rec, cls: classById.get(rec.class_id) }))
        .filter((x) => x.cls)
        .sort((a, b) => {
          const da = `${a.cls!.date} ${a.cls!.start_time}`;
          const db = `${b.cls!.date} ${b.cls!.start_time}`;
          if (da !== db) return da < db ? -1 : 1;
          return (a.rec.student_roll_number || '').localeCompare(b.rec.student_roll_number || '');
        })
        .map(({ rec, cls }) => [
          formatDateOnly(cls!.date),
          formatTime(cls!.start_time),
          sanitizeFormula(cls!.subjects?.name || 'Unknown'),
          sanitizeFormula(cls!.batches?.name || (cls!.batch_id ? batchNameById.get(cls!.batch_id) || '' : 'All Students')),
          sanitizeFormula(rec.student_roll_number),
          sanitizeFormula(studentNameByRoll.get(rec.student_roll_number) || ''),
          rec.status === 'present' ? 'Present' : 'Absent',
        ])
    );

    // Sheet 7: Events
    addSheet(
      workbook,
      'Events',
      [
        { header: 'Title', key: 'title', width: 35 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Description', key: 'desc', width: 50 },
        { header: 'Scope', key: 'scope', width: 14 },
        { header: 'Created On', key: 'created', width: 16 },
      ],
      events.map((ev) => [
        sanitizeFormula(ev.title),
        formatDateOnly(ev.date),
        sanitizeFormula(ev.description || ''),
        ev.is_global ? 'Global' : 'Classroom',
        formatDateOnly(ev.created_at),
      ])
    );

    // Sheet 8: Summary
    const summaryRows: (string | number)[][] = [];
    students.forEach((s) => {
      const studentSubjects = effectiveAdminId
        ? subjects
        : subjects.filter((sub) => sub.admin_id === s.admin_id);

      studentSubjects.forEach((sub) => {
        const type = normalizeSubjectType(sub.type);
        const minRequired = getMinAttendance(type);
        const tally =
          summaryTally.get(`${s.roll_number}|${sub.id}`) || { attended: 0, absent: 0 };
        const totalMarked = tally.attended + tally.absent;
        const pct = totalMarked > 0 ? Math.round((tally.attended / totalMarked) * 100) : null;
        const meets = meetsMinimumAttendance(tally.attended, totalMarked, minRequired);
        const needed = classesNeededToReachMinimum(tally.attended, totalMarked, minRequired);
        summaryRows.push([
          sanitizeFormula(s.roll_number),
          sanitizeFormula(s.name),
          sanitizeFormula(sub.name),
          getSubjectTypeOption(type).label,
          minRequired,
          tally.attended,
          tally.absent,
          totalMarked,
          pct !== null ? pct : '--',
          totalMarked === 0 ? '--' : meets ? 'Yes' : 'No',
          totalMarked === 0 ? '--' : needed,
        ]);
      });
    });

    const summaryWs = addSheet(
      workbook,
      'Summary',
      [
        { header: 'Roll Number', key: 'roll', width: 20 },
        { header: 'Student Name', key: 'name', width: 30 },
        { header: 'Subject', key: 'subject', width: 35 },
        { header: 'Subject Type', key: 'type', width: 14 },
        { header: 'Min Required %', key: 'min', width: 15 },
        { header: 'Attended', key: 'attended', width: 10 },
        { header: 'Absent', key: 'absent', width: 10 },
        { header: 'Total Marked', key: 'total', width: 13 },
        { header: 'Attendance %', key: 'pct', width: 13 },
        { header: 'Meets Requirement', key: 'meets', width: 18 },
        { header: 'Classes Needed To Reach Min', key: 'needed', width: 26 },
      ],
      summaryRows
    );

    summaryRows.forEach((row, idx) => {
      if (row[9] === 'No') {
        summaryWs.getRow(idx + 2).eachCell((cell) => {
          cell.font = { color: { argb: 'FFDC2626' }, bold: true };
        });
      }
    });

    const scopeLabel = effectiveAdminId
      ? adminMap.get(effectiveAdminId)?.classroom_code || 'classroom'
      : 'master';
    const filename = `attendance-${scopeLabel}-backup-${formatDateOnly(new Date().toISOString())}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': EXCEL_MIME,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate backup.';
    return new Response(message, { status: 500 });
  }
}
