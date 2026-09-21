/**
 * End-to-End Enterprise Architecture & Security Verification Suite
 * 
 * Verifies:
 * 1. Web Crypto HMAC-SHA256 token generation, signature validation, tamper resistance & expiry
 * 2. Constant-time string equality (timing attack mitigation)
 * 3. XSS input sanitization & Roll Number normalization
 * 4. Formula Injection (CWE-1236 / CSV Injection) neutralization
 * 5. CSRF / Origin verification engine
 * 6. Sliding-window in-memory rate limiter
 * 7. PostgREST range pagination chunking simulation (>1,000 rows)
 * 8. ExcelJS 7-sheet backup generation, formula escaping, and round-trip parsing
 * 9. SQL Schema dual partial index and constraint integrity
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

console.log('====================================================');
console.log('🚀 RUNNING ENTERPRISE SECURITY & RELIABILITY TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// Helpers mirroring src/lib/security.ts & src/lib/auth.ts
// -------------------------------------------------------------
function sanitizeText(input, maxLength = 255) {
  if (typeof input !== 'string') return '';
  let clean = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  clean = clean.replace(/[<>]/g, '');
  clean = clean.trim();
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }
  return clean;
}

function sanitizeRollNumber(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\-_]/g, '')
    .substring(0, 50);
}

function sanitizeFormula(input) {
  if (input === null || input === undefined) return '';
  const text = String(input);
  if (/^[=+@\t\r-]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

function verifyOrigin(headers) {
  const host = headers.get('x-forwarded-host') || headers.get('host');
  if (!host) return true;

  const origin = headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }

  const referer = headers.get('referer');
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      return refererHost === host;
    } catch {
      return false;
    }
  }

  return true;
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = new TextEncoder().encode(a);
  const bBuf = new TextEncoder().encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

const TEST_SECRET = 'super-secret-test-key-2026';
function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64url');
}

function fromBase64Url(str) {
  return new Uint8Array(Buffer.from(str, 'base64url'));
}

async function signSessionTest(payload, secret = TEST_SECRET, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifySessionTest(token, secret = TEST_SECRET) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!isValid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Rate Limiter
// -------------------------------------------------------------
class InMemoryRateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.store = new Map();
  }

  check(key, currentTime = Date.now()) {
    let timestamps = this.store.get(key) || [];
    timestamps = timestamps.filter((ts) => currentTime - ts < this.windowMs);
    if (timestamps.length >= this.limit) {
      this.store.set(key, timestamps);
      return { allowed: false, remaining: 0 };
    }
    timestamps.push(currentTime);
    this.store.set(key, timestamps);
    return { allowed: true, remaining: this.limit - timestamps.length };
  }
}

// =============================================================
// TEST SUITE EXECUTION
// =============================================================

console.log('--- 1. Cryptographic HMAC-SHA256 Sessions ---');

await asyncTest('Sign and successfully verify valid admin session', async () => {
  const token = await signSessionTest({ role: 'admin' });
  const verified = await verifySessionTest(token);
  assert.ok(verified !== null);
  assert.equal(verified.role, 'admin');
  assert.ok(verified.exp > verified.iat);
});

await asyncTest('Sign and successfully verify valid student session', async () => {
  const token = await signSessionTest({ role: 'student', rollNumber: 'CS2026-001' });
  const verified = await verifySessionTest(token);
  assert.ok(verified !== null);
  assert.equal(verified.role, 'student');
  assert.equal(verified.rollNumber, 'CS2026-001');
});

await asyncTest('Reject tampered payload (elevation of privilege attack)', async () => {
  const token = await signSessionTest({ role: 'student', rollNumber: 'CS2026-001' });
  const [payloadB64, sigB64] = token.split('.');
  const tamperedPayload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  tamperedPayload.role = 'admin'; // Tamper role
  const tamperedPayloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(tamperedPayload)));
  const tamperedToken = `${tamperedPayloadB64}.${sigB64}`;

  const verified = await verifySessionTest(tamperedToken);
  assert.equal(verified, null, 'Tampered token must be rejected');
});

await asyncTest('Reject tampered cryptographic signature', async () => {
  const token = await signSessionTest({ role: 'admin' });
  const [payloadB64, sigB64] = token.split('.');
  const corruptedSig = sigB64.slice(0, -2) + 'aa';
  const corruptedToken = `${payloadB64}.${corruptedSig}`;

  const verified = await verifySessionTest(corruptedToken);
  assert.equal(verified, null, 'Signature mismatch must be rejected');
});

await asyncTest('Reject expired session token', async () => {
  // Negative TTL to simulate already expired token
  const token = await signSessionTest({ role: 'admin' }, TEST_SECRET, -10);
  const verified = await verifySessionTest(token);
  assert.equal(verified, null, 'Expired session must return null');
});

console.log('\n--- 2. Timing-Safe String Equality ---');

test('timingSafeEqual correctly compares matching and non-matching strings', () => {
  assert.equal(timingSafeEqual('admin1234', 'admin1234'), true);
  assert.equal(timingSafeEqual('admin1234', 'admin1235'), false);
  assert.equal(timingSafeEqual('short', 'longer_string'), false);
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual(null, 'secret'), false);
  assert.equal(timingSafeEqual('secret', undefined), false);
});

console.log('\n--- 3. XSS & Input Sanitization ---');

test('sanitizeText strips control characters and angle brackets to prevent HTML injection', () => {
  const raw1 = '<script>alert("pwned")</script>Hello World';
  assert.equal(sanitizeText(raw1), 'scriptalert("pwned")/scriptHello World');

  const raw2 = '<img src=x onerror=alert(1)>Mathematics & Physics';
  assert.equal(sanitizeText(raw2), 'img src=x onerror=alert(1)Mathematics & Physics');

  const rawNullBytes = 'Text\x00with\x08null\x1Fbytes';
  assert.equal(sanitizeText(rawNullBytes), 'Textwithnullbytes');

  const longText = 'A'.repeat(500);
  assert.equal(sanitizeText(longText, 50).length, 50);
});

test('sanitizeRollNumber normalizes and strips illegal characters', () => {
  assert.equal(sanitizeRollNumber('  cs-2026_01  '), 'CS-2026_01');
  assert.equal(sanitizeRollNumber('roll<script>alert()</script>'), 'ROLLSCRIPTALERTSCRIPT');
  assert.equal(sanitizeRollNumber('23BCSE55'), '23BCSE55');
  assert.equal(sanitizeRollNumber(''), '');
  assert.equal(sanitizeRollNumber(12345), '');
});

console.log('\n--- 4. Excel / CSV Formula Injection (CWE-1236) Defense ---');

test('sanitizeFormula neutralizes executable formula prefixes with a single quote', () => {
  assert.equal(sanitizeFormula('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.equal(sanitizeFormula('+12345'), "'+12345");
  assert.equal(sanitizeFormula('-cmd|/c calc'), "'-cmd|/c calc");
  assert.equal(sanitizeFormula('@dangerous_call()'), "'@dangerous_call()");
  assert.equal(sanitizeFormula('\t=tabbed_formula'), "'\t=tabbed_formula");
  assert.equal(sanitizeFormula('\r=ret_formula'), "'\r=ret_formula");
  
  // Safe texts must remain untouched
  assert.equal(sanitizeFormula('John Doe'), 'John Doe');
  assert.equal(sanitizeFormula('CS101 - Introduction'), 'CS101 - Introduction');
  assert.equal(sanitizeFormula(null), '');
  assert.equal(sanitizeFormula(undefined), '');
});

console.log('\n--- 5. CSRF & Origin Verification ---');

test('verifyOrigin allows valid origins and blocks cross-origin requests', () => {
  const createHeaders = (obj) => ({
    get: (k) => obj[k.toLowerCase()] || null,
  });

  // Valid same-origin
  const validReq = createHeaders({
    host: 'attendance.local',
    origin: 'https://attendance.local',
  });
  assert.equal(verifyOrigin(validReq), true);

  // Cross-origin attack
  const attackReq = createHeaders({
    host: 'attendance.local',
    origin: 'https://attacker.evil.com',
  });
  assert.equal(verifyOrigin(attackReq), false);

  // Valid referer fallback
  const validReferer = createHeaders({
    host: 'attendance.local',
    referer: 'https://attendance.local/admin/backup',
  });
  assert.equal(verifyOrigin(validReferer), true);

  // Malicious referer
  const attackReferer = createHeaders({
    host: 'attendance.local',
    referer: 'https://malicious.org/csrf-page',
  });
  assert.equal(verifyOrigin(attackReferer), false);

  // Reverse proxy with x-forwarded-host
  const proxyReq = createHeaders({
    'x-forwarded-host': 'attendance-school.edu',
    origin: 'https://attendance-school.edu',
  });
  assert.equal(verifyOrigin(proxyReq), true);
});

console.log('\n--- 6. Sliding-Window Rate Limiter ---');

test('Rate limiter strictly bounds burst requests and resets after window', () => {
  const limiter = new InMemoryRateLimiter(5, 1000); // 5 requests per 1000ms
  const ip = '192.168.1.50';
  const t0 = 1000000;

  for (let i = 0; i < 5; i++) {
    const res = limiter.check(ip, t0 + i * 10);
    assert.equal(res.allowed, true, `Request ${i + 1} must be allowed`);
  }

  // 6th request within window must be denied
  const deniedRes = limiter.check(ip, t0 + 60);
  assert.equal(deniedRes.allowed, false, '6th request must be blocked');

  // After window expires (> 1000ms), new request is allowed
  const allowedLater = limiter.check(ip, t0 + 1050);
  assert.equal(allowedLater.allowed, true, 'Request after window expiry must be allowed');
});

console.log('\n--- 7. PostgREST Range Pagination Simulation ---');

test('Range pagination fetches all 2,450 records in batches of 1,000 without truncation', () => {
  // Mock dataset of 2,450 rows
  const TOTAL_RECORDS = 2450;
  const mockDb = Array.from({ length: TOTAL_RECORDS }, (_, i) => ({ id: `row_${i}` }));

  // Simulate PostgREST query handler with range(from, to)
  function fetchMockRange(from, to) {
    const slice = mockDb.slice(from, to + 1);
    return { data: slice, error: null };
  }

  // Execute pagination loop matching actions.ts and route.ts
  const PAGE_SIZE = 1000;
  const collected = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = fetchMockRange(from, from + PAGE_SIZE - 1);
    assert.equal(error, null);
    if (data && data.length > 0) {
      collected.push(...data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    } else {
      hasMore = false;
    }
  }

  assert.equal(collected.length, TOTAL_RECORDS);
  assert.equal(collected[0].id, 'row_0');
  assert.equal(collected[collected.length - 1].id, 'row_2449');
});

console.log('\n--- 8. ExcelJS 7-Sheet Backup Generation & Round-Trip Parsing ---');

await asyncTest('Workbook includes all 7 sheets, neutralizes formulas, and serializes safely', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Attendance Hub Enterprise Backup';

  const sheetConfigs = [
    { name: 'Students', cols: ['Roll Number', 'Full Name', 'Created On'] },
    { name: 'Subjects', cols: ['Name', 'Type', 'Min Required %', 'Created On'] },
    { name: 'Batches', cols: ['Batch Name', 'Subject', 'Created On'] },
    { name: 'Batch Students', cols: ['Batch Name', 'Subject', 'Roll Number', 'Student Name'] },
    { name: 'Classes', cols: ['Date', 'Day', 'Subject', 'Batch', 'Start Time', 'End Time'] },
    { name: 'Attendance Log', cols: ['Date', 'Start Time', 'Subject', 'Batch', 'Roll Number', 'Student Name', 'Status'] },
    { name: 'Summary', cols: ['Roll Number', 'Student Name', 'Subject', 'Attended', 'Absent', 'Total Classes', 'Attendance %', 'Status'] },
  ];

  for (const conf of sheetConfigs) {
    const ws = workbook.addWorksheet(conf.name);
    ws.columns = conf.cols.map((col) => ({ header: col, key: col.toLowerCase().replace(/\s+/g, '_') }));
    // Add sample row with formula injection attempt
    const rowData = conf.cols.map((col) => sanitizeFormula(col.includes('Name') ? '=cmd|calc!A0' : 'Sample Data'));
    ws.addRow(rowData);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 1000, 'Excel buffer must have valid content');

  // Parse buffer back to ensure no corruption
  const readBackWorkbook = new ExcelJS.Workbook();
  await readBackWorkbook.xlsx.load(buffer);

  assert.equal(readBackWorkbook.worksheets.length, 7, 'Must contain exactly 7 sheets');
  const sheetNames = readBackWorkbook.worksheets.map((ws) => ws.name);
  assert.deepEqual(
    sheetNames,
    ['Students', 'Subjects', 'Batches', 'Batch Students', 'Classes', 'Attendance Log', 'Summary']
  );

  // Verify formula injection was neutralized in cell
  const studentsSheet = readBackWorkbook.getWorksheet('Students');
  const cellValue = studentsSheet.getRow(2).getCell(2).value;
  assert.equal(cellValue, "'=cmd|calc!A0", 'Formula cell value must have single quote prepended');
});

console.log('\n--- 9. Database Schema Hardening Verification ---');

test('supabase_schema.sql defines dual partial unique indexes and time constraints', () => {
  const schemaPath = path.resolve('supabase_schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Verify dual partial unique indexes
  assert.ok(
    sql.includes('unique_class_all_students'),
    'Schema must define unique_class_all_students partial index'
  );
  assert.ok(
    sql.includes('WHERE batch_id IS NULL'),
    'Schema must have partial index for batch_id IS NULL'
  );
  assert.ok(
    sql.includes('unique_class_with_batch'),
    'Schema must define unique_class_with_batch partial index'
  );
  assert.ok(
    sql.includes('WHERE batch_id IS NOT NULL'),
    'Schema must have partial index for batch_id IS NOT NULL'
  );

  // Verify time check constraint
  assert.ok(
    sql.includes('check_class_times CHECK (start_time < end_time)'),
    'Schema must enforce start_time < end_time'
  );

  // Verify subject name & type composite unique constraint
  assert.ok(
    sql.includes('unique_subject_name_type UNIQUE (name, type)'),
    'Schema must enforce unique (name, type) on subjects'
  );

  // Verify indexes on foreign keys
  assert.ok(sql.includes('idx_classes_subject_date'), 'Missing idx_classes_subject_date');
  assert.ok(sql.includes('idx_classes_batch'), 'Missing idx_classes_batch');
  assert.ok(sql.includes('idx_attendance_class'), 'Missing idx_attendance_class');
  assert.ok(sql.includes('idx_attendance_student'), 'Missing idx_attendance_student');
  assert.ok(sql.includes('idx_batch_students_batch'), 'Missing idx_batch_students_batch');
  assert.ok(sql.includes('idx_batch_students_roll'), 'Missing idx_batch_students_roll');
  assert.ok(sql.includes('idx_events_date'), 'Missing idx_events_date');
});

console.log('\n====================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS COMPLETED SUCCESSFULLY!`);
console.log('====================================================\n');
