import {
  addDays,
  subMonths,
  format,
  startOfDay,
  differenceInCalendarDays,
  parseISO,
  isValid,
} from 'date-fns';
import type { Extraction } from './schema';
export function resolveRelativeDates(text: string, today = new Date()): string {
  const base = startOfDay(today);
  return text
    .replace(/\{\{TODAY([+-]\d+)\}\}/g, (_, days) =>
      format(addDays(base, Number(days)), 'yyyy-MM-dd'),
    )
    .replace(/\{\{START:(-?\d+):(\d+)\}\}/g, (_, offset, months) =>
      format(subMonths(addDays(base, Number(offset)), Number(months)), 'yyyy-MM-dd'),
    )
    .replace(/\{\{Q1:(\d{2}-\d{2})\}\}/g, (_, md) => {
      let d = parseISO(`${base.getFullYear()}-${md}`);
      if (d < base) d = parseISO(`${base.getFullYear() + 1}-${md}`);
      return format(d, 'yyyy-MM-dd');
    })
    .replace(/\{\{Q1START:(\d{2}-\d{2}):(\d+)\}\}/g, (_, md, months) => {
      let d = parseISO(`${base.getFullYear()}-${md}`);
      if (d < base) d = parseISO(`${base.getFullYear() + 1}-${md}`);
      return format(subMonths(d, Number(months)), 'yyyy-MM-dd');
    });
}
export const statuses = [
  'OK',
  'Notice window open',
  'Auto-renewing soon',
  'Expired',
  'Needs review',
] as const;
export type Status = (typeof statuses)[number];
export function deadlines(e: Extraction, today = new Date()) {
  const end = e.endDate ? parseISO(e.endDate) : null;
  const validEnd = end && isValid(end) ? end : null;
  const notice =
    validEnd && e.noticePeriodDays !== null ? addDays(validEnd, -e.noticePeriodDays) : null;
  const daysToRenew = validEnd ? differenceInCalendarDays(validEnd, startOfDay(today)) : null;
  const daysToNotice = notice ? differenceInCalendarDays(notice, startOfDay(today)) : null;
  let status: Status = 'OK';
  if (daysToRenew === null || e.autoRenew === null || e.noticePeriodDays === null)
    status = 'Needs review';
  else if (daysToRenew < 0) status = 'Expired';
  else if (e.autoRenew && daysToRenew <= 30) status = 'Auto-renewing soon';
  else if (daysToNotice !== null && daysToNotice <= 0) status = 'Notice window open';
  return {
    noticeWindowOpensOn: notice ? format(notice, 'yyyy-MM-dd') : null,
    daysToNotice,
    daysToRenew,
    status,
    trap:
      e.autoRenew === true &&
      daysToRenew !== null &&
      daysToRenew >= 0 &&
      daysToNotice !== null &&
      daysToNotice < 30,
  };
}
export function upcomingQ1(today = new Date()) {
  const year = today.getMonth() > 2 ? today.getFullYear() + 1 : today.getFullYear();
  return { start: `${year}-01-01`, end: `${year}-03-31`, year };
}
