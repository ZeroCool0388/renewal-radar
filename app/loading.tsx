import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
  return (
    <main className="loading-page">
      <p>Loading your portfolio…</p>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}
