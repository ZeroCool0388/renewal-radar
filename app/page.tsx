import { loadSeeds } from '@/lib/seeds';
import { configuredMode } from '@/lib/llm';
import { Dashboard } from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const contracts = await loadSeeds();
  let live = false;
  try {
    live = configuredMode() !== 'demo';
  } catch {}
  return (
    <Dashboard
      initialContracts={contracts}
      liveConfigured={live}
      asOf={new Date().toISOString().slice(0, 10)}
    />
  );
}
