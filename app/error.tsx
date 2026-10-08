'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading-page">
      <h1>Your portfolio could not load</h1>
      <p>Try again to load the synthetic sample portfolio.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
