import { sql } from '@/lib/db';
import { isAdmin, unauthorized } from '@/lib/auth';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clean(val) { return String(val ?? '').trim(); }

/** GET /api/admin/contacts — list all contacts, optional ?q= search */
export async function GET(request) {
  if (!(await isAdmin())) return unauthorized();
  const { searchParams } = new URL(request.url);
  const q = clean(searchParams.get('q'));

  const rows = q
    ? await sql`
        select * from contacts
        where name ilike ${'%' + q + '%'} or email ilike ${'%' + q + '%'}
        order by name asc`
    : await sql`select * from contacts order by name asc`;

  return Response.json({ contacts: rows });
}

/** POST /api/admin/contacts — create a new contact */
export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();

  const name     = clean(body.name);
  const email    = clean(body.email).toLowerCase();
  const phone    = clean(body.phone);
  const address  = clean(body.address);
  const birthday = clean(body.birthday) || null;
  const notes    = clean(body.notes);

  if (!name) return Response.json({ error: 'Name is required.' }, { status: 400 });
  if (email && !EMAIL.test(email)) return Response.json({ error: 'Invalid email address.' }, { status: 400 });

  if (email) {
    const clash = await sql`select 1 from contacts where email = ${email} limit 1`;
    if (clash.length) return Response.json({ error: 'A contact with that email already exists.' }, { status: 409 });
  }

  const rows = await sql`
    insert into contacts (name, email, phone, address, birthday, notes)
    values (${name}, ${email}, ${phone}, ${address}, ${birthday}, ${notes})
    returning *`;

  return Response.json({ contact: rows[0] });
}

/** PATCH /api/admin/contacts — update an existing contact */
export async function PATCH(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();

  const id       = Number(body.id);
  const name     = clean(body.name);
  const email    = clean(body.email).toLowerCase();
  const phone    = clean(body.phone);
  const address  = clean(body.address);
  const birthday = clean(body.birthday) || null;
  const notes    = clean(body.notes);

  if (!name) return Response.json({ error: 'Name is required.' }, { status: 400 });
  if (email && !EMAIL.test(email)) return Response.json({ error: 'Invalid email address.' }, { status: 400 });

  if (email) {
    const clash = await sql`select 1 from contacts where email = ${email} and id <> ${id} limit 1`;
    if (clash.length) return Response.json({ error: 'Another contact already has that email.' }, { status: 409 });
  }

  const rows = await sql`
    update contacts set
      name       = ${name},
      email      = ${email},
      phone      = ${phone},
      address    = ${address},
      birthday   = ${birthday},
      notes      = ${notes},
      updated_at = now()
    where id = ${id}
    returning *`;

  if (!rows.length) return Response.json({ error: 'Contact not found.' }, { status: 404 });
  return Response.json({ contact: rows[0] });
}

/** DELETE /api/admin/contacts — delete a contact */
export async function DELETE(request) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await request.json();
  await sql`delete from contacts where id = ${Number(id)}`;
  return Response.json({ ok: true });
}
