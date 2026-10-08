import type { Metadata } from 'next';
import '@fontsource-variable/geist';
import './globals.css';
import { Providers } from '@/components/providers';
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
  ),
  title: 'Renewal Radar — stay ahead of renewals',
  description:
    'A source-backed contract renewal dashboard. Catch notice deadlines, understand key terms and ask your portfolio. Synthetic portfolio demo.',
  openGraph: {
    title: 'Renewal Radar',
    description: 'Stay ahead of renewals. Keep your options open.',
    type: 'website',
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main">
          Skip to portfolio
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
