import { AlertTriangle, CheckCircle2, Clock3, HelpCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from './ui/badge';
import type { Mode } from '@/lib/schema';
import type { Status } from '@/lib/dates';
export function StatusPill({ status }: { status: Status }) {
  const Icon =
    status === 'OK'
      ? CheckCircle2
      : status === 'Expired'
        ? Clock3
        : status === 'Needs review'
          ? HelpCircle
          : status === 'Auto-renewing soon'
            ? RefreshCw
            : AlertTriangle;
  return (
    <Badge
      variant="outline"
      data-risk={
        status === 'OK'
          ? 'okay'
          : status === 'Auto-renewing soon'
            ? 'danger'
            : status === 'Notice window open'
              ? 'warning'
              : 'neutral'
      }
    >
      <Icon aria-hidden="true" />
      {status}
    </Badge>
  );
}
export function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <Badge variant="outline" data-risk={mode === 'demo' ? 'warning' : 'okay'}>
      <Sparkles aria-hidden="true" />
      {mode === 'demo' ? 'Demo mode' : `${mode === 'openai' ? 'OpenAI' : 'Anthropic'} live`}
    </Badge>
  );
}
