import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'invite_admin';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * No weak fallback. If ADMIN_SECRET is missing in production the cookie would
 * be signed with a value sitting in a public repo, and anyone who read the
 * code could forge a valid session — so refuse to run instead.
 */
function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ADMIN_SECRET is missing or too short. Set it in Vercel to at least 16 random characters.'
      );
    }
    return 'local-development-only-secret';
  }
  return s;
}

/** Constant-length digests, so a comparison can't leak the length. */
function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest();
}

function sameValue(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

export function adminToken() {
  // The password is part of the input, so changing it invalidates every
  // existing session automatically.
  return crypto
    .createHmac('sha256', secret())
    .update(`admin-v2:${process.env.ADMIN_PASSWORD || ''}`)
    .digest('hex');
}

export async function isAdmin() {
  const jar = await cookies();
  const got = jar.get(COOKIE)?.value;
  if (!got) return false;
  try {
    return sameValue(got, adminToken());
  } catch {
    return false;
  }
}

export async function setAdminCookie() {
  const jar = await cookies();
  jar.set(COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function checkPassword(input) {
  const want = process.env.ADMIN_PASSWORD || '';
  if (want.length < 8) return false;
  return sameValue(input, want);
}

export function unauthorized() {
  return Response.json({ error: 'Not signed in' }, { status: 401 });
}
