'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { wallToUtc, utcToWall, COMMON_ZONES } from '@/lib/tz';

/* ------------------------------------------------------------------ */

async function resizeToJpeg(file, maxDim = 1500) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('decode'));
    i.src = dataUrl;
  });
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let q = 0.84;
  let blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  while (blob && blob.size > 3_500_000 && q > 0.4) {
    q -= 0.12;
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  }
  return blob;
}

/** "Saturday, 12 September at 6:00 pm" in the event's own timezone. */
function fmtWhen(iso, timeZone) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'No date set';
  const tz = timeZone || 'America/Chicago';
  const day = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  });
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    .toLowerCase();
  return `${day} at ${time}`;
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

/* ------------------------------------------------------------------ */

export default function AdminApp() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(true);

  const [event, setEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [guests, setGuests] = useState([]);
  const [publicUrl, setPublicUrl] = useState('');
  const [linkLocked, setLinkLocked] = useState(false);
  const [tab, setTab] = useState('replies');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  const [roster, setRoster] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [filter, setFilter] = useState(null);
  const [view, setView] = useState('overview');
  const [overview, setOverview] = useState([]);
  const [sendReport, setSendReport] = useState(null);
  const fileRef = useRef(null);

  // ── Contacts ──────────────────────────────────────────────────
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactTagFilter, setContactTagFilter] = useState('');
  const [contactDraft, setContactDraft] = useState(null);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [addFromContacts, setAddFromContacts] = useState(false);
  const [contactPicks, setContactPicks] = useState(new Set());
  const [contactPickSearch, setContactPickSearch] = useState('');
  const [contactPickTag, setContactPickTag] = useState('');
  const [updateBusy, setUpdateBusy] = useState(false);
  const importFileRef = useRef(null);

  function say(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }

  function absorb(data) {
    setEvent(data.event);
    setEvents(data.events || []);
    setEventId(data.event.id);
    setGuests(data.guests || []);
    setPublicUrl(data.publicUrl);
    if (typeof data.linkLocked === 'boolean') setLinkLocked(data.linkLocked);
  }

  async function loadOverview() {
    const res = await fetch('/api/admin/overview');
    if (res.status === 401) {
      setAuthed(false);
      setLoading(false);
      return null;
    }
    const data = await res.json();
    if (data.error) {
      say(data.error);
      setLoading(false);
      return null;
    }
    setOverview(data.events || []);
    setAuthed(true);
    setLoading(false);
    return data.events || [];
  }

  async function loadContacts(q = '') {
    const res = await fetch('/api/admin/contacts' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    const data = await res.json();
    setContacts(data.contacts || []);
  }

  async function saveContact(draft) {
    setContactBusy(true);
    setContactError('');
    const method = draft.id ? 'PATCH' : 'POST';
    const res = await fetch('/api/admin/contacts', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    setContactBusy(false);
    if (data.error) { setContactError(data.error); return; }
    setContactDraft(null);
    loadContacts(contactSearch);
    say(draft.id ? 'Contact updated.' : 'Contact added.');
  }

  async function deleteContact(id) {
    if (!confirm('Delete this contact? This cannot be undone.')) return;
    await fetch('/api/admin/contacts', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadContacts(contactSearch);
    say('Contact deleted.');
  }

  async function importContacts() {
    if (!importText.trim()) return;
    setContactBusy(true);
    const res = await fetch('/api/admin/contacts/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: importText }),
    });
    const data = await res.json();
    setContactBusy(false);
    if (data.error) { setContactError(data.error); return; }
    setImportResult(data);
    setImportText('');
    loadContacts(contactSearch);
  }

  function exportContacts() {
    window.location.href = '/api/admin/contacts/export';
  }

  async function requestUpdates() {
    if (!confirm('Send an update request email to all contacts with an email address?')) return;
    setUpdateBusy(true);
    const res = await fetch('/api/admin/contacts/request-update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setUpdateBusy(false);
    if (data.error) { say(data.error); return; }
    say(`Update requests sent to ${data.sent} contact${data.sent === 1 ? '' : 's'}.`);
  }

  async function addPickedContacts() {
    if (!contactPicks.size) return;
    const picked = contacts.filter(c => contactPicks.has(c.id));
    const roster = picked.map(c => c.email ? `${c.name} <${c.email}>` : c.name).join('\n');
    const res = await fetch('/api/admin/guests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roster, eventId }),
    });
    const data = await res.json();
    if (data.guests) setGuests(data.guests);
    setAddFromContacts(false);
    setContactPicks(new Set());
    setContactPickSearch('');
    say(`Added ${data.added} guest${data.added === 1 ? '' : 's'}.`);
  }

  async function openEvent(id) {
    setLoading(true);
    setFilter(null);
    await load(id);
    setView('event');
  }

  async function load(id) {
    const res = await fetch('/api/admin/event' + (id ? `?id=${id}` : ''));
    if (res.status === 401) {
      setAuthed(false);
      setLoading(false);
      return;
    }
    const data = await res.json();
    if (data.error) {
      say(data.error);
    } else {
      absorb(data);
      setAuthed(true);
      setTab(data.event.title ? 'replies' : 'card');
    }
    setLoading(false);
  }

  async function signOut() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setAuthed(false);
    setEvent(null);
    setEvents([]);
    setGuests([]);
  }

  async function newEvent() {
    const title = prompt('Name this event');
    if (!title) return;
    setBusy('save');
    const res = await fetch('/api/admin/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    setBusy('');
    if (data.error) return say(data.error);
    absorb(data);
    setTab('card');
    setView('event');
    loadOverview();
    say('Event created');
  }

  async function removeEvent() {
    if (!confirm(`Delete "${event.title}" and all of its replies? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/event', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: eventId }),
    });
    const data = await res.json();
    if (data.error) return say(data.error);
    absorb(data);
    setView('overview');
    loadOverview();
    say('Event deleted');
  }

  useEffect(() => {
    loadOverview();
  }, []);

  async function login() {
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setLoginError(d.error || 'That did not work.');
      return;
    }
    setPassword('');
    setLoading(true);
    setView('overview');
    loadOverview();
  }

  async function saveEvent(patch) {
    setBusy('save');
    const res = await fetch('/api/admin/event', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...event, ...(patch || {}) }),
    });
    const data = await res.json();
    setBusy('');
    if (data.error) return say(data.error);
    absorb(data);
    loadOverview();
    say('Saved');
  }

  async function uploadImage(file) {
    if (!file) return;
    setBusy('upload');
    try {
      const blob = await resizeToJpeg(file);
      const form = new FormData();
      form.append('file', blob, 'event.jpg');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const next = { ...event, image_url: data.url };
      setEvent(next);
      await saveEvent({ image_url: data.url });
    } catch (err) {
      say(err.message);
    }
    setBusy('');
  }

  async function addGuests() {
    setBusy('roster');
    const res = await fetch('/api/admin/guests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roster, eventId }),
    });
    const data = await res.json();
    setBusy('');
    if (data.error) return say(data.error);
    setGuests(data.guests);
    setRoster('');
    say(`${data.added} added${data.skipped ? `, ${data.skipped} already there` : ''}`);
  }

  function beginEdit(g) {
    setEditingId(g.id);
    setDraft({
      name: g.name || '',
      email: g.email || '',
      phone: g.phone || '',
      status: g.status,
      adults: g.adults ?? 1,
      kids: g.kids ?? 0,
      note: g.note || '',
    });
  }

  async function saveGuest() {
    setBusy('guest');
    const res = await fetch('/api/admin/guests', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, id: editingId, eventId }),
    });
    const data = await res.json();
    setBusy('');
    if (data.error) return say(data.error);
    setGuests(data.guests);
    setEditingId(null);
    setDraft(null);
    say('Reply recorded');
  }

  async function copyList() {
    if (!copyFrom) return;
    setBusy('roster');
    const res = await fetch('/api/admin/guests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId, copyFromEventId: copyFrom }),
    });
    const data = await res.json();
    setBusy('');
    if (data.error) return say(data.error);
    setGuests(data.guests);
    say(`${data.added} copied${data.skipped ? `, ${data.skipped} already there` : ''}`);
  }

  async function removeGuest(id) {
    const res = await fetch('/api/admin/guests', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, eventId }),
    });
    const data = await res.json();
    if (data.guests) setGuests(data.guests);
  }

  /** Keeps calling the send endpoint until nothing is left in the queue. */
  async function send(kind, resend) {
    setBusy('send');
    setSendReport(null);
    const total = { sent: 0, failed: 0, errors: [] };
    for (let pass = 0; pass < 15; pass++) {
      const res = await fetch('/api/admin/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, resend: !!resend && pass === 0, eventId }),
      });
      const data = await res.json();
      if (data.error) {
        say(data.error);
        break;
      }
      total.sent += data.sent;
      total.failed += data.failed;
      total.errors.push(...(data.errors || []));
      if (data.guests) setGuests(data.guests);
      setSendReport({ ...total, working: !!data.remaining });
      if (!data.remaining) break;
    }
    setSendReport({ ...total, working: false });
    setBusy('');
    say(`${total.sent} sent${total.failed ? `, ${total.failed} failed` : ''}`);
  }

  function copy(text, label) {
    navigator.clipboard?.writeText(text).then(
      () => say(`${label} copied`),
      () => say('Copy failed')
    );
  }

  function exportCsv() {
    const head = ['Name', 'Email', 'Phone', 'Reply', 'Adults', 'Kids', 'Total', 'Note', 'Invited', 'Opened', 'Replied'];
    const rows = (shown.length ? shown : guests).map((g) => [
      g.name,
      g.email,
      g.phone,
      g.status,
      g.status === 'no' ? 0 : g.adults,
      g.status === 'no' ? 0 : g.kids,
      g.status === 'no' ? 0 : g.party,
      g.note,
      g.invite_sent_at ? new Date(g.invite_sent_at).toLocaleString() : '',
      g.opened_at ? new Date(g.opened_at).toLocaleString() : '',
      g.replied_at ? new Date(g.replied_at).toLocaleString() : '',
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filter ? `rsvps-${filter}.csv` : 'rsvps.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const counts = useMemo(() => {
    const by = (s) => guests.filter((g) => g.status === s);
    return {
      yes: by('yes').length,
      maybe: by('maybe').length,
      no: by('no').length,
      pending: by('pending').length,
      adults: by('yes').reduce((s, g) => s + (Number(g.adults) || 0), 0),
      kids: by('yes').reduce((s, g) => s + (Number(g.kids) || 0), 0),
    };
  }, [guests]);

  const unsent = guests.filter((g) => g.email && !g.invite_sent_at).length;

  /** Replies tab: a chosen status, or everyone who has actually answered. */
  const shown = guests
    .filter((g) => (filter ? g.status === filter : g.status !== 'pending'))
    .sort((a, b) => new Date(b.replied_at || 0) - new Date(a.replied_at || 0));

  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="wrap">
        <div className="empty">
          <p>Loading&#8230;</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="wrap" style={{ maxWidth: 420 }}>
        <div className="panel" style={{ marginTop: 60 }}>
          <div className="panel-head">
            <h2 className="panel-title">Host tools</h2>
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              autoFocus
            />
          </div>
          {loginError ? (
            <p className="field-hint" style={{ color: 'var(--plum)' }}>
              {loginError}
            </p>
          ) : null}
          <button className="btn" onClick={login} style={{ marginTop: 8 }}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (view === 'overview') {
    return (
      <div className="wrap-wide">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          <div>
            <span className="eyebrow">Host tools</span>
            <h1
              style={{
                fontFamily: 'var(--display)',
                fontSize: 27,
                fontWeight: 500,
                margin: '6px 0 0',
              }}
            >
              Dashboard
            </h1>
          </div>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={newEvent}>
              New event
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('contacts'); loadContacts(); }}>
              Contacts
            </button>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {!overview.length ? (
          <div className="panel">
            <div className="empty">
              <p>No events yet.</p>
              <p>Create one and it will appear here.</p>
            </div>
          </div>
        ) : (
          overview.map((ev) => {
            const out = daysUntil(ev.event_at);
            const remindIn = out == null ? null : out - (ev.reminder_days || 3);

            let stateLine;
            if (!ev.total) stateLine = 'No guests on the list yet';
            else if (ev.unsent) stateLine = `${ev.unsent} invitation${ev.unsent === 1 ? '' : 's'} still to send`;
            else if (out != null && out < 0) stateLine = 'Finished';
            else if (ev.reminded) stateLine = 'Reminder sent';
            else if (remindIn != null && remindIn <= 0) stateLine = 'Reminder goes out today';
            else if (remindIn != null) stateLine = `Reminder in ${remindIn} days`;
            else stateLine = 'All invitations sent';

            const urgent = ev.unsent > 0 || (remindIn != null && remindIn <= 0 && !ev.reminded);

            return (
              <div className="panel" key={ev.id}>
                <div className="panel-head" style={{ marginBottom: 14 }}>
                  <div>
                    <h2 className="panel-title" style={{ marginBottom: 4 }}>
                      {ev.title || 'Untitled event'}
                    </h2>
                    <div className="guest-meta" style={{ marginTop: 0 }}>
                      {ev.event_at ? fmtWhen(ev.event_at, ev.timezone) : 'No date set'}
                      {ev.sender_name ? ` \u00b7 from ${ev.sender_name}` : ''}
                    </div>
                  </div>
                  <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>
                    {out == null
                      ? 'Undated'
                      : out < 0
                        ? 'Passed'
                        : out === 0
                          ? 'Today'
                          : `${out} days out`}
                  </span>
                </div>

                <div className="stat-row" style={{ marginBottom: 14 }}>
                  {[
                    [ev.yes, 'Yes'],
                    [ev.maybe, 'Maybe'],
                    [ev.no, 'No'],
                    [ev.pending, 'Silent'],
                    [ev.adults, 'Adults'],
                    [ev.kids, 'Kids'],
                  ].map(([n, l]) => (
                    <div className="stat" key={l}>
                      <div className="stat-n">{n}</div>
                      <div className="stat-l">{l}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    className="eyebrow"
                    style={{ color: urgent ? 'var(--plum)' : 'var(--smoke)' }}
                  >
                    {stateLine}
                  </span>
                  <div className="btn-row">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => copy(ev.publicUrl, 'Link')}
                    >
                      Copy link
                    </button>
                    <button className="btn btn-sm" onClick={() => openEvent(ev.id)}>
                      Open
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  if (view === 'contacts') {
    const blankDraft = { name: '', email: '', phone: '', address: '', birthday: '', notes: '', tags: '' };
    const allTags = [...new Set(contacts.flatMap(c => c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : []))].sort();
    const filtered = contacts.filter(c => {
      const matchSearch = !contactSearch || c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.email.toLowerCase().includes(contactSearch.toLowerCase());
      const matchTag = !contactTagFilter || (c.tags || '').split(',').map(t => t.trim()).includes(contactTagFilter);
      return matchSearch && matchTag;
    });
    const upcomingBirthdays = contacts
      .filter(c => c.birthday)
      .map(c => {
        const bday = new Date(c.birthday);
        const now = new Date();
        const next = new Date(now.getFullYear(), bday.getUTCMonth(), bday.getUTCDate());
        if (next < now) next.setFullYear(now.getFullYear() + 1);
        const days = Math.round((next - now) / 86400000);
        return { ...c, daysUntil: days };
      })
      .filter(c => c.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return (
      <div className="wrap-wide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <button className="backlink" onClick={() => setView('overview')}>
              <span aria-hidden="true">&larr;</span> Dashboard
            </button>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 27, fontWeight: 500, margin: '8px 0 0' }}>
              Contacts
            </h1>
          </div>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={() => { setContactError(''); setContactDraft({ ...blankDraft }); }}>
              Add contact
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setImportOpen(o => !o); setImportResult(null); setContactError(''); }}>
              Import CSV
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportContacts}>
              Export CSV
            </button>
            <button className="btn btn-ghost btn-sm" disabled={updateBusy} onClick={requestUpdates}>
              {updateBusy ? 'Sending…' : 'Request updates'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
          </div>
        </div>

        {/* Upcoming birthdays */}
        {upcomingBirthdays.length > 0 && (
          <div className="panel" style={{ marginBottom: 20, borderLeft: '3px solid var(--plum)' }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Birthdays in the next 30 days</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
              {upcomingBirthdays.map(c => (
                <span key={c.id} style={{ fontSize: 14 }}>
                  <strong>{c.name}</strong>
                  <span style={{ color: 'var(--smoke)', marginLeft: 6 }}>
                    {c.daysUntil === 0 ? '🎂 Today!' : `in ${c.daysUntil} day${c.daysUntil === 1 ? '' : 's'}`}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Import CSV panel */}
        {importOpen && (
          <div className="panel" style={{ marginBottom: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>Import contacts from CSV</p>
            <p style={{ fontSize: 13, color: 'var(--smoke)', marginBottom: 12, lineHeight: 1.6 }}>
              Paste CSV text below. Your file should have a header row with columns like Name, Email, Phone, Address, Birthday, Tags.
              Existing contacts with the same email will be updated, not duplicated.
            </p>
            <input type="file" accept=".csv,.txt" ref={importFileRef} style={{ display: 'none' }} onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => setImportText(ev.target.result);
              reader.readAsText(file);
            }} />
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={() => importFileRef.current?.click()}>
              Choose file
            </button>
            <textarea
              className="field"
              rows={6}
              placeholder={'Name,Email,Phone,Address,Birthday,Tags\nJane Smith,jane@example.com,555-1234,"123 Main St, Houston TX",1985-06-15,"family, friends"'}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}
            />
            {importResult && (
              <p style={{ fontSize: 13, color: 'var(--smoke)', marginBottom: 12 }}>
                ✓ {importResult.added} added / updated · {importResult.skipped} skipped
              </p>
            )}
            {contactError && <p style={{ color: 'var(--plum)', fontSize: 13, marginBottom: 10 }}>{contactError}</p>}
            <div className="btn-row">
              <button className="btn btn-sm" disabled={contactBusy || !importText.trim()} onClick={importContacts}>
                {contactBusy ? 'Importing…' : 'Import'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setImportOpen(false); setImportText(''); setImportResult(null); setContactError(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search + tag filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            className="field"
            placeholder="Search by name or email…"
            value={contactSearch}
            onChange={e => setContactSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          {allTags.length > 0 && (
            <select
              className="field"
              value={contactTagFilter}
              onChange={e => setContactTagFilter(e.target.value)}
              style={{ maxWidth: 180 }}
            >
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* Add / Edit form */}
        {contactDraft && (
          <div className="panel" style={{ marginBottom: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 14 }}>{contactDraft.id ? 'Edit contact' : 'New contact'}</p>
            {contactError && <p style={{ color: 'var(--plum)', fontSize: 13, marginBottom: 10 }}>{contactError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <label className="field-wrap">
                <span className="eyebrow">Name *</span>
                <input className="field" value={contactDraft.name} onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))} />
              </label>
              <label className="field-wrap">
                <span className="eyebrow">Email</span>
                <input className="field" type="email" value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))} />
              </label>
              <label className="field-wrap">
                <span className="eyebrow">Phone</span>
                <input className="field" type="tel" value={contactDraft.phone} onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))} />
              </label>
              <label className="field-wrap">
                <span className="eyebrow">Birthday</span>
                <input className="field" type="date" value={contactDraft.birthday} onChange={e => setContactDraft(d => ({ ...d, birthday: e.target.value }))} />
              </label>
            </div>
            <label className="field-wrap" style={{ marginBottom: 12 }}>
              <span className="eyebrow">Address</span>
              <input className="field" value={contactDraft.address} onChange={e => setContactDraft(d => ({ ...d, address: e.target.value }))} />
            </label>
            <label className="field-wrap" style={{ marginBottom: 12 }}>
              <span className="eyebrow">Tags</span>
              <input className="field" value={contactDraft.tags} onChange={e => setContactDraft(d => ({ ...d, tags: e.target.value }))} placeholder="family, close friends, work" />
              <span style={{ fontSize: 12, color: 'var(--smoke)', marginTop: 4, display: 'block' }}>Comma-separated. Used to filter and group contacts.</span>
            </label>
            <label className="field-wrap" style={{ marginBottom: 16 }}>
              <span className="eyebrow">Notes</span>
              <textarea className="field" rows={2} value={contactDraft.notes} onChange={e => setContactDraft(d => ({ ...d, notes: e.target.value }))} />
            </label>
            <div className="btn-row">
              <button className="btn btn-sm" disabled={contactBusy} onClick={() => saveContact(contactDraft)}>
                {contactBusy ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setContactDraft(null); setContactError(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Contacts table */}
        {filtered.length === 0 ? (
          <div className="panel">
            <div className="empty">
              <p>{contactSearch ? 'No contacts match your search.' : 'No contacts yet.'}</p>
              {!contactSearch && <p>Click "Add contact" to get started.</p>}
            </div>
          </div>
        ) : (
          <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  {['Name', 'Email', 'Phone', 'Birthday', 'Address', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--smoke)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--smoke)' }}>{c.email || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--smoke)', whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--smoke)', whiteSpace: 'nowrap' }}>
                      {c.birthday ? new Date(c.birthday + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--smoke)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address || '—'}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div className="btn-row">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setContactError(''); setContactDraft({ ...c, birthday: c.birthday ? c.birthday.slice(0, 10) : '' }); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteContact(c.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--smoke)' }}>
          {contacts.length} contact{contacts.length === 1 ? '' : 's'} total
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="wrap">
        <div className="empty">
          <p>Loading\u2026</p>
        </div>
      </div>
    );
  }

  const set = (k) => (e) => {
    const v =
      e && e.target
        ? e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.value
        : e;
    setEvent({ ...event, [k]: v });
  };

  const daysOut = daysUntil(event.event_at);
  const reminderOn =
    event.event_at && daysOut != null ? daysOut - (event.reminder_days || 3) : null;

  return (
    <div className="wrap-wide">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <button
            className="backlink"
            onClick={() => {
              setView('overview');
              loadOverview();
            }}
          >
            <span aria-hidden="true">&larr;</span> Dashboard
          </button>
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: 27,
              fontWeight: 500,
              margin: '8px 0 0',
            }}
          >
            {event.title || 'Your invitation'}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {daysOut != null ? (
            <span className="eyebrow">
              {daysOut < 0 ? 'Event has passed' : daysOut === 0 ? 'Today' : `${daysOut} days out`}
            </span>
          ) : null}
          {events.length > 1 ? (
            <select
              value={eventId || ''}
              onChange={(e) => {
                setLoading(true);
                load(e.target.value);
              }}
              style={{
                fontFamily: 'var(--body)',
                fontSize: 14,
                padding: '8px 10px',
                background: 'var(--card)',
                border: '1px solid var(--rule)',
                borderRadius: 1,
                color: 'var(--ink)',
              }}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || 'Untitled'}
                </option>
              ))}
            </select>
          ) : null}
          <button className="btn btn-ghost btn-sm" onClick={newEvent}>
            New event
          </button>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {[
          ['card', 'Card'],
          ['guests', 'Guests'],
          ['send', 'Send'],
          ['replies', 'Replies'],
        ].map(([k, l]) => (
          <button
            key={k}
            className="tab"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ------------------------------ CARD ------------------------------ */}
      {tab === 'card' ? (
        <>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Image</h2>
              <a
                className="eyebrow"
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'underline' }}
              >
                Preview
              </a>
            </div>
            <div className="imgdrop">
              {event.image_url ? <img src={event.image_url} alt="" /> : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => uploadImage(e.target.files?.[0])}
              />
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <button
                  className="btn btn-sm"
                  disabled={busy === 'upload'}
                  onClick={() => fileRef.current?.click()}
                >
                  {busy === 'upload'
                    ? 'Uploading\u2026'
                    : event.image_url
                      ? 'Replace image'
                      : 'Upload image'}
                </button>
                {event.image_url ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => saveEvent({ image_url: null })}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="field-hint" style={{ marginTop: 12 }}>
                Resized in the browser before upload. Landscape crops best.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Details</h2>
            </div>

            <div className="field">
              <label>Event name</label>
              <input value={event.title || ''} onChange={set('title')} />
            </div>

            <div className="field">
              <label>Hosted by</label>
              <input value={event.hosts || ''} onChange={set('hosts')} />
            </div>

            <div className="field">
              <label>Timezone</label>
              <select value={event.timezone} onChange={set('timezone')}>
                {COMMON_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <span className="field-hint">Times below are in this zone.</span>
            </div>

            <div className="field-2">
              <div className="field">
                <label>Starts</label>
                <input
                  type="datetime-local"
                  value={utcToWall(event.event_at, event.timezone)}
                  onChange={(e) =>
                    setEvent({ ...event, event_at: wallToUtc(e.target.value, event.timezone) })
                  }
                />
              </div>
              <div className="field">
                <label>Ends</label>
                <input
                  type="datetime-local"
                  value={utcToWall(event.ends_at, event.timezone)}
                  onChange={(e) =>
                    setEvent({ ...event, ends_at: wallToUtc(e.target.value, event.timezone) })
                  }
                />
              </div>
            </div>

            <div className="field">
              <label>Reply by</label>
              <input
                type="date"
                value={event.rsvp_by ? String(event.rsvp_by).slice(0, 10) : ''}
                onChange={set('rsvp_by')}
              />
            </div>

            <div className="field">
              <label>Place</label>
              <input value={event.venue_name || ''} onChange={set('venue_name')} />
            </div>

            <div className="field">
              <label>Address</label>
              <input value={event.address || ''} onChange={set('address')} />
            </div>

            <div className="field">
              <label>Dress</label>
              <input value={event.dress_code || ''} onChange={set('dress_code')} />
            </div>

            <div className="field">
              <label>Note</label>
              <textarea value={event.note || ''} onChange={set('note')} />
              <span className="field-hint">
                Parking, gifts, what to expect. Worth writing a few real sentences — a big photo
                with almost no text reads as promotional to spam filters.
              </span>
            </div>

            <div className="field-2">
              <div className="field">
                <label>Wax seal</label>
                <input
                  maxLength={14}
                  value={event.seal || ''}
                  onChange={set('seal')}
                  placeholder="Sarda"
                />
                <span className="field-hint">
                  A surname or a single initial. Leave blank and it uses the last word
                  of the host name.
                </span>
              </div>
              <div className="field">
                <label>Remind this many days ahead</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={event.reminder_days}
                  onChange={set('reminder_days')}
                />
              </div>
            </div>

            <div className="field">
              <label>Guest link</label>
              <input
                value={publicUrl}
                readOnly
                onFocus={(e) => e.target.select()}
                style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
              />
              <span className="field-hint">
                {linkLocked
                  ? 'Frozen, because invitations have already gone out. Changing it would break every link already in someone\u2019s inbox.'
                  : 'Made from the event name plus a random tail, so it can\u2019t be guessed. It follows the name until your first invitation goes out, then freezes.'}
              </span>
              <div className="btn-row" style={{ marginTop: 4 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => copy(publicUrl, 'Link')}
                >
                  Copy link
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const warning = linkLocked
                      ? 'Invitations have already been sent. A new link will break the one in those emails, and anyone who opens the old one will see a not-found page. Continue?'
                      : 'Generate a fresh link for this event?';
                    if (confirm(warning)) saveEvent({ regenerate_slug: true });
                  }}
                >
                  New link
                </button>
              </div>
            </div>

            <div className="field">
              <label>Options</label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  textTransform: 'none',
                  letterSpacing: 0,
                  fontFamily: 'var(--body)',
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={!!event.allow_plus_ones}
                  onChange={set('allow_plus_ones')}
                />
                Guests can bring others (adults and children counted separately)
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  textTransform: 'none',
                  letterSpacing: 0,
                  fontFamily: 'var(--body)',
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={!!event.remind_pending}
                  onChange={set('remind_pending')}
                />
                Reminder also nudges people who never replied
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  textTransform: 'none',
                  letterSpacing: 0,
                  fontFamily: 'var(--body)',
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={!!event.notify_host}
                  onChange={set('notify_host')}
                />
                Email me each time someone replies
              </label>
            </div>

            <button className="btn btn-plum" disabled={busy === 'save'} onClick={() => saveEvent()}>
              {busy === 'save' ? 'Saving\u2026' : 'Save invitation'}
            </button>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Who it comes from</h2>
              <span className="eyebrow">This event only</span>
            </div>
            <p className="field-hint" style={{ marginBottom: 16 }}>
              Set per event, so two people can share this app and each have invitations arrive
              under their own name. Leave a field blank to fall back to the site-wide default.
            </p>

            <div className="field">
              <label>Sender name</label>
              <input
                value={event.sender_name || ''}
                onChange={set('sender_name')}
                placeholder="Maya Sarda"
              />
              <span className="field-hint">
                What guests see in their inbox. The most-read text in the whole system.
              </span>
            </div>

            <div className="field">
              <label>Sending address</label>
              <input
                value={event.sender_email || ''}
                onChange={set('sender_email')}
                placeholder="leave blank to use the default"
              />
              <span className="field-hint">
                Must be on your verified domain. Sharing one address across events keeps
                deliverability simpler; use a separate one only if you want to.
              </span>
            </div>

            <div className="field">
              <label>Send replies and notifications to</label>
              <input
                value={event.notify_email || ''}
                onChange={set('notify_email')}
                placeholder="you@example.com"
              />
              <span className="field-hint">
                Guest replies and every &ldquo;someone RSVP&rsquo;d&rdquo; alert for this event
                land here.
              </span>
            </div>

            <div className="btn-row">
              <button className="btn btn-plum" disabled={busy === 'save'} onClick={() => saveEvent()}>
                {busy === 'save' ? 'Saving\u2026' : 'Save sender'}
              </button>
              {events.length > 1 ? (
                <button className="btn btn-ghost" onClick={removeEvent}>
                  Delete this event
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {/* ----------------------------- GUESTS ----------------------------- */}
      {tab === 'guests' ? (
        <>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Add guests</h2>
              <span className="eyebrow">{guests.length} on the list</span>
            </div>
            <div className="field">
              <label>Names and addresses</label>
              <textarea
                style={{ minHeight: 150 }}
                value={roster}
                onChange={(e) => setRoster(e.target.value)}
                placeholder={'Ana Reyes <ana@example.com>\njon@example.com'}
              />
              <span className="field-hint">
                One per line. A bare address works, so does{' '}
                <code>Ana Reyes &lt;ana@example.com&gt;</code>. For someone with no
                email, put a name and optionally a phone number separated by a
                comma \u2014 they won&rsquo;t be sent anything, but you can record their
                reply by hand. Duplicate addresses are skipped.
              </span>
            </div>
            <button className="btn" disabled={busy === 'roster' || !roster.trim()} onClick={addGuests}>
              {busy === 'roster' ? 'Adding\u2026' : 'Add to list'}
            </button>

            <hr className="rule-thin" style={{ margin: '22px 0 18px' }} />
            <div className="field">
              <label>Or pick from your contacts</label>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setAddFromContacts(o => !o); if (!addFromContacts) { loadContacts(); setContactPicks(new Set()); setContactPickSearch(''); setContactPickTag(''); } }}
              >
                {addFromContacts ? 'Close' : 'Browse contacts'}
              </button>
            </div>

            {addFromContacts && (() => {
              const allTags = [...new Set(contacts.flatMap(c => c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : []))].sort();
              const pickerFiltered = contacts.filter(c => {
                const matchSearch = !contactPickSearch || c.name.toLowerCase().includes(contactPickSearch.toLowerCase()) || c.email.toLowerCase().includes(contactPickSearch.toLowerCase());
                const matchTag = !contactPickTag || (c.tags || '').split(',').map(t => t.trim()).includes(contactPickTag);
                return matchSearch && matchTag;
              });
              return (
                <div style={{ border: '1px solid var(--rule)', borderRadius: 2, padding: '16px', marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input
                      className="field"
                      placeholder="Search by name or email…"
                      value={contactPickSearch}
                      onChange={e => setContactPickSearch(e.target.value)}
                      style={{ maxWidth: 240, marginBottom: 0 }}
                    />
                    {allTags.length > 0 && (
                      <select
                        className="field"
                        value={contactPickTag}
                        onChange={e => setContactPickTag(e.target.value)}
                        style={{ maxWidth: 160, marginBottom: 0 }}
                      >
                        <option value="">All tags</option>
                        {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </div>
                  {pickerFiltered.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--smoke)' }}>No contacts match.</p>
                  ) : (
                    <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {pickerFiltered.map(c => (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer', fontSize: 14 }}>
                          <input
                            type="checkbox"
                            style={{ width: 'auto', margin: 0 }}
                            checked={contactPicks.has(c.id)}
                            onChange={e => setContactPicks(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(c.id) : next.delete(c.id);
                              return next;
                            })}
                          />
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                          {c.email && <span style={{ color: 'var(--smoke)', fontSize: 12 }}>{c.email}</span>}
                          {c.tags && <span style={{ fontSize: 11, color: 'var(--smoke)', fontStyle: 'italic' }}>{c.tags}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button className="btn btn-sm" disabled={contactPicks.size === 0} onClick={addPickedContacts}>
                      Add {contactPicks.size > 0 ? contactPicks.size : ''} to guest list
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setContactPicks(new Set()); }}>
                      Clear
                    </button>
                  </div>
                </div>
              );
            })()}

            {events.length > 1 ? (
              <>
                <hr className="rule-thin" style={{ margin: '22px 0 18px' }} />
                <div className="field">
                  <label>Or copy a list from another event</label>
                  <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                    <option value="">Choose an event\u2026</option>
                    {events
                      .filter((ev) => ev.id !== eventId)
                      .map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title || 'Untitled'}
                        </option>
                      ))}
                  </select>
                  <span className="field-hint">
                    Brings across names, addresses, and phone numbers. Replies are
                    not copied \u2014 everyone starts fresh on this event.
                  </span>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={busy === 'roster' || !copyFrom}
                  onClick={copyList}
                >
                  Copy guests over
                </button>
              </>
            ) : null}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">The list</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(publicUrl, 'Public link')}>
                Copy public link
              </button>
            </div>
            {!guests.length ? (
              <div className="empty">
                <p>Nobody yet.</p>
                <p>Paste addresses above and they&rsquo;ll appear here.</p>
              </div>
            ) : (
              guests.map((g) => (
                <div key={g.id}>
                  <div className="guest">
                    <span className={`dot dot-${g.status}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="guest-name">{g.name || g.email || 'Unnamed guest'}</div>
                      <div className="guest-meta">
                        {g.email || 'no email'}
                        {g.phone ? ` \u00b7 ${g.phone}` : ''}
                        {g.email
                          ? g.invite_sent_at
                            ? ' \u00b7 invited'
                            : ' \u00b7 not sent'
                          : ' \u00b7 nothing to send'}
                        {g.opened_at
                          ? ` \u00b7 opened${g.open_count > 1 ? ` ${g.open_count}\u00d7` : ''}`
                          : g.invite_sent_at
                            ? ' \u00b7 unopened'
                            : ''}
                        {g.reminder_sent_at ? ' \u00b7 reminded' : ''}
                        {g.status !== 'pending' ? ` \u00b7 ${g.status.toUpperCase()}` : ''}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => (editingId === g.id ? setEditingId(null) : beginEdit(g))}
                    >
                      {editingId === g.id ? 'Close' : 'Edit'}
                    </button>
                    {g.email ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          copy(`${window.location.origin}/i/${g.token}`, 'Personal link')
                        }
                      >
                        Link
                      </button>
                    ) : null}
                    <button className="btn btn-ghost btn-sm" onClick={() => removeGuest(g.id)}>
                      Remove
                    </button>
                  </div>

                  {editingId === g.id && draft ? (
                    <div
                      style={{
                        borderLeft: '2px solid var(--plum)',
                        padding: '18px 0 18px 18px',
                        margin: '0 0 14px',
                      }}
                    >
                      <p className="eyebrow" style={{ marginBottom: 14 }}>
                        Recording a reply on their behalf
                      </p>

                      <div className="field-2">
                        <div className="field">
                          <label>Name</label>
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Phone</label>
                          <input
                            value={draft.phone}
                            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="field">
                        <label>Email</label>
                        <input
                          value={draft.email}
                          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                          placeholder="leave blank if you don't have one"
                        />
                      </div>

                      <div className="field">
                        <label>Reply</label>
                        <div
                          className="choice-row"
                          style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
                        >
                          {[
                            ['yes', 'Yes'],
                            ['maybe', 'Maybe'],
                            ['no', 'No'],
                            ['pending', 'Clear'],
                          ].map(([v, l]) => (
                            <button
                              key={v}
                              className={
                                'choice' +
                                (v === 'yes' ? ' choice-yes' : v === 'no' ? ' choice-no' : '')
                              }
                              aria-pressed={draft.status === v}
                              onClick={() => setDraft({ ...draft, status: v })}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>

                      {draft.status === 'yes' || draft.status === 'maybe' ? (
                        <div className="field-2">
                          <div className="field">
                            <label>Adults</label>
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={draft.adults}
                              onChange={(e) => setDraft({ ...draft, adults: e.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label>Children</label>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={draft.kids}
                              onChange={(e) => setDraft({ ...draft, kids: e.target.value })}
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="field">
                        <label>Note</label>
                        <textarea
                          value={draft.note}
                          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                          placeholder="Told us at the school run \u2014 bringing her mother"
                        />
                      </div>

                      <div className="btn-row">
                        <button
                          className="btn btn-plum btn-sm"
                          disabled={busy === 'guest'}
                          onClick={saveGuest}
                        >
                          {busy === 'guest' ? 'Saving\u2026' : 'Save reply'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setEditingId(null);
                            setDraft(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="field-hint" style={{ marginTop: 12 }}>
                        Saving here does not email anyone.
                      </p>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      {/* ------------------------------ SEND ------------------------------ */}
      {tab === 'send' ? (
        <>
          {!event.title || !event.event_at ? (
            <div className="callout callout-bad">
              <strong>Finish the card first.</strong> The invitation needs a name and a date
              before it goes out.
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Invitations</h2>
              <span className="eyebrow">{unsent} not yet sent</span>
            </div>
            <p className="field-hint" style={{ marginBottom: 16 }}>
              Each guest gets their own link, so replies attach to the right person
              automatically. Nobody sees anyone else&rsquo;s address.
            </p>
            <div className="btn-row">
              <button
                className="btn btn-plum"
                disabled={busy === 'send' || !unsent}
                onClick={() => send('invite', false)}
              >
                {busy === 'send' ? 'Sending\u2026' : `Send ${unsent} invitation${unsent === 1 ? '' : 's'}`}
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy === 'send' || !guests.length}
                onClick={() => {
                  if (confirm(`Send again to all ${guests.length} guests?`)) send('invite', true);
                }}
              >
                Resend to everyone
              </button>
            </div>
            {(() => {
              const sent = guests.filter((g) => g.invite_sent_at);
              const opened = sent.filter((g) => g.opened_at);
              const silentUnopened = sent.filter((g) => !g.opened_at && g.status === 'pending');
              if (!sent.length) return null;
              return (
                <p className="field-hint" style={{ marginTop: 16 }}>
                  {opened.length} of {sent.length} have opened their invitation.
                  {silentUnopened.length
                    ? ` ${silentUnopened.length} never opened it and never replied \u2014 worth a nudge by phone.`
                    : ''}
                </p>
              );
            })()}
            {sendReport ? (
              <p className="field-hint" style={{ marginTop: 14 }}>
                {sendReport.sent} sent
                {sendReport.failed ? `, ${sendReport.failed} failed` : ''}
                {sendReport.working ? ' \u2014 still working\u2026' : ''}
              </p>
            ) : null}
            {sendReport?.errors?.length ? (
              <div className="callout callout-bad" style={{ marginTop: 14 }}>
                <strong>Some addresses were rejected.</strong>
                <br />
                {sendReport.errors.slice(0, 5).map((e, i) => (
                  <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {e}
                    <br />
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Reminder</h2>
              {reminderOn != null ? (
                <span className="eyebrow">
                  {reminderOn > 0
                    ? `in ${reminderOn} days`
                    : reminderOn === 0
                      ? 'goes out today'
                      : 'already passed'}
                </span>
              ) : null}
            </div>
            <p className="field-hint" style={{ marginBottom: 16 }}>
              This one sends itself. A job runs every morning and mails everyone who said yes
              or maybe {event.reminder_days} days before the event
              {event.remind_pending ? ', plus anyone who never replied' : ''}. You only need the
              button below if you want it early.
            </p>
            <button
              className="btn"
              disabled={busy === 'send' || !guests.length}
              onClick={() => {
                if (confirm('Send the reminder now, ahead of schedule?')) send('reminder');
              }}
            >
              Send reminder now
            </button>
          </div>
        </>
      ) : null}

      {/* ----------------------------- REPLIES ---------------------------- */}
      {tab === 'replies' ? (
        <>
          <div className="stat-row" style={{ marginBottom: 18 }}>
            {[
              [counts.yes, 'Yes', 'yes'],
              [counts.maybe, 'Maybe', 'maybe'],
              [counts.no, 'No', 'no'],
              [counts.pending, 'Silent', 'pending'],
              [counts.adults, 'Adults', null],
              [counts.kids, 'Kids', null],
            ].map(([n, l, key]) =>
              key ? (
                <button
                  key={l}
                  className={`stat stat-btn stat-${key}`}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(filter === key ? null : key)}
                  title={filter === key ? 'Show everyone again' : `Show only ${l.toLowerCase()}`}
                >
                  <div className="stat-n">{n}</div>
                  <div className="stat-l">{l}</div>
                </button>
              ) : (
                <div className="stat" key={l}>
                  <div className="stat-n">{n}</div>
                  <div className="stat-l">{l}</div>
                </div>
              )
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                {filter
                  ? filter === 'pending'
                    ? 'Not yet replied'
                    : `Replied ${filter}`
                  : 'Replies'}
              </h2>
              <div className="btn-row">
                {filter ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => setFilter(null)}>
                    Show everyone
                  </button>
                ) : null}
                <button className="btn btn-ghost btn-sm" onClick={() => load(eventId)}>
                  Refresh
                </button>
                {guests.length ? (
                  <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
                    Export CSV
                  </button>
                ) : null}
              </div>
            </div>

            {!shown.length ? (
              <div className="empty">
                {filter ? (
                  <>
                    <p>
                      Nobody is marked {filter === 'pending' ? 'silent' : filter} yet.
                    </p>
                    <p>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 10 }}
                        onClick={() => setFilter(null)}
                      >
                        Show everyone
                      </button>
                    </p>
                  </>
                ) : (
                  <>
                    <p>No replies yet.</p>
                    <p>Send the invitations and they&rsquo;ll land here.</p>
                  </>
                )}
              </div>
            ) : (
              shown.map((g) => (
                  <div className="guest" key={g.id}>
                    <span className={`dot dot-${g.status}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="guest-name">{g.name}</div>
                      <div className="guest-meta">
                        {g.status.toUpperCase()}
                        {g.status !== 'no'
                          ? ` \u00b7 ${g.adults || 0} adult${(g.adults || 0) === 1 ? '' : 's'}${
                              g.kids > 0
                                ? `, ${g.kids} ${g.kids === 1 ? 'child' : 'children'}`
                                : ''
                            }`
                          : ''}
                        {g.email ? ` \u00b7 ${g.email}` : ''}
                        {g.phone ? ` \u00b7 ${g.phone}` : ''}
                        {g.source === 'link' ? ' \u00b7 via shared link' : ''}
                      </div>
                      {g.note ? <div className="guest-note">&ldquo;{g.note}&rdquo;</div> : null}
                    </div>
                  </div>
                ))
            )}
          </div>
        </>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
