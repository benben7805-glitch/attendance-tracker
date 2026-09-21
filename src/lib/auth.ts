/**
 * Enterprise Cryptographic Session & Authentication Utilities
 * Built with Web Crypto API (Node.js & Edge runtime compatible).
 */

export interface SessionPayload {
  role: 'admin' | 'student';
  rollNumber?: string;
  iat: number;
  exp: number;
}

const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PIN ||
    'attendance-hub-secure-session-salt-key-2026-v1'
  );
}

// Convert string to Uint8Array
function textToBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Base64URL encode/decode helpers
function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getCryptoKey(): Promise<CryptoKey> {
  const rawKey = textToBuffer(getSecretKey()) as unknown as BufferSource;
  return await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Constant-time string equality check to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = textToBuffer(a);
  const bBuf = textToBuffer(b);

  if (aBuf.byteLength !== bBuf.byteLength) {
    // Constant time dummy check
    let diff = 0;
    for (let i = 0; i < aBuf.byteLength; i++) {
      diff |= aBuf[i] ^ aBuf[i];
    }
    void diff;
    return false;
  }

  let diff = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

/**
 * Signs a session payload with HMAC-SHA256 and returns a compact token.
 */
export async function signSession(
  payload: Omit<SessionPayload, 'iat' | 'exp'>
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const payloadJson = JSON.stringify(fullPayload);
  const payloadB64 = toBase64Url(textToBuffer(payloadJson));

  const key = await getCryptoKey();
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    textToBuffer(payloadB64) as unknown as BufferSource
  );
  const signatureB64 = toBase64Url(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token.
 * Returns null if signature is invalid or token is expired.
 */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;

  try {
    const key = await getCryptoKey();
    const signatureBytes = fromBase64Url(signatureB64) as unknown as BufferSource;
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      textToBuffer(payloadB64) as unknown as BufferSource
    );

    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(fromBase64Url(payloadB64));
    const payload = JSON.parse(payloadJson) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS };
