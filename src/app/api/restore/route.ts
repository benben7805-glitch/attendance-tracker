import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { supabase } from '@/lib/supabase';
import { normalizeSubjectType } from '@/lib/attendance';

// ==========================================
// Restore endpoint: uploads an Excel backup
// produced by /api/backup and replaces the
// database contents with the data in it.
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

interface ParsedClassRow {
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface ParsedAttendanceRow {
  subject: string;
  date: string;
  startTime: string;
  rollNumber: string;
  status: 'present' | 'absent';
}

type Row = Record<string, unknown>;

// ---------- Cell helpers ----------

/** If the cell holds a formula, return its cached result instead. */
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
  if (typeof value === 'string') return value.trim();
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

/** Normalize a cell into a YYYY-MM-DD date string (null if empty/unparseable). */
function dateOfCell(raw: ExcelJS.CellValue): string | null {
  const value = unwrapFormula(raw);
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString().substring(0, 10);
  }
  if (typeof value === 'number') {
    // Excel serial date: days since 1899-12-30 (= 25569 days before Unix epoch)
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
  }

  const s = textOfCell(raw);
  if (!s) return null;

  // ISO-ish: 2026-08-24 (optionally followed by a time part)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${pad2(Number(isoMatch[2]))}-${pad2(Number(isoMatch[3]))}`;
  }
  // DD/MM/YYYY, DD.MM.YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/.,](\d{1,2})[/.,](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${pad2(Number(dmyMatch[2]))}-${pad2(Number(dmyMatch[1]))}`;
  }
  // Generic JS Date parse fallback
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }
  return null;
}

