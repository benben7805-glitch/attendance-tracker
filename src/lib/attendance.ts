// Shared attendance rules used by both server actions and client components.
// NOTE: Cannot live in actions.ts because "use server" files may only export async functions.

export type SubjectType = 'theory' | 'practical' | 'clinics';

export interface SubjectTypeOption {
  value: SubjectType;
  label: string;
  icon: string;
}

export const SUBJECT_TYPES: SubjectTypeOption[] = [
  { value: 'theory', label: 'Theory', icon: '📘' },
  { value: 'practical', label: 'Practical', icon: '🧪' },
  { value: 'clinics', label: 'Clinics', icon: '🏥' },
];

// Minimum required attendance percentage per subject type.
// Theory: 75%, Practical/Clinics: 80%
export const MIN_ATTENDANCE: Record<SubjectType, number> = {
  theory: 75,
  practical: 80,
  clinics: 80,
};

export function normalizeSubjectType(type: unknown): SubjectType {
  return type === 'practical' || type === 'clinics' ? type : 'theory';
}

export function getSubjectTypeOption(type: unknown): SubjectTypeOption {
  const normalized = normalizeSubjectType(type);
  return SUBJECT_TYPES.find((t) => t.value === normalized) || SUBJECT_TYPES[0];
}

export function getMinAttendance(type: unknown): number {
  return MIN_ATTENDANCE[normalizeSubjectType(type)];
}

/**
 * Minimum number of consecutive future classes the student must attend so that
 * attended / total reaches at least thresholdPct (0-100).
 * Solves (attended + n) / (total + n) >= thresholdPct / 100  =>  n >= (p*total - attended) / (1 - p)
 */
export function classesNeededToReachMinimum(
  attended: number,
  total: number,
  thresholdPct: number
): number {
  if (total <= 0) return 0;
  const p = thresholdPct / 100;
  if (p >= 1) return Infinity;
  const rawNeeded = (p * total - attended) / (1 - p);
  return Math.max(0, Math.ceil(rawNeeded));
}

/** Exact-ratio check (avoids rounding artifacts from percentage display). */
export function meetsMinimumAttendance(
  attended: number,
  total: number,
  thresholdPct: number
): boolean {
  if (total <= 0) return true;
  return attended / total >= thresholdPct / 100;
}
