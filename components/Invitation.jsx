'use client';

import { useState } from 'react';
import InvitationCard from './InvitationCard';

export default function Invitation({ event, guest }) {
  const known = !!guest;
  const alreadyReplied = known && guest.status !== 'pending';

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [phase, setPhase] = useState(alreadyReplied || reduced ? 'open' : 'sealed');
  const [name, setName] = useState(guest?.name || '');
  const [email, setEmail] = useState(guest?.email || '');
  const [phone, setPhone] = useState(guest?.phone || '');
  const [status, setStatus] = useState(alreadyReplied ? guest.status : '');
  const [adults, setAdults] = useState(guest?.adults ?? 1);
  const [kids, setKids] = useState(guest?.kids ?? 0);
  const [note, setNote] = useState(guest?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(alreadyReplied);
  const [editing, setEditing] = useState(false);

  function open() {
    if (phase !== 'sealed') return;
    setPhase('opening');
    setTimeout(() => setPhase('leaving'), 900);
    setTimeout(() => setPhase('open'), 1400);
  }

  async function submit() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: guest?.token,
          slug: event.slug,
          name,
          email,
          phone,
          status,
          adults,
          kids,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
      } else {
        setDone(true);
        setEditing(false);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setSaving(false);
  }

  if (phase === 'sealed' || phase === 'opening' || phase === 'leaving') {
    // Whatever the host typed, or failing that the first word of their name.
    const sealText =
      (event.seal || '').trim() ||
      (event.hosts || '').trim().split(/\s+/).filter(Boolean).pop() ||
      (event.title || '?').trim().charAt(0).toUpperCase();
    const isWord = sealText.length > 2;
    return (
      <div className="wrap">
        <div className="env-stage">
          <div
            className={
              'env' +
              (phase !== 'sealed' ? ' is-open' : '') +
              (phase === 'leaving' ? ' is-gone' : '')
            }
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            }}
            aria-label="Open your invitation"
          >
            <div className="env-body" />
            <div className="env-flap" />
            <div className={'seal' + (isWord ? ' seal-word' : '')}>{sealText}</div>
            <div className="env-addr">
              {guest?.name ? guest.name : "You\u2019re invited"}
            </div>
            <div className="env-hint">
              <span className="eyebrow">Click to open</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showForm = !done || editing;

  return (
    <div className="wrap">
      <InvitationCard event={event} />

      <div className="panel rsvp-panel" style={{ marginTop: 18 }}>
        {!showForm ? (
          <div style={{ textAlign: 'center' }}>
            <span className="eyebrow">Your reply is recorded</span>
            <p
              className="guest-answer"
              style={{ fontFamily: 'var(--display)', fontSize: 24, margin: '12px 0 6px' }}
            >
              {status === 'yes'
                ? "We'll see you there."
                : status === 'maybe'
                  ? 'Marked as a maybe.'
                  : 'Sorry to miss you.'}
            </p>
            <p style={{ color: 'var(--rsvp-ink-soft)', fontSize: 14, margin: 0 }}>
              {name}
              {status !== 'no'
                ? ` \u00b7 ${Number(adults) || 1} adult${(Number(adults) || 1) === 1 ? '' : 's'}${
                    Number(kids) > 0
                      ? `, ${kids} ${Number(kids) === 1 ? 'child' : 'children'}`
                      : ''
                  }`
                : ''}
            </p>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 18 }}
              onClick={() => setEditing(true)}
            >
              Change my reply
            </button>
          </div>
        ) : (
          <>
            <div className="panel-head">
              <h2 className="panel-title">Reply</h2>
            </div>

            <div className="field">
              <label htmlFor="rsvp-name">Your name</label>
              <input
                id="rsvp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First and last"
              />
            </div>

            <div className="field">
              <label htmlFor="rsvp-email">Email</label>
              <input
                id="rsvp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                readOnly={known}
              />
              <span className="field-hint">
                {known
                  ? 'This is the address your invitation came to.'
                  : 'So we can send you a confirmation.'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="rsvp-phone">Mobile number</label>
              <input
                id="rsvp-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 012-3456"
              />
              <span className="field-hint">
                Optional. Only used if your host needs to reach you on the day.
              </span>
            </div>

            <div className="field">
              <label>Will you be there?</label>
              <div className="choice-row">
                <button
                  className="choice choice-yes"
                  aria-pressed={status === 'yes'}
                  onClick={() => setStatus('yes')}
                >
                  Yes
                </button>
                <button
                  className="choice"
                  aria-pressed={status === 'maybe'}
                  onClick={() => setStatus('maybe')}
                >
                  Maybe
                </button>
                <button
                  className="choice choice-no"
                  aria-pressed={status === 'no'}
                  onClick={() => setStatus('no')}
                >
                  No
                </button>
              </div>
            </div>

            {event.allow_plus_ones && status && status !== 'no' ? (
              <div className="field-2">
                <div className="field">
                  <label htmlFor="rsvp-adults">Adults</label>
                  <input
                    id="rsvp-adults"
                    type="number"
                    min="1"
                    max="20"
                    value={adults}
                    onChange={(e) => setAdults(e.target.value)}
                  />
                  <span className="field-hint">Including you.</span>
                </div>
                <div className="field">
                  <label htmlFor="rsvp-kids">Children</label>
                  <input
                    id="rsvp-kids"
                    type="number"
                    min="0"
                    max="20"
                    value={kids}
                    onChange={(e) => setKids(e.target.value)}
                  />
                  <span className="field-hint">Leave at zero if none.</span>
                </div>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="rsvp-note">Note for the host</label>
              <textarea
                id="rsvp-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={'Dietary needs, arrival time, a hello\u2026'}
              />
              <span className="field-hint">Optional.</span>
            </div>

            {error ? (
              <p className="field-hint" style={{ color: 'var(--plum)', marginBottom: 12 }}>
                {error}
              </p>
            ) : null}

            <div className="btn-row">
              <button
                className="btn btn-plum"
                onClick={submit}
                disabled={saving || !name.trim() || !status}
              >
                {saving ? 'Sending\u2026' : done ? 'Update reply' : 'Send reply'}
              </button>
              {done ? (
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
