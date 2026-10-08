'use client';
import { useId } from 'react';
import { AlertTriangle, CheckCircle2, FileText, RotateCcw, Search } from 'lucide-react';
import { Field, FieldGroup, FieldLabel } from './ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from './ui/input-group';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { statuses } from '@/lib/dates';
import type { Contract } from '@/lib/schema';
import { cn } from '@/lib/utils';
export type Filters = {
  search: string;
  category: string;
  autoRenew: string;
  status: string;
  value: string;
  notice: string;
  horizon: string;
  view: 'all' | 'attention' | 'reviewed';
};
export const emptyFilters: Filters = {
  search: '',
  category: 'all',
  autoRenew: 'all',
  status: 'all',
  value: 'all',
  notice: 'all',
  horizon: 'all',
  view: 'all',
};
export function FilterRail({
  filters,
  setFilters,
  contracts,
  attention,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  contracts: Contract[];
  attention: number;
}) {
  const prefix = useId();
  const update = (key: keyof Filters, value: string) => setFilters({ ...filters, [key]: value });
  const categories = [
    ...new Set(contracts.map((c) => c.extraction.category).filter((x): x is string => x !== null)),
  ].sort();
  const options: { key: keyof Filters; label: string; values: [string, string][] }[] = [
    {
      key: 'category',
      label: 'Category',
      values: [['all', 'All categories'], ...categories.map((c) => [c, c] as [string, string])],
    },
    {
      key: 'autoRenew',
      label: 'Auto-renew',
      values: [
        ['all', 'All'],
        ['yes', 'Yes'],
        ['no', 'No'],
      ],
    },
    {
      key: 'status',
      label: 'Status',
      values: [['all', 'All statuses'], ...statuses.map((s) => [s, s] as [string, string])],
    },
    {
      key: 'value',
      label: 'Value band',
      values: [
        ['all', 'All values'],
        ['under', 'Under £100,000'],
        ['over', '£100,000 and above'],
      ],
    },
    {
      key: 'notice',
      label: 'Notice period',
      values: [
        ['all', 'All notice periods'],
        ['short', 'Less than 60 days'],
        ['long', '60 days and above'],
      ],
    },
    {
      key: 'horizon',
      label: 'Renewing within',
      values: [
        ['all', 'Any time'],
        ['30', 'Next 30 days'],
        ['90', 'Next 90 days'],
        ['180', 'Next 6 months'],
      ],
    },
  ];
  return (
    <div className="rail-inner">
      <h2>Portfolio</h2>
      <div className="portfolio-nav">
        {(
          [
            { view: 'all', label: 'All contracts', Icon: FileText, count: contracts.length },
            { view: 'attention', label: 'Needs attention', Icon: AlertTriangle, count: attention },
            {
              view: 'reviewed',
              label: 'Reviewed',
              Icon: CheckCircle2,
              count: contracts.filter((c) => c.reviewed).length,
            },
          ] as const
        ).map(({ view, label, Icon, count }) => (
          <button
            key={view}
            className={cn('rail-link', filters.view === view && 'selected')}
            aria-pressed={filters.view === view}
            onClick={() => update('view', view)}
          >
            <Icon />
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>
      <Separator />
      <h2>Filters</h2>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${prefix}-supplier-search`} className="sr-only">
            Search suppliers
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={`${prefix}-supplier-search`}
              placeholder="Search suppliers…"
              value={filters.search}
              onChange={(e) => update('search', e.target.value)}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
        </Field>
        {options.map((o) => (
          <Field key={o.key}>
            <FieldLabel htmlFor={`${prefix}-filter-${o.key}`}>{o.label}</FieldLabel>
            <select
              id={`${prefix}-filter-${o.key}`}
              value={filters[o.key]}
              onChange={(e) => update(o.key, e.target.value)}
            >
              {o.values.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </FieldGroup>
      <Button variant="ghost" onClick={() => setFilters(emptyFilters)} className="reset-button">
        <RotateCcw data-icon="inline-start" />
        Reset filters
      </Button>
    </div>
  );
}
