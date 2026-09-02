import { fmtDate, fmtTime, fmtPlainDate } from '@/lib/format';

export default function InvitationCard({ event }) {
  const tz = event.timezone;
  return (
    <>
      {event.image_url ? (
        <figure className="photo">
          <img src={event.image_url} alt="" />
        </figure>
      ) : null}

      <article className="card">
        <div className="card-inner">
        {event.hosts ? <p className="card-hosts">{event.hosts}</p> : null}
        <h1 className="card-title">{event.title || 'You are invited'}</h1>
        <hr className="rule-gold" />
        <div className="detail-grid">
          {event.event_at ? (
            <div className="detail-row detail-row-lg">
              <span className="detail-k">When</span>
              <span className="detail-v detail-v-strong">{fmtDate(event.event_at, tz)}</span>
              <span className="detail-v">
                {fmtTime(event.event_at, tz)}
                {event.ends_at ? ` until ${fmtTime(event.ends_at, tz)}` : ''}
              </span>
            </div>
          ) : null}

          {event.venue_name || event.address ? (
            <div className="detail-row detail-row-lg">
              <span className="detail-k">Where</span>
              {event.venue_name ? (
                <span className="detail-v detail-v-strong">{event.venue_name}</span>
              ) : null}
              {event.address ? (
                <a
                  className="detail-v"
                  href={`https://maps.google.com/?q=${encodeURIComponent(event.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {event.address}
                </a>
              ) : null}
            </div>
          ) : null}

          {event.dress_code ? (
            <div className="detail-row">
              <span className="detail-k">Dress</span>
              <span className="detail-v">{event.dress_code}</span>
            </div>
          ) : null}

          {event.rsvp_by ? (
            <div className="detail-row">
              <span className="detail-k">Reply by</span>
              <span className="detail-v">{fmtPlainDate(event.rsvp_by)}</span>
            </div>
          ) : null}
        </div>

        {event.note ? <p className="card-note">{event.note}</p> : null}

        {event.event_at ? (
          <p style={{ marginTop: 26, marginBottom: 0 }}>
            <a className="btn btn-ghost btn-sm" href={`/api/ics/${event.slug}`}>
              Add to calendar
            </a>
          </p>
        ) : null}
        </div>
      </article>
    </>
  );
}
