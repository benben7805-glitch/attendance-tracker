import ExcelJS from 'exceljs';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/app/actions';
import { verifyOrigin } from '@/lib/security';
import { normalizeSubjectType } from '@/lib/attendance';

// ==========================================
// Restore endpoint: uploads an Excel backup
// produced by /api/backup and restores all
// data: students, subjects, batches, batch_students,
// classes, attendance, and events.
// ==========================================

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const CHUNK_SIZE = 500;

interface ParsedStudent {
  rollNumber: string;
  name: string;
}

interface ParsedSubject {
  name: string;
  type: string;
}

interface ParsedBatch {
  name: string;
  subject: string;
}

interface ParsedBatchStudent {
  batchName: string;
  subject: string;
  rollNumber: string;
}

interface ParsedClassRow {
  subject: string;
  batchName?: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface ParsedAttendanceRow {
  subject: string;
  batchName?: string;
  date: string;
  startTime: string;
  rollNumber: string;
  status: 'present' | 'absent';
}

interface ParsedEvent {
  title: string;
  date: string;
  description: string;
}

type Row = Record<string, unknown>;

// ---------- Cell helpers ----------

function unwrapFormula(raw: ExcelJS.CellValue): ExcelJS.CellValue {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    !(raw instanceof Date) &&
    !('richText' in raw) &&
    'result' in raw
  ) {
    return ((raw as { result?: unknown }).result ?? null) as ExcelJS.CellValue;
  }
  return raw;
}

function textOfCell(raw: ExcelJS.CellValue): string {
  const value = unwrapFormula(raw);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    // Strip formula-escaping single quote if present
    const trimmed = value.trim();
    return trimmed.startsWith("'") ? trimmed.substring(1) : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().substring(0, 10);
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((t) => String(t.text ?? '')).join('').trim();
  }
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink.trim();
  if ('error' in value) return '';
  return String(value).trim();
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function dateOfCell(raw: ExcelJS.CellValue): string | null {
  const value = unwrapFormula(raw);
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString().substring(0, 10);
  }
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
  }

  const s = textOfCell(raw);
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${pad2(Number(isoMatch[2]))}-${pad2(Number(isoMatch[3]))}`;
  }
  const dmyMatch = s.match(/^(\d{1,2})[/.,](\d{1,2})[/.,](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${pad2(Number(dmyMatch[2]))}-${pad2(Number(dmyMatch[1]))}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }
  return null;
}

function timeOfCell(raw: ExcelJS.CellValue): string | null {
  const value = unwrapFormula(raw);
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
  }
  if (typeof value === 'number') {
    let frac = value % 1;
    if (frac < 0) frac += 1;
    const totalSeconds = Math.round(frac * 86400);
    return `${pad2(Math.floor(totalSeconds / 3600) % 24)}:${pad2(
      Math.floor((totalSeconds % 3600) / 60)
    )}`;
  }

  const s = textOfCell(raw);
  if (!s) return null;

  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (m) {
    let h = Number(m[1]);
    const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${pad2(h)}:${m[2]}`;
  }
  return null;
}

function statusOfCell(raw: ExcelJS.CellValue): 'present' | 'absent' | null {
  const s = textOfCell(raw).toLowerCase();
  if (s.startsWith('p')) return 'present';
  if (s.startsWith('a')) return 'absent';
  return null;
}

// ---------- Sheet helpers ----------

interface SheetColumns {
  [normalizedHeader: string]: number;
}

function buildColumnMap(sheet: ExcelJS.Worksheet): SheetColumns {
  const map: SheetColumns = {};
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = textOfCell(cell.value).toLowerCase().replace(/[^a-z0-9%]/g, '');
    if (normalized && !(normalized in map)) {
      map[normalized] = colNumber;
    }
  });
  return map;
}