/** Normalize a cell into an HH:MM time string (null if empty/unparseable). */
function timeOfCell(raw: ExcelJS.CellValue): string | null {
  const value = unwrapFormula(raw);
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
  }
  if (typeof value === 'number') {
    // Fraction of a day
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

/**
 * Reads every data row of a sheet using the given header keys, parses each row
 * with `parse`, and appends valid results to `parsed`. Invalid/empty rows must
 * be handled inside `parse` (e.g. collecting warnings).
 */
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
  const cookieStore = await cookies();
  if (cookieStore.get('auth_role')?.value !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
        { error: 'Could not read the file. Please upload the original .xlsx backup.' },
        { status: 400 }
      );
    }

    const studentsSheet = workbook.getWorksheet('Students');
    const subjectsSheet = workbook.getWorksheet('Subjects');
    const classesSheet = workbook.getWorksheet('Classes');
    const attendanceSheet = workbook.getWorksheet('Attendance Log');

    if (!studentsSheet && !subjectsSheet && !classesSheet && !attendanceSheet) {
      return Response.json(
        {
          error:
            'This file does not look like an Attendance Hub backup (no Students / Subjects / Classes / Attendance Log worksheets found).',
        },
        { status: 400 }
      );
    }

    const warnings: string[] = [];

    // ---------- Parse Students ----------
    const parsedStudents: ParsedStudent[] = [];
    const studentCols = studentsSheet ? buildColumnMap(studentsSheet) : {};
    if (studentsSheet && !studentCols['rollnumber']) {
      warnings.push('Students sheet has no "Roll Number" column — it was skipped.');
    }
    readRows<ParsedStudent>(
      studentsSheet,
      studentCols,
      ['rollnumber', 'name'],
      (cells, rowNumber) => {
        const rollNumber = textOfCell(cells[0]);
        const name = textOfCell(cells[1]);
        if (!rollNumber && !name) return null;
        if (!rollNumber || !name) {
          warnings.push(
            `Students row ${rowNumber}: missing ${!rollNumber ? 'Roll Number' : 'Name'} — skipped.`
          );
          return null;
        }
        return { rollNumber, name };
      },
      parsedStudents
    );

    // ---------- Parse Subjects ----------
    const parsedSubjects: ParsedSubject[] = [];
    const subjectCols = subjectsSheet ? buildColumnMap(subjectsSheet) : {};
    if (subjectsSheet && !subjectCols['name']) {
      warnings.push('Subjects sheet has no "Name" column — it was skipped.');
    }
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

    // ---------- Parse Classes ----------
    const parsedClasses: ParsedClassRow[] = [];
    const classesCols = classesSheet ? buildColumnMap(classesSheet) : {};
    if (classesSheet && (!classesCols['subject'] || !classesCols['date'])) {
      warnings.push('Classes sheet is missing "Subject" or "Date" columns — it was skipped.');
    }
    readRows<ParsedClassRow>(
      classesSheet,
      classesCols,
      ['date', 'day', 'subject', 'starttime', 'endtime'],
      (cells, rowNumber) => {
        const date = dateOfCell(cells[0]);
        const subject = textOfCell(cells[2]);
        const startTime = timeOfCell(cells[3]);
        const endTime = timeOfCell(cells[4]);
        if (!subject && !date && !startTime) return null;
        if (!subject || !date || !startTime || !endTime) {
          warnings.push(
            `Classes row ${rowNumber}: incomplete (needs Subject, Date, Start Time, End Time) — skipped.`
          );
          return null;
        }
        return { subject, date, startTime, endTime };
      },
      parsedClasses
    );

    // ---------- Parse Attendance Log ----------
    const parsedAttendance: ParsedAttendanceRow[] = [];
    const attendanceCols = attendanceSheet ? buildColumnMap(attendanceSheet) : {};
    if (attendanceSheet && (!attendanceCols['rollnumber'] || !attendanceCols['status'])) {
      warnings.push(
        'Attendance Log sheet is missing "Roll Number" or "Status" columns — it was skipped.'
      );
    }
    readRows<ParsedAttendanceRow>(
      attendanceSheet,
      attendanceCols,
      ['date', 'starttime', 'subject', 'rollnumber', 'studentname', 'status'],
      (cells, rowNumber) => {
        const date = dateOfCell(cells[0]);
        const startTime = timeOfCell(cells[1]);
        const subject = textOfCell(cells[2]);
        const rollNumber = textOfCell(cells[3]);
        const status = statusOfCell(cells[5]);
        if (!subject && !rollNumber && !date) return null;
        if (!subject || !date || !startTime || !rollNumber || !status) {
          warnings.push(`Attendance Log row ${rowNumber}: incomplete record — skipped.`);
          return null;
        }
        return { subject, date, startTime, rollNumber, status };
      },
      parsedAttendance
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

    // ---------- Wipe existing data (children first for FK safety) ----------
    const wipeOrder: { table: string; column: string }[] = [
      { table: 'attendance', column: 'id' },
      { table: 'classes', column: 'id' },
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
      'id, name'
    );
    insertedSubjects.forEach((row) => {
      subjectIdByName.set(String(row.name).toLowerCase(), String(row.id));
    });

    // Classes/attendance may reference subjects missing from the Subjects sheet
    if (parsedClasses.length > 0 || parsedAttendance.length > 0) {
      const referencedNames = new Set<string>();
      parsedClasses.forEach((c) => referencedNames.add(c.subject.toLowerCase()));
      parsedAttendance.forEach((a) => referencedNames.add(a.subject.toLowerCase()));
      const missingSubjects = [...referencedNames].filter((n) => !subjectIdByName.has(n));
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
          `Some subjects referenced by classes were missing from the Subjects sheet and were re-created as "Theory": ${missingSubjects.join(', ')}.`
        );
      }
    }

    // ---------- Restore Classes ----------
    const seenClassKeys = new Set<string>();
    const classRows: Row[] = [];
    const unknownClassSubjects = new Set<string>();
    for (const c of parsedClasses) {
      const subjectId = subjectIdByName.get(c.subject.toLowerCase());
      if (!subjectId) {
        unknownClassSubjects.add(c.subject);
        continue;
      }
      const key = `${subjectId}|${c.date}|${c.startTime}`;
      if (seenClassKeys.has(key)) continue;
      seenClassKeys.add(key);
      classRows.push({
        subject_id: subjectId,
        date: c.date,
        start_time: c.startTime,
        end_time: c.endTime,
      });
    }
    if (unknownClassSubjects.size > 0) {
      warnings.push(
        `Some classes reference subjects that could not be resolved: ${[...unknownClassSubjects].join(', ')}.`
      );
    }

    const classKeyToId = new Map<string, string>();
    const insertedClasses = await insertChunked(
      'classes',
      classRows,
      'id, subject_id, date, start_time'
    );
    insertedClasses.forEach((row) => {
      const key = `${row.subject_id}|${String(row.date).substring(0, 10)}|${String(
        row.start_time
      ).substring(0, 5)}`;
      classKeyToId.set(key, String(row.id));
    });

    // ---------- Restore Attendance ----------
    const seenAttendanceKeys = new Set<string>();
    const attendanceRows: Row[] = [];
    const knownRolls = new Set(studentRows.map((s) => s.rollNumber));
    const missingClassKeys = new Set<string>();
    const unknownAttendanceRolls = new Set<string>();
    for (const a of parsedAttendance) {
      if (!knownRolls.has(a.rollNumber)) {
        unknownAttendanceRolls.add(a.rollNumber);
        continue;
      }
      const subjectId = subjectIdByName.get(a.subject.toLowerCase());
      if (!subjectId) {
        missingClassKeys.add(`${a.subject} on ${a.date} ${a.startTime}`);
        continue;
      }
      const classId = classKeyToId.get(`${subjectId}|${a.date}|${a.startTime}`);
      if (!classId) {
        missingClassKeys.add(`${a.subject} on ${a.date} ${a.startTime}`);
        continue;
      }
      const key = `${classId}|${a.rollNumber}`;
      if (seenAttendanceKeys.has(key)) continue;
      seenAttendanceKeys.add(key);
      attendanceRows.push({
        class_id: classId,
        student_roll_number: a.rollNumber,
        status: a.status,
      });
    }
    if (missingClassKeys.size > 0) {
      warnings.push(
        `Some attendance records had no matching class row in the backup: ${[...missingClassKeys]
          .slice(0, 10)
          .join('; ')}${missingClassKeys.size > 10 ? '; …' : ''}.`
      );
    }
    if (unknownAttendanceRolls.size > 0) {
      warnings.push(
        `Some attendance records reference roll numbers not present in the Students sheet: ${[
          ...unknownAttendanceRolls,
        ].join(', ')}.`
      );
    }

    await insertChunked('attendance', attendanceRows, 'id');

    return Response.json({
      success: true,
      counts: {
        students: studentRows.length,
        subjects: subjectIdByName.size,
        classes: classRows.length,
        attendance: attendanceRows.length,
      },
      warnings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Restore failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}
