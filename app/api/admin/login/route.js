import { sql } from '@/lib/db';
import { checkPassword, setAdminCookie, clearAdminCookie } from '@/lib/auth';

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 8;

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request) {
  const ip = clientIp(request);

  // Without this, the password is open to unlimited guessing. Counting in
  // Postgres rather than memory because each serverless invocation is cold.
  let recent = 0;
  try {
    const rows = await sql`
      select count(*)::int as n from login_attempts
      where ip = ${ip} and at > now() - interval '15 minutes'`;
    recent = rows[0]?.n || 0;
  } catch {
    // If the table is missing, fail open rather than locking the host out.
    recent = 0;
  }

  if (recent >= MAX_ATTEMPTS) {
    return Response.json(
      { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` },
      { status: 429 }
    );
  }

  const { password } = await request.json().catch(() => ({}));

  if (!checkPassword(password)) {
    try {
      await sql`insert into login_attempts (ip) values (${ip})`;
      // Opportunistic cleanup so the table can't grow without bound.
      await sql`delete from login_attempts where at < now() - interval '1 day'`;
    } catch {}
    const left = MAX_ATTEMPTS - recent - 1;
    return Response.json(
      {
        error:
          left > 0
            ? `That password does not match. ${left} attempt${left === 1 ? '' : 's'} left.`
            : 'That password does not match. Locked for 15 minutes.',
      },
      { status: 401 }
    );
  }

  try {
    await sql`delete from login_attempts where ip = ${ip}`;
  } catch {}

  await setAdminCookie();
  return Response.json({ ok: true });
}

export async function DELETE() {
  await clearAdminCookie();
  return Response.json({ ok: true });
}
