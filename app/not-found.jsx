export default function NotFound() {
  return (
    <div className="wrap">
      <div className="panel" style={{ textAlign: 'center', marginTop: 60 }}>
        <p className="eyebrow">Nothing here</p>
        <p style={{ fontFamily: 'var(--display)', fontSize: 26, margin: '14px 0 8px' }}>
          That invitation link is not valid.
        </p>
        <p style={{ color: 'var(--smoke)', fontSize: 14, margin: 0 }}>
          Check the link in your email, or ask the host to resend it.
        </p>
      </div>
    </div>
  );
}
