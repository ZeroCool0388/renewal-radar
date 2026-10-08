'use client';
import { FileText, PoundSterling, TriangleAlert, ChartNoAxesColumnIncreasing } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { deadlines } from '@/lib/dates';
import { money } from '@/lib/export';
import type { Contract } from '@/lib/schema';
const compact = (n: number) =>
  n >= 1000000
    ? `£${(n / 1000000).toFixed(2)}m`
    : n >= 1000
      ? `£${Math.round(n / 1000)}k`
      : money(n);
export function Metrics({ contracts }: { contracts: Contract[] }) {
  const upcoming = contracts.filter((c) => {
    const d = deadlines(c.extraction).daysToRenew;
    return d !== null && d >= 0 && d <= 90;
  });
  const next30 = upcoming.filter((c) => deadlines(c.extraction).daysToRenew! <= 30).length;
  const spend = contracts.reduce((sum, c) => sum + (c.extraction.annualValueGBP ?? 0), 0);
  const rows = [
    {
      Icon: FileText,
      value: contracts.length,
      label: 'Contracts in portfolio',
      detail: `${contracts.filter((c) => c.reviewed).length} reviewed`,
      tone: 'teal',
    },
    {
      Icon: PoundSterling,
      value: compact(upcoming.reduce((sum, c) => sum + (c.extraction.annualValueGBP ?? 0), 0)),
      label: 'Renewing in 90 days',
      detail: `${upcoming.length} in 90 days · ${next30} in 30 days`,
      tone: 'teal',
    },
    {
      Icon: TriangleAlert,
      value: contracts.filter((c) => deadlines(c.extraction).trap).length,
      label: 'Auto-renew traps',
      detail: 'Notice due or less than 30 days away',
      tone: 'amber',
    },
    {
      Icon: ChartNoAxesColumnIncreasing,
      value: compact(spend),
      label: 'Annual spend',
      detail: 'Verified GBP values',
      tone: 'blue',
    },
  ];
  const spark = Array.from({ length: 6 }, (_, i) => ({
    value: contracts
      .filter((c) => {
        const d = deadlines(c.extraction).daysToRenew;
        return d !== null && d >= 0 && d <= (i + 1) * 30;
      })
      .reduce((s, c) => s + (c.extraction.annualValueGBP ?? 0), 0),
  }));
  return (
    <section className="kpi-strip" aria-label="Portfolio metrics">
      {rows.map((r, i) => (
        <Card key={r.label} className="metric">
          <CardHeader>
            <div className="metric-top">
              <span className="metric-icon" data-tone={r.tone}>
                <r.Icon />
              </span>
              <CardTitle>{r.value}</CardTitle>
            </div>
            <CardDescription>{r.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <span>{r.detail}</span>
            {i === 3 && (
              <div className="sparkline" aria-hidden="true">
                <ResponsiveContainer width="100%" height={24} minWidth={0}>
                  <AreaChart data={spark} accessibilityLayer={false}>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--primary)"
                      fill="var(--accent)"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