function readRows<T>(
  sheet: ExcelJS.Worksheet | null | undefined,
  columns: SheetColumns,
  colKeys: string[],
  parse: (cells: ExcelJS.CellValue[], rowNumber: number) => T | null,
  parsed: T[]
): void {
  if (!sheet) return;
  const colNumbers: (number | null)[] = colKeys.map((key) => columns[key] ?? null);
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = colNumbers.map((col) =>
      col ? row.getCell(col).value : null
    ) as ExcelJS.CellValue[];
    const item = parse(cells, rowNumber);
    if (item !== null) parsed.push(item);
  });
}

async function insertChunked(table: string, rows: Row[], select: string): Promise<Row[]> {
  const results: Row[] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from(table)
      .insert(chunk as never)
      .select(select);
    if (error) {
      throw new Error(`Failed to write "${table}" during restore: ${error.message}`);
    }
    results.push(...((data || []) as unknown as Row[]));
  }
  return results;
}

// ==========================================
// Route handler
// ==========================================

export async function POST(request: Request) {
  // CSRF verification
  if (!verifyOrigin(request)) {
    return Response.json({ error: 'Forbidden: Cross-site request rejected.' }, { status: 403 });
  }

  // Admin authentication check
  const session = await getSession();
  if (session.role !== 'admin') {
    return Response.json({ error: 'Unauthorized: Admin access required.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const fileEntry = formData.get('file');
    if (!fileEntry || typeof fileEntry === 'string') {
      return Response.json({ error: 'No file was uploaded.' }, { status: 400 });
    }
    const file = fileEntry as File;

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        Buffer.from(await file.arrayBuffer()) as unknown as Parameters<
          ExcelJS.Workbook['xlsx']['load']
        >[0]
      );
    } catch {
      return Response.json(
        { error: 'Could not read the file. Please upload a valid .xlsx backup.' },
        { status: 400 }
      );
    }

    const studentsSheet = workbook.getWorksheet('Students');
    const subjectsSheet = workbook.getWorksheet('Subjects');
    const batchesSheet = workbook.getWorksheet('Batches');
    const batchStudentsSheet = workbook.getWorksheet('Batch Students');
    const classesSheet = workbook.getWorksheet('Classes');
    const attendanceSheet = workbook.getWorksheet('Attendance Log');
    const eventsSheet = workbook.getWorksheet('Events');

    if (!studentsSheet && !subjectsSheet && !classesSheet && !attendanceSheet) {
      return Response.json(
        {
          error:
            'This file does not look like an Attendance Hub backup (no Students, Subjects, Classes, or Attendance Log sheets found).',
        },
        { status: 400 }
      );
    }

    const warnings: string[] = [];

    // ---------- Parse Students ----------
    const parsedStudents: ParsedStudent[] = [];
    const studentCols = studentsSheet ? buildColumnMap(studentsSheet) : {};
    readRows<ParsedStudent>(
      studentsSheet,
      studentCols,
      ['rollnumber', 'name'],
      (cells, rowNumber) => {
        const rollNumber = textOfCell(cells[0]);
        const name = textOfCell(cells[1]);
        if (!rollNumber && !name) return null;
        if (!rollNumber || !name) {
          warnings.push(`Students row ${rowNumber}: missing Roll Number or Name — skipped.`);
          return null;
        }
        return { rollNumber, name };
      },
      parsedStudents
    );

    // ---------- Parse Subjects ----------
    const parsedSubjects: ParsedSubject[] = [];
    const subjectCols = subjectsSheet ? buildColumnMap(subjectsSheet) : {};
    readRows<ParsedSubject>(
      subjectsSheet,
      subjectCols,
      ['name', 'type'],
      (cells) => {
        const name = textOfCell(cells[0]);
        if (!name) return null;
        const typeLabel = textOfCell(cells[1]);
        return { name, type: normalizeSubjectType(typeLabel.toLowerCase()) };
      },
      parsedSubjects
    );

    // ---------- Parse Batches ----------
    const parsedBatches: ParsedBatch[] = [];
    const batchCols = batchesSheet ? buildColumnMap(batchesSheet) : {};
    readRows<ParsedBatch>(
      batchesSheet,
      batchCols,
      ['batchname', 'subject'],
      (cells) => {
        const name = textOfCell(cells[0]);
        const subject = textOfCell(cells[1]);
        if (!name || !subject) return null;
        return { name, subject };
      },
      parsedBatches
    );

    // ---------- Parse Batch Students ----------
    const parsedBatchStudents: ParsedBatchStudent[] = [];
    const batchStudentCols = batchStudentsSheet ? buildColumnMap(batchStudentsSheet) : {};
    readRows<ParsedBatchStudent>(
      batchStudentsSheet,
      batchStudentCols,
      ['batchname', 'subject', 'rollnumber'],
      (cells) => {
        const batchName = textOfCell(cells[0]);
        const subject = textOfCell(cells[1]);
        const rollNumber = textOfCell(cells[2]);
        if (!batchName || !subject || !rollNumber) return null;
        return { batchName, subject, rollNumber };
      },
      parsedBatchStudents
    );

    // ---------- Parse Classes ----------
    const parsedClasses: ParsedClassRow[] = [];
    const classesCols = classesSheet ? buildColumnMap(classesSheet) : {};
    readRows<ParsedClassRow>(
      classesSheet,
      classesCols,
      ['date', 'day', 'subject', 'batch', 'starttime', 'endtime'],
      (cells, rowNumber) => {
        const date = dateOfCell(cells[0]);
        const subject = textOfCell(cells[2]);
        const batchRaw = textOfCell(cells[3]);
        const batchName = batchRaw && batchRaw.toLowerCase() !== 'all students' ? batchRaw : undefined;
        const startTime = timeOfCell(cells[4]);
        const endTime = timeOfCell(cells[5]);
        if (!subject && !date && !startTime) return null;
        if (!subject || !date || !startTime || !endTime) {
          warnings.push(`Classes row ${rowNumber}: incomplete data — skipped.`);
          return null;
        }
        return { subject, batchName, date, startTime, endTime };
      },
      parsedClasses
    );

    // ---------- Parse Attendance Log ----------
    const parsedAttendance: ParsedAttendanceRow[] = [];
    const attendanceCols = attendanceSheet ? buildColumnMap(attendanceSheet) : {};
    readRows<ParsedAttendanceRow>(
      attendanceSheet,
      attendanceCols,
      ['date', 'starttime', 'subject', 'batch', 'rollnumber', 'studentname', 'status'],
      (cells, rowNumber) => {
        const date = dateOfCell(cells[0]);
        const startTime = timeOfCell(cells[1]);
        const subject = textOfCell(cells[2]);
        const batchRaw = textOfCell(cells[3]);
        const batchName = batchRaw && batchRaw.toLowerCase() !== 'all students' ? batchRaw : undefined;
        const rollNumber = textOfCell(cells[4]);
        const status = statusOfCell(cells[6]);
        if (!subject && !rollNumber && !date) return null;
        if (!subject || !date || !startTime || !rollNumber || !status) {
          warnings.push(`Attendance row ${rowNumber}: incomplete record — skipped.`);
          return null;
        }
        return { subject, batchName, date, startTime, rollNumber, status };
      },
      parsedAttendance
    );

    // ---------- Parse Events ----------
    const parsedEvents: ParsedEvent[] = [];
    const eventCols = eventsSheet ? buildColumnMap(eventsSheet) : {};
    readRows<ParsedEvent>(
      eventsSheet,
      eventCols,
      ['title', 'date', 'description'],
      (cells) => {
        const title = textOfCell(cells[0]);
        const date = dateOfCell(cells[1]);
        const description = textOfCell(cells[2]);
        if (!title || !date) return null;
        return { title, date, description };
      },
      parsedEvents
    );

    if (
      parsedStudents.length === 0 &&
      parsedSubjects.length === 0 &&
      parsedClasses.length === 0
    ) {
      return Response.json(
        {
          error:
            'The backup file does not contain enough usable data to restore (no students, subjects, or classes found).',
        },
        { status: 400 }
      );
    }

    // Deduplicate within the file
    const seenRolls = new Set<string>();
    const studentRows = parsedStudents.filter((s) =>
      seenRolls.has(s.rollNumber) ? false : (seenRolls.add(s.rollNumber), true)
    );

    const seenSubjectNames = new Set<string>();
    const subjectRows = parsedSubjects.filter((s) => {
      const key = s.name.toLowerCase();
      return seenSubjectNames.has(key) ? false : (seenSubjectNames.add(key), true);
    });

    // ---------- Wipe existing data in strict child-first order ----------
    const wipeOrder: { table: string; column: string }[] = [
      { table: 'attendance', column: 'id' },
      { table: 'batch_students', column: 'batch_id' },
      { table: 'classes', column: 'id' },
      { table: 'batches', column: 'id' },
      { table: 'events', column: 'id' },
      { table: 'subjects', column: 'id' },
      { table: 'students', column: 'roll_number' },
    ];
    for (const { table, column } of wipeOrder) {
      const { error } = await supabase.from(table).delete().neq(column, ZERO_UUID);
      if (error) {
        throw new Error(`Failed to clear existing "${table}" before restore: ${error.message}`);
      }
    }

    // ---------- Restore Students ----------
    await insertChunked(
      'students',
      studentRows.map((s) => ({ roll_number: s.rollNumber, name: s.name })),
      'roll_number'
    );

    // ---------- Restore Subjects ----------
    const subjectIdByName = new Map<string, string>();
    const insertedSubjects = await insertChunked(
      'subjects',
      subjectRows.map((s) => ({ name: s.name, type: s.type })),
      'id, name, type'
    );
    insertedSubjects.forEach((row) => {
      subjectIdByName.set(`${String(row.name).toLowerCase()}|${String(row.type || 'theory').toLowerCase()}`, String(row.id));
      if (!subjectIdByName.has(String(row.name).toLowerCase())) {
        subjectIdByName.set(String(row.name).toLowerCase(), String(row.id));
      }
    });

    // Re-create missing subjects referenced by classes or attendance
    const referencedSubjectNames = new Set<string>();
    parsedClasses.forEach((c) => referencedSubjectNames.add(c.subject.toLowerCase()));
    parsedAttendance.forEach((a) => referencedSubjectNames.add(a.subject.toLowerCase()));
    parsedBatches.forEach((b) => referencedSubjectNames.add(b.subject.toLowerCase()));
    const missingSubjects = [...referencedSubjectNames].filter((n) => !subjectIdByName.has(n));
    if (missingSubjects.length > 0) {
      const insertedMissing = await insertChunked(
        'subjects',
        missingSubjects.map((name) => ({ name, type: 'theory' })),
        'id, name'
      );
      insertedMissing.forEach((row) => {
        subjectIdByName.set(String(row.name).toLowerCase(), String(row.id));
      });
      warnings.push(
        `Some subjects were missing from the Subjects sheet and were re-created as "Theory": ${missingSubjects.join(', ')}.`
      );
    }

    // ---------- Restore Batches ----------
    const batchIdByKey = new Map<string, string>(); // "subject_id|batch_name" -> batch_id
    const batchRowsToInsert: Row[] = [];
    const seenBatchKeys = new Set<string>();

    for (const b of parsedBatches) {
      const subId = subjectIdByName.get(b.subject.toLowerCase());
      if (!subId) continue;
      const key = `${subId}|${b.name.toLowerCase()}`;
      if (seenBatchKeys.has(key)) continue;
      seenBatchKeys.add(key);
      batchRowsToInsert.push({ subject_id: subId, name: b.name });
    }

    if (batchRowsToInsert.length > 0) {
      const insertedBatches = await insertChunked(
        'batches',
        batchRowsToInsert,
        'id, subject_id, name'
      );
      insertedBatches.forEach((b) => {
        batchIdByKey.set(`${b.subject_id}|${String(b.name).toLowerCase()}`, String(b.id));
      });
    }

    // ---------- Restore Batch Students ----------
    const knownRolls = new Set(studentRows.map((s) => s.rollNumber));
    const batchStudentRowsToInsert: Row[] = [];
    const seenBatchStudentKeys = new Set<string>();

    for (const bs of parsedBatchStudents) {
      if (!knownRolls.has(bs.rollNumber)) continue;
      const subId = subjectIdByName.get(bs.subject.toLowerCase());
      if (!subId) continue;
      const batchId = batchIdByKey.get(`${subId}|${bs.batchName.toLowerCase()}`);
      if (!batchId) continue;

      const key = `${batchId}|${bs.rollNumber}`;
      if (seenBatchStudentKeys.has(key)) continue;
      seenBatchStudentKeys.add(key);
      batchStudentRowsToInsert.push({ batch_id: batchId, student_roll_number: bs.rollNumber });
    }

    if (batchStudentRowsToInsert.length > 0) {
      await insertChunked('batch_students', batchStudentRowsToInsert, 'batch_id, student_roll_number');
    }

    // ---------- Restore Classes ----------
    const seenClassKeys = new Set<string>();
    const classRows: Row[] = [];
    for (const c of parsedClasses) {
      const subjectId = subjectIdByName.get(c.subject.toLowerCase());
      if (!subjectId) continue;

      let batchId: string | undefined;
      if (c.batchName) {
        batchId = batchIdByKey.get(`${subjectId}|${c.batchName.toLowerCase()}`);
      }

      const key = `${subjectId}|${c.date}|${c.startTime}|${batchId || 'null'}`;
      if (seenClassKeys.has(key)) continue;
      seenClassKeys.add(key);

      classRows.push({
        subject_id: subjectId,
        date: c.date,
        start_time: c.startTime,
        end_time: c.endTime,
        ...(batchId ? { batch_id: batchId } : {}),
      });
    }

    const classKeyToId = new Map<string, string>();
    const insertedClasses = await insertChunked(
      'classes',
      classRows,
      'id, subject_id, date, start_time, batch_id'
    );
    insertedClasses.forEach((row) => {
      const bId = row.batch_id ? String(row.batch_id) : 'null';
      const key = `${row.subject_id}|${String(row.date).substring(0, 10)}|${String(
        row.start_time
      ).substring(0, 5)}|${bId}`;
      classKeyToId.set(key, String(row.id));
    });

    // ---------- Restore Attendance ----------
    const seenAttendanceKeys = new Set<string>();
    const attendanceRows: Row[] = [];
    for (const a of parsedAttendance) {
      if (!knownRolls.has(a.rollNumber)) continue;
      const subjectId = subjectIdByName.get(a.subject.toLowerCase());
      if (!subjectId) continue;

      let batchId: string | undefined;
      if (a.batchName) {
        batchId = batchIdByKey.get(`${subjectId}|${a.batchName.toLowerCase()}`);
      }

      // First try matching class with batch, fallback to non-batch class
      let classId = classKeyToId.get(`${subjectId}|${a.date}|${a.startTime}|${batchId || 'null'}`);
      if (!classId && batchId) {
        classId = classKeyToId.get(`${subjectId}|${a.date}|${a.startTime}|null`);
      }
      if (!classId) continue;

      const key = `${classId}|${a.rollNumber}`;
      if (seenAttendanceKeys.has(key)) continue;
      seenAttendanceKeys.add(key);

      attendanceRows.push({
        class_id: classId,
        student_roll_number: a.rollNumber,
        status: a.status,
      });
    }

    if (attendanceRows.length > 0) {
      await insertChunked('attendance', attendanceRows, 'id');
    }

    // ---------- Restore Events ----------
    if (parsedEvents.length > 0) {
      await insertChunked(
        'events',
        parsedEvents.map((ev) => ({
          title: ev.title,
          date: ev.date,
          description: ev.description || null,
        })),
        'id'
      );
    }

    return Response.json({
      success: true,
      counts: {
        students: studentRows.length,
        subjects: subjectIdByName.size,
        batches: batchIdByKey.size,
        classes: classRows.length,
        attendance: attendanceRows.length,
        events: parsedEvents.length,
      },
      warnings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Restore failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}
