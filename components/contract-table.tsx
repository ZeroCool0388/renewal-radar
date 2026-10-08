'use client';
import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  SlidersHorizontal,
  MoveHorizontal,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from './ui/empty';
import { StatusPill } from './status';
import { money } from '@/lib/export';
import { deadlines } from '@/lib/dates';
import type { Contract } from '@/lib/schema';
import { cn } from '@/lib/utils';
const shortDate = (s: string | null) => (s ? format(parseISO(s), 'd MMM yyyy') : 'Not found');
const days = (n: number | null) =>
  n === null ? 'Not found' : n === 0 ? 'Today' : n < 0 ? `${Math.abs(n)} days ago` : `in ${n} days`;
export function ContractTable({
  contracts,
  onOpen,
  onReset,
}: {
  contracts: Contract[];
  onOpen: (id: string) => void;
  onReset: () => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'endDate', desc: false }]);
  const [expanded, setExpanded] = useState(false);
  const columns = useMemo<ColumnDef<Contract>[]>(
    () => [
      {
        id: 'supplier',
        accessorFn: (c) => c.extraction.supplier ?? c.name,
        header: 'Supplier',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="supplier-cell">
              <span
                className="supplier-avatar"
                data-tone={
                  deadlines(c.extraction).status === 'Auto-renewing soon'
                    ? 'danger'
                    : ['Logistics SaaS', 'Life sciences'].includes(c.extraction.category ?? '')
                      ? 'blue'
                      : 'teal'
                }
              >
                {(c.extraction.supplier ?? c.name)
                  .split(' ')
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('')}
              </span>
              <span>
                <button
                  className="supplier-name"
                  onKeyDown={(event) => {
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault();
                      const list = Array.from(
                        event.currentTarget
                          .closest('table')!
                          .querySelectorAll<HTMLButtonElement>('.supplier-name'),
                      );
                      const index = list.indexOf(event.currentTarget);
                      list[
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? list.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  list.length - 1,
                                  index + (event.key === 'ArrowDown' ? 1 : -1),
                                ),
                              )
                      ]?.focus();
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(c.id);
                  }}
                >
                  {c.extraction.supplier ?? c.name}
                </button>
                <span className="supplier-category">
                  {c.extraction.category ?? 'Category not found'}
                  {c.reviewed && <CheckCircle2 aria-label="Reviewed" />}
                </span>
                <span className="mobile-row-status">
                  <StatusPill status={deadlines(c.extraction).status} />
                </span>
              </span>
            </div>
          );
        },
      },
      {
        id: 'annualValueGBP',
        accessorFn: (c) => c.extraction.annualValueGBP,
        header: 'Annual value',
        cell: ({ row }) => money(row.original.extraction.annualValueGBP),
      },
      { id: 'category', accessorFn: (c) => c.extraction.category, header: 'Category' },
      {
        id: 'startDate',
        accessorFn: (c) => c.extraction.startDate,
        header: 'Start date',
        cell: ({ row }) => shortDate(row.original.extraction.startDate),
      },
      {
        id: 'endDate',
        accessorFn: (c) => c.extraction.endDate,
        header: 'Renewal date',
        cell: ({ row }) => {
          const c = row.original;
          const d = deadlines(c.extraction);
          return (
            <div className="date-cell">
              <span>{shortDate(c.extraction.endDate)}</span>
              <small data-urgent={d.daysToRenew !== null && d.daysToRenew <= 30}>
                {days(d.daysToRenew)}
              </small>
            </div>
          );
        },
      },
      {
        id: 'notice',
        accessorFn: (c) => deadlines(c.extraction).noticeWindowOpensOn,
        header: 'Notice deadline',
        cell: ({ row }) => {
          const d = deadlines(row.original.extraction);
          return (
            <div className="date-cell">
              <span>{shortDate(d.noticeWindowOpensOn)}</span>
              <small data-urgent={d.daysToNotice !== null && d.daysToNotice <= 0}>
                {days(d.daysToNotice)}
                {row.original.extraction.autoRenew === false ? ' · fixed term' : ''}
              </small>
            </div>
          );
        },
      },
      {
        id: 'noticePeriodDays',
        accessorFn: (c) => c.extraction.noticePeriodDays,
        header: 'Notice period',
        cell: ({ row }) =>
          row.original.extraction.noticePeriodDays === null
            ? 'Not found'
            : `${row.original.extraction.noticePeriodDays} days`,
      },
      {
        id: 'autoRenew',
        accessorFn: (c) => c.extraction.autoRenew,
        header: 'Auto-renew',
        cell: ({ row }) =>
          row.original.extraction.autoRenew === null
            ? 'Not found'
            : row.original.extraction.autoRenew
              ? 'Yes'
              : 'No',
      },
      {
        id: 'liability',
        accessorFn: (c) => c.extraction.liabilityCapCustomer,
        header: 'Customer liability',
        cell: ({ row }) => row.original.extraction.liabilityCapCustomer ?? 'Not found',
      },
      {
        id: 'status',
        accessorFn: (c) => deadlines(c.extraction).status,
        header: 'Status',
        cell: ({ row }) => <StatusPill status={deadlines(row.original.extraction).status} />,
      },
    ],
    [onOpen],
  );
  // TanStack intentionally exposes stable table methods; React Compiler does not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is intentionally not compiler-memoized.
  const table = useReactTable({
    data: contracts,
    columns,
    state: {
      sorting,
      columnVisibility: {
        category: expanded,
        startDate: expanded,
        noticePeriodDays: expanded,
        liability: expanded,
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <>
      <div className="table-options">
        <span className="table-instruction">Click a supplier to inspect its source terms</span>
        <span className="scroll-hint">
          <MoveHorizontal />
          Scroll to see all columns
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal data-icon="inline-start" />
          {expanded ? 'Fewer columns' : 'More terms'}
        </Button>
      </div>
      {contracts.length ? (
        <Table className={cn('contracts-table', expanded && 'expanded-table')}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      className="sort-button"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? (
                        <ArrowUp />
                      ) : header.column.getIsSorted() === 'desc' ? (
                        <ArrowDown />
                      ) : (
                        <ArrowUpDown />
                      )}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="contract-row"
                onClick={() => onOpen(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matching contracts</EmptyTitle>
            <EmptyDescription>
              Try another filter or reset your selection to see the full portfolio.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={onReset}>
              Reset filters
            </Button>
          </EmptyContent>
        </Empty>
      )}
      <footer className="table-footer">
        <span>
          {contracts.length} contract{contracts.length !== 1 ? 's' : ''} <span>/</span> Synthetic
          demo data
        </span>
        <span>Source-backed. Human decisions.</span>
      </footer>
    </>
  );
}
