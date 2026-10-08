'use client';
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  differenceInCalendarDays,
} from 'date-fns';
import type { Contract } from '@/lib/schema';
import { deadlines } from '@/lib/dates';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
export function Timeline({
  contracts,
  onOpen,
}: {
  contracts: Contract[];
  onOpen: (id: string, quote?: string) => void;
}) {
  const today = new Date();
  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(addMonths(today, i)));
  const events = contracts.flatMap((c) => {
    const d = deadlines(c.extraction);
    return [
      c.extraction.endDate
        ? { date: c.extraction.endDate, type: 'renewal', c, field: 'endDate' }
        : null,
      d.noticeWindowOpensOn
        ? { date: d.noticeWindowOpensOn, type: 'notice', c, field: 'noticePeriodDays' }
        : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null);
  });
  return (
    <section className="timeline-panel" aria-labelledby="timeline-title">
      <div className="section-title">
        <h2 id="timeline-title">
          Renewal timeline <span>(next 6 months)</span>
        </h2>
        <div className="legend">
          <span>
            <i data-event="notice" />
            Notice deadline
          </span>
          <span>
            <i data-event="renewal" />
            Renewal date
          </span>
        </div>
      </div>
      <div className="timeline-months">
        {months.map((month) => {
          const end = endOfMonth(month);
          const active = events.filter(
            (e) => e.date >= format(month, 'yyyy-MM-dd') && e.date <= format(end, 'yyyy-MM-dd'),
          );
          return (
            <div className="timeline-month" key={month.toISOString()}>
              <span className="month-label">{format(month, 'MMM yyyy')}</span>
              <div className="month-track">
                {active.map((event, i) => (
                  <Tooltip key={`${event.c.id}-${event.type}`}>
                    <TooltipTrigger asChild>
                      <button
                        aria-label={`${event.c.extraction.supplier} ${event.type} ${event.date}`}
                        data-event={event.type}
                        style={{
                          left: `${8 + (differenceInCalendarDays(parseISO(event.date), month) / (end.getDate() - 1)) * 84}%`,
                          top: i % 2 ? '-3px' : '3px',
                        }}
                        onClick={() =>
                          onOpen(
                            event.c.id,
                            event.c.extraction.evidence.find(
                              (e) => e.field === event.field && e.verified,
                            )?.quote,
                          )
                        }
                      >
                        <span className="sr-only">{format(parseISO(event.date), 'd MMM')}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {event.c.extraction.supplier}
                      <br />
                      {event.type === 'notice' ? 'Last notice date' : 'Renewal / expiry'} ·{' '}
                      {format(parseISO(event.date), 'd MMM')}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <span className="month-caption">
                {active.length
                  ? `${active.filter((e) => e.type === 'renewal').length} renewal${active.filter((e) => e.type === 'renewal').length !== 1 ? 's' : ''}`
                  : 'No renewals'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
