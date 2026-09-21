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

  // Strip script and style blocks completely along with their contents
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Strip all remaining HTML tags
  clean = clean.replace(/<[^>]*>/g, '');

  // Neutralize dangerous protocol schemes if present
  clean = clean.replace(/javascript:/gi, '').replace(/data:/gi, '');

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
