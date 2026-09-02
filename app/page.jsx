export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitation' };

/**
 * The bare domain deliberately shows nothing. An invitation is only reachable
 * through a guest's personal link (/i/<token>) or the shared event link
 * (/e/<slug>) — landing here should never produce an RSVP form for whichever
 * event happens to be first in the database.
 */
export default function Home() {
  return (
    <div className="wrap">
      <div className="panel" style={{ textAlign: 'center', marginTop: 60 }}>
        <p className="eyebrow">Nothing to see here</p>
        <p
          style={{
            fontFamily: 'var(--display)',
            fontSize: 26,
            margin: '14px 0 10px',
            lineHeight: 1.2,
          }}
        >
          Invitations live at their own link.
        </p>
        <p style={{ color: 'var(--smoke)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Open the link from your email, or ask your host to send it again.
        </p>
      </div>

      <p style={{ textAlign: 'center', marginTop: 28 }}>
        <a className="eyebrow" href="/admin" style={{ textDecoration: 'none' }}>
          Host tools
        </a>
      </p>
    </div>
  );
}
