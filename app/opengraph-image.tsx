import { ImageResponse } from 'next/og';
export const alt = 'Renewal Radar — source-backed contract intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        color: '#0f172a',
        padding: 70,
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          color: '#00777c',
          fontSize: 30,
          fontWeight: 700,
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          stroke="#00777c"
          strokeWidth="3"
        >
          <circle cx="20" cy="20" r="17" />
          <circle cx="20" cy="20" r="10" />
          <circle cx="20" cy="20" r="3" fill="#00777c" />
          <path d="M20 20L35 5" />
        </svg>
        Renewal Radar
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 70,
          fontSize: 70,
          fontWeight: 700,
          letterSpacing: '-3px',
        }}
      >
        Stay ahead of renewals.
      </div>
      <div style={{ display: 'flex', fontSize: 70, fontWeight: 700, letterSpacing: '-3px' }}>
        Keep your options open.
      </div>
      <div style={{ display: 'flex', marginTop: 40, fontSize: 25, color: '#596c85' }}>
        Deadlines. Key terms. Answers with evidence.
      </div>
      <div style={{ display: 'flex', marginTop: 'auto', fontSize: 18, color: '#596c85' }}>
        Synthetic portfolio demo · Source-backed contract intelligence
      </div>
    </div>,
    size,
  );
}
