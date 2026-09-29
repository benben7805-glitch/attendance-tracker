/**
 * Enterprise Security Utilities
 * - XSS input sanitization
 * - Formula injection neutralization (CWE-1236)
 * - CSRF / Origin verification for route handlers
 */

/**
 * Strips script tags, HTML tags, control characters, and limits string length.
 */
export function sanitizeText(input: unknown, maxLength: number = 255): string {
  if (typeof input !== 'string') return '';

  // Remove null bytes and control characters (except common whitespace)
  let clean = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Strip angle brackets to prevent any HTML/XML tag creation (CodeQL-safe single-character class)
  clean = clean.replace(/[<>]/g, '');

  // Trim and cap length
  clean = clean.trim();
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }

  return clean;
}

/**
 * Normalizes and sanitizes a student roll number.
 * Allows only alphanumeric characters, dashes, and underscores (max 50 chars).
 */
export function sanitizeRollNumber(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\-_]/g, '')
    .substring(0, 50);
}

/**
 * Normalizes and sanitizes a classroom code.
 * Allows uppercase alphanumeric characters, dashes, and underscores (max 20 chars).
 */
export function sanitizeClassroomCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\-_]/g, '')
    .substring(0, 20);
}

export interface ParsedStudentId {
  isPrefixed: boolean;
  classroomCode?: string;
  rollNumber: string;
  cleanInput: string;
}

/**
 * Parses a student login input (e.g. "MBBS20261", "MBBS202612", "MBBS2026-01", or "1").
 * Matches against known active classroom codes greedily (longest first).
 */
export function parseStudentCompositeId(
  input: unknown,
  activeClassroomCodes: string[] = []
): ParsedStudentId {
  if (typeof input !== 'string') {
    return { isPrefixed: false, rollNumber: '', cleanInput: '' };
  }

  // Normalize: uppercase and strip whitespace
  const clean = input.trim().toUpperCase().replace(/[\s/]+/g, '-');
  if (!clean) {
    return { isPrefixed: false, rollNumber: '', cleanInput: '' };
  }

  // Sort classroom codes descending by length to match longest prefix first
  const sortedCodes = [...activeClassroomCodes]
    .map((c) => sanitizeClassroomCode(c))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (clean.startsWith(code)) {
      let remainder = clean.substring(code.length);
      // Strip leading delimiters like '-', '_', ':'
      remainder = remainder.replace(/^[-_:]+/, '');
      if (remainder.length > 0) {
        return {
          isPrefixed: true,
          classroomCode: code,
          rollNumber: remainder,
          cleanInput: clean,
        };
      }
    }
  }

  return {
    isPrefixed: false,
    rollNumber: clean.replace(/^[-_:]+/, ''),
    cleanInput: clean,
  };
}

/**
 * Neutralizes Excel / CSV Formula Injection (CWE-1236).
 * If a cell string starts with '=', '+', '-', '@', '\t', or '\r',
 * it prepends a single quote so spreadsheet programs treat it as plain text.
 */
export function sanitizeFormula(input: unknown): string {
  if (input === null || input === undefined) return '';
  const text = String(input);
  if (/^[=+@\t\r-]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

/**
 * Validates request Origin / Referer against Host for CSRF defense on Route Handlers.
 */
export function verifyOrigin(request: Request): boolean {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!host) return true; // Local or non-proxied without host header

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      return refererHost === host;
    } catch {
      return false;
    }
  }

  // Next.js direct Server Action or programmatic call without cross-origin headers
  return true;
}
