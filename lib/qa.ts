import fixtures from '@/data/qa-fixtures.json';
import { deadlines, upcomingQ1, resolveRelativeDates } from './dates';
import { evidenceFor, verifyAnswer, verifyQuote } from './citations';
import type { Contract, AskResponse, Field } from './schema';
export const starterQuestions = Object.keys(fixtures);
const money = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
export function demoAsk(
  question: string,
  contracts: Contract[],
  history: { role: string; content: string }[] = [],
  today = new Date(),
): AskResponse {
  let q = question.toLowerCase();
  if (/^(and |what about |only |those |which of those)/.test(q)) {
    const previous = [...history].reverse().find((m) => m.role === 'user');
    if (previous) q = `${previous.content.toLowerCase()} ${q}`;
  }
  const fixture = Object.entries(fixtures).find(([s]) => s.toLowerCase() === q)?.[1];
  let intent =
    fixture?.intent ??
    (/q1|first quarter/.test(q)
      ? 'q1'
      : /liability|uncapped|indemnity/.test(q)
        ? 'liability'
        : /dpa|english law|england/.test(q)
          ? 'law-dpa'
          : /spend|total value|total cost/.test(q)
            ? 'spend'
            : /auto.?renew|notice.*60|short.*notice/.test(q)
              ? 'short-notice'
              : 'keyword');
  const q1 = upcomingQ1(today);
  let matched: Contract[] = [];
  let selectedFields: Field[] = [];
  let summary = '';
  if (intent === 'q1') {
    matched = contracts.filter(
      (c) =>
        c.extraction.endDate &&
        c.extraction.endDate >= q1.start &&
        c.extraction.endDate <= q1.end &&
        c.extraction.autoRenew === false,
    );
    selectedFields = ['terminationForConvenience', 'endDate', 'autoRenew', 'noticePeriodDays'];
    summary = `${matched.length} fixed-term agreements end in Q1 ${q1.year}. These have no automatic extension. Check the cited convenience rights and notice requirements before making an exit decision.`;
  } else if (intent === 'short-notice') {
    matched = contracts.filter(
      (c) =>
        c.extraction.autoRenew === true &&
        c.extraction.noticePeriodDays !== null &&
        c.extraction.noticePeriodDays < 60,
    );
    selectedFields = ['noticePeriodDays', 'autoRenew', 'endDate'];
    summary = `${matched.length} agreements auto-renew with less than 60 days’ notice. Check the notice deadline for each agreement before planning non-renewal.`;
    if (/(?:more|over|above)\s*(\d+)\s*days/.test(q)) {
      const n = Number(q.match(/(?:more|over|above)\s*(\d+)\s*days/)?.[1]);
      matched = contracts.filter(
        (c) =>
          c.extraction.autoRenew &&
          c.extraction.noticePeriodDays !== null &&
          c.extraction.noticePeriodDays > n,
      );
      summary = `${matched.length} auto-renewing agreements require more than ${n} days’ notice.`;
    }
  } else if (intent === 'liability') {
    const field: Field = /supplier/.test(q) ? 'liabilityCapSupplier' : 'liabilityCapCustomer';
    selectedFields = [field, 'annualValueGBP'];
    matched = contracts.filter((c) => {
      const cap = c.extraction[field] as string | null;
      if (!cap) return false;
      const number = Number(cap.replace(/,/g, '').match(/£([\d.]+)/)?.[1] ?? 0);
      const months = Number(cap.match(/(\d+) months/i)?.[1] ?? 0);
      const value = c.extraction.annualValueGBP;
      return (
        /uncapped/i.test(cap) ||
        number > 1000000 ||
        (value !== null && (value * months) / 12 > 1000000)
      );
    });
    summary = `${matched.length} agreements have ${field === 'liabilityCapCustomer' ? 'Customer' : 'Supplier'} liability that is uncapped or above £1 million. Uncapped exceptions are distinct from the general cap.`;
  } else if (intent === 'law-dpa') {
    matched = contracts.filter(
      (c) => c.extraction.governingLaw === 'England and Wales' && c.extraction.hasDPA === true,
    );
    selectedFields = ['governingLaw', 'hasDPA'];
    summary = `${matched.length} agreements expressly combine England and Wales governing law with a DPA.`;
  } else if (intent === 'spend') {
    matched = contracts.filter((c) => {
      const d = deadlines(c.extraction, today);
      return (
        d.daysToRenew !== null &&
        d.daysToRenew >= 0 &&
        d.daysToRenew <= 90 &&
        c.extraction.annualValueGBP !== null
      );
    });
    selectedFields = ['annualValueGBP', 'endDate'];
    summary = `${money(matched.reduce((sum, c) => sum + (c.extraction.annualValueGBP ?? 0), 0))} in annualised spend across ${matched.length} agreements ending within 90 days. This includes fixed expiries and automatic renewals; it is not a forecast invoice total.`;
  } else {
    const tokens = q
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 3 &&
          ![
            'which',
            'what',
            'show',
            'tell',
            'about',
            'contract',
            'contracts',
            'supplier',
            'suppliers',
            'have',
            'with',
            'does',
            'their',
            'list',
            'please',
            'renewal',
          ].includes(w),
      );
    matched = contracts.filter((c) =>
      tokens.some((w) =>
        `${c.extraction.supplier} ${c.extraction.category} ${c.extraction.governingLaw}`
          .toLowerCase()
          .includes(w),
      ),
    );
    selectedFields = /payment/.test(q)
      ? ['paymentTerms']
      : /notice/.test(q)
        ? ['noticePeriodDays', 'endDate']
        : ['supplier', 'endDate'];
    summary = matched.length
      ? `Found ${matched.length} agreements matching your keywords. Here are their verified source terms.`
      : 'No reliable match for that question. Try a supplier name or one of the suggested questions.';
    intent = 'keyword';
  }
  if (/only.*(?:english|england)|(?:with|have|has) a dpa/.test(q))
    matched = matched.filter(
      (c) =>
        (!/(?:english|england)/.test(q) || c.extraction.governingLaw === 'England and Wales') &&
        (!/dpa/.test(q) || c.extraction.hasDPA === true),
    );
  if (/^(?:what about|only|and only) /i.test(question)) {
    const supplierMatches = contracts.filter((c) => {
      const distinctiveName = c.extraction.supplier?.split(/\s+/)[0]?.toLowerCase();
      return distinctiveName && question.toLowerCase().includes(distinctiveName);
    });
    if (supplierMatches.length)
      matched = matched.filter((c) => supplierMatches.some((supplier) => supplier.id === c.id));
  }
  // Recompute summary values after follow-up filters, using the same matches as the citations.
  if (intent === 'spend')
    summary = `${money(matched.reduce((sum, c) => sum + (c.extraction.annualValueGBP ?? 0), 0))} in annualised spend across ${matched.length} agreements ending within 90 days. This includes fixed expiries and automatic renewals; it is not a forecast invoice total.`;
  else if (intent !== 'keyword') summary = summary.replace(/^\d+/, String(matched.length));
  const matches = matched
    .map((c) => {
      const e = c.extraction;
      return {
        contractId: c.id,
        reason:
          intent === 'q1'
            ? `${e.endDate} · ${e.terminationForConvenience?.summary ?? 'Convenience exit not found'}`
            : intent === 'short-notice'
              ? `${e.noticePeriodDays} days’ notice · ${deadlines(e, today).status}`
              : intent === 'liability'
                ? String(e[selectedFields[0]])
                : intent === 'spend'
                  ? `${money(e.annualValueGBP ?? 0)} / year · ends ${e.endDate}`
                  : intent === 'law-dpa'
                    ? 'England and Wales · DPA incorporated'
                    : (e.supplier ?? c.name),
        citations: selectedFields.flatMap((f) => {
          const ev = evidenceFor(e, f);
          const template = fixture?.exampleMatches
            .find((m) => m.contractId === c.id)
            ?.citations.find((e) => e.field === f);
          const templateQuote = template ? resolveRelativeDates(template.quote, today) : null;
          return ev
            ? [
                {
                  quote:
                    templateQuote && verifyQuote(templateQuote, c.text) ? templateQuote : ev.quote,
                  location: ev.location,
                },
              ]
            : [];
        }),
      };
    })
    .filter((m) => m.citations.length > 0);
  return verifyAnswer(
    {
      summary,
      matches,
      caveat:
        'Synthetic demo data. Confirm notice delivery and commercial decisions with a person.',
    },
    contracts,
  );
}
