import { format, parseISO } from 'date-fns';
import type { Contract } from './schema';
import { fields } from './schema';
import { deadlines } from './dates';
import { evidenceFor } from './citations';
export const money = (n: number | null) =>
  n === null
    ? 'Not found'
    : new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(n);
export const labels: Record<string, string> = {
  supplier: 'Supplier',
  category: 'Category',
  annualValueGBP: 'Annual value',
  currency: 'Currency',
  startDate: 'Start date',
  endDate: 'End date',
  termMonths: 'Initial term',
  noticePeriodDays: 'Notice period',
  autoRenew: 'Auto-renew',
  renewalTermMonths: 'Renewal term',
  liabilityCapCustomer: 'Customer liability',
  liabilityCapSupplier: 'Supplier liability',
  governingLaw: 'Governing law',
  terminationForConvenience: 'Termination for convenience',
  hasDPA: 'Data processing addendum',
  paymentTerms: 'Payment terms',
};
export function displayValue(c: Contract, field: (typeof fields)[number]): string {
  const v = c.extraction[field];
  if (v === null)
    return field === 'renewalTermMonths' && c.extraction.autoRenew === false
      ? 'N/A — fixed term'
      : 'Not found';
  if (field === 'startDate' || field === 'endDate')
    return format(parseISO(v as string), 'd MMM yyyy');
  if (field === 'annualValueGBP') return money(v as number);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return v.summary;
  if (field === 'termMonths' || field === 'renewalTermMonths') return `${v} months`;
  if (field === 'noticePeriodDays') return `${v} days`;
  return String(v);
}
const safe = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function exportContract(c: Contract) {
  const d = deadlines(c.extraction);
  return `# ${c.extraction.supplier ?? c.name}\n\nStatus: ${d.status}\n\n${fields
    .map((f) => {
      const ev = evidenceFor(c.extraction, f);
      return `## ${labels[f]}\n\n${displayValue(c, f)}${ev ? `\n\n> ${ev.quote.replace(/\n/g, '\n> ')}\n\nSource: ${c.name} — ${ev.location}` : '\n\nNo verified source found.'}`;
    })
    .join(
      '\n\n',
    )}\n\n## Review\n\nReviewed: ${c.reviewed ? 'Yes' : 'No'}\n\n${c.note ?? ''}\n\n---\nSYNTHETIC DEMO DATA. Fictional company. Not real. Uploaded content is supplied by the user; use synthetic data only.\n`;
}
export function exportPortfolio(contracts: Contract[]) {
  const total = contracts.reduce((s, c) => s + (c.extraction.annualValueGBP ?? 0), 0);
  const traps = contracts.filter((c) => deadlines(c.extraction).trap);
  return `# Renewal Radar — portfolio summary\n\nGenerated: ${new Date().toISOString().slice(0, 10)}\n\n${contracts.length} contracts · ${money(total)} annualised GBP spend\n\nValues not found in source are excluded from spend. Summary reflects current filters.\n\n## Auto-renew traps\n\n${traps.length ? traps.map((c) => `- ${c.extraction.supplier}: ${deadlines(c.extraction).status}, last notice date ${deadlines(c.extraction).noticeWindowOpensOn}.`).join('\n') : 'No traps in this selection.'}\n\n## Upcoming renewals and expiries\n\n| Supplier | Annual value | End | Last notice date | Status |\n|---|---:|---|---|---|\n${[
    ...contracts,
  ]
    .sort((a, b) => (a.extraction.endDate ?? '9999').localeCompare(b.extraction.endDate ?? '9999'))
    .map((c) => {
      const d = deadlines(c.extraction);
      return `| ${safe(c.extraction.supplier ?? c.name)} | ${money(c.extraction.annualValueGBP)} | ${c.extraction.endDate ?? 'Not found'} | ${d.noticeWindowOpensOn ?? 'Not found'} | ${d.status} |`;
    })
    .join('\n')}\n\n## Source evidence\n\n${contracts
    .map(
      (c) =>
        `### ${c.extraction.supplier ?? c.name}\n\n${[
          'annualValueGBP',
          'endDate',
          'noticePeriodDays',
          'autoRenew',
        ]
          .map((f) => {
            const e = evidenceFor(c.extraction, f as (typeof fields)[number]);
            return e ? `> ${e.quote}\n\nSource: ${c.name} — ${e.location}` : null;
          })
          .filter(Boolean)
          .join('\n\n')}`,
    )
    .join(
      '\n\n',
    )}\n\n---\nSYNTHETIC DEMO DATA. Fictional company. Not real. Uploaded content is supplied by the user; use synthetic data only. Human review is required before commercial action.\n`;
}
export function downloadMarkdown(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
