import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { addDays, format } from 'date-fns';
import { loadSeeds } from '@/lib/seeds';
import { resolveRelativeDates, deadlines, upcomingQ1 } from '@/lib/dates';
import { verifyQuote, verifyExtraction, verifyAnswer } from '@/lib/citations';
import { extractionSchema, askResponseSchema } from '@/lib/schema';
import { ruleExtract } from '@/lib/extractor';
import { demoAsk, starterQuestions } from '@/lib/qa';
import { parsePDF } from '@/lib/pdf';
import { exportPortfolio, exportContract } from '@/lib/export';
const today = new Date(2026, 9, 8, 12);
const seeds = await loadSeeds(today);
const sterling = seeds.find((c) => c.id === 'sterling-fintech')!;
function endIn(days: number, notice = 30, autoRenew = true) {
  return {
    ...sterling.extraction,
    endDate: format(addDays(today, days), 'yyyy-MM-dd'),
    noticePeriodDays: notice,
    autoRenew,
  };
}
describe('relative-date resolver', () => {
  it('resolves offsets, initial term and upcoming Q1', () => {
    expect(
      resolveRelativeDates(
        '{{TODAY+22}} {{TODAY-8}} {{START:22:12}} {{Q1:03-12}} {{Q1START:03-12:12}}',
        today,
      ),
    ).toBe('2026-10-30 2026-09-30 2025-10-30 2027-03-12 2026-03-12');
  });
  it('handles leap year and month-end clamping', () => {
    expect(resolveRelativeDates('{{TODAY+1}} {{START:0:1}}', new Date(2028, 1, 28))).toBe(
      '2028-02-29 2028-01-28',
    );
    expect(resolveRelativeDates('{{START:0:1}}', new Date(2028, 2, 31))).toBe('2028-02-29');
  });
  it('rolls past Q1 dates individually without producing expired seeds', () => {
    expect(resolveRelativeDates('{{Q1:02-20}} {{Q1:03-12}}', new Date(2027, 2, 1))).toBe(
      '2028-02-20 2027-03-12',
    );
  });
  it('keeps literal upload dates untouched', () =>
    expect(resolveRelativeDates('End date: 2027-02-01', today)).toBe('End date: 2027-02-01'));
  it('selects the upcoming Q1', () => {
    expect(upcomingQ1(today).year).toBe(2027);
    expect(upcomingQ1(new Date(2027, 1, 4)).year).toBe(2027);
  });
});
describe('deadline engine', () => {
  it('subtracts notice days from expiry, ignoring hours', () =>
    expect(deadlines(endIn(22), today)).toMatchObject({
      noticeWindowOpensOn: '2026-09-30',
      daysToNotice: -8,
      daysToRenew: 22,
      status: 'Auto-renewing soon',
      trap: true,
    }));
  it('gives expiry priority over imminent renewal', () =>
    expect(deadlines(endIn(-1), today).status).toBe('Expired'));
  it('keeps end date today live and urgent', () =>
    expect(deadlines(endIn(0), today).status).toBe('Auto-renewing soon'));
  it('includes the 30-day urgency boundary', () => {
    expect(deadlines(endIn(30), today).status).toBe('Auto-renewing soon');
    expect(deadlines(endIn(31, 10), today).status).toBe('OK');
  });
  it('opens notice status at deadline day', () => {
    expect(deadlines(endIn(90, 90), today).status).toBe('Notice window open');
    expect(deadlines(endIn(91, 90), today).status).toBe('OK');
  });
  it('marks traps when the notice date is less than 30 days away', () => {
    expect(deadlines(endIn(60, 30), today).trap).toBe(false);
    expect(deadlines(endIn(59, 30), today).trap).toBe(true);
  });
  it('does not call fixed expiries auto-renew traps', () => {
    expect(deadlines(endIn(20, 30, false), today).status).toBe('Notice window open');
    expect(deadlines(endIn(20, 30, false), today).trap).toBe(false);
  });
  it('does not invent deadlines for missing or invalid dates', () => {
    expect(deadlines({ ...endIn(20), endDate: null }, today).status).toBe('Needs review');
    expect(deadlines({ ...endIn(20), endDate: 'not-a-date' }, today).daysToRenew).toBeNull();
  });
  it('does not silently assume unknown auto-renewal is false', () =>
    expect(deadlines({ ...endIn(50), autoRenew: null }, today).status).toBe('Needs review'));
  it.each([
    new Date(2026, 0, 1),
    new Date(2027, 2, 31),
    new Date(2028, 1, 29),
    new Date(2032, 11, 31),
  ])('stays interesting on reasonable demo dates %s', async (date) => {
    const portfolio = await loadSeeds(date);
    const statuses = portfolio.map((c) => deadlines(c.extraction, date).status);
    expect(statuses.filter((s) => s === 'Notice window open').length).toBeGreaterThanOrEqual(2);
    expect(statuses.filter((s) => s === 'Auto-renewing soon').length).toBeGreaterThanOrEqual(1);
  });
});
describe('citation verifier and schemas', () => {
  it('tolerates quote typography, whitespace and case', () =>
    expect(verifyQuote('CUSTOMER’S  annual\nfee', "Customer's annual fee")).toBe(true));
  it('rejects invented numbers and ellipses', () => {
    expect(verifyQuote('Fees: GBP 9000', 'Fees: GBP 8000')).toBe(false);
    expect(verifyQuote('Fees ... 8000', 'Fees are GBP 8000')).toBe(false);
  });
  it('withholds fields with fabricated evidence', () => {
    const bad = {
      ...sterling.extraction,
      evidence: sterling.extraction.evidence.map((e) =>
        e.field === 'annualValueGBP' ? { ...e, quote: 'Annual contract value: GBP 9999999.' } : e,
      ),
    };
    const verified = verifyExtraction(bad, sterling);
    expect(verified.annualValueGBP).toBeNull();
    expect(verified.warnings.some((w) => w.field === 'annualValueGBP')).toBe(true);
    expect(verified.evidence.find((e) => e.field === 'annualValueGBP')?.verified).toBe(false);
  });
  it('withholds answer prose when a citation fails', () => {
    const a = {
      summary: 'A fabricated claim',
      matches: [
        {
          contractId: sterling.id,
          reason: 'invented',
          citations: [{ quote: 'Not a real source quote', location: '9' }],
        },
      ],
      caveat: '',
    };
    expect(verifyAnswer(a, seeds).matches).toHaveLength(0);
    expect(verifyAnswer(a, seeds).summary).not.toContain('A fabricated claim');
  });
  it('rejects invalid calendar dates and negative commercial values', () => {
    expect(
      extractionSchema.safeParse({ ...sterling.extraction, endDate: '2026-02-31' }).success,
    ).toBe(false);
    expect(extractionSchema.safeParse({ ...sterling.extraction, annualValueGBP: -1 }).success).toBe(
      false,
    );
  });
  it('has validated evidence for every non-null fixture field', () => {
    for (const c of seeds) {
      expect(extractionSchema.safeParse(c.extraction).success).toBe(true);
      expect(c.extraction.evidence.every((e) => e.verified)).toBe(true);
      for (const [field, value] of Object.entries(c.extraction)) {
        if (!['evidence', 'warnings'].includes(field) && value !== null)
          expect(
            c.extraction.evidence.some((e) => e.field === field && e.verified),
            `${c.id}.${field}`,
          ).toBe(true);
      }
    }
  });
});
describe('demo extraction and corpus answers', () => {
  it('re-extracts every seeded document with the same terms', () => {
    for (const c of seeds) {
      const extraction = ruleExtract(c);
      for (const key of [
        'supplier',
        'endDate',
        'startDate',
        'noticePeriodDays',
        'autoRenew',
        'annualValueGBP',
        'liabilityCapCustomer',
        'hasDPA',
      ] as const)
        expect(extraction[key], `${c.id}.${key}`).toEqual(c.extraction[key]);
    }
  });
  it('leaves unknown terms null rather than interpreting absence', () => {
    const source = {
      id: 'minimal',
      name: 'minimal.txt',
      text: 'Supplier: Fictional Test Ltd.\nThis draft has no agreed commercial terms.',
      origin: 'upload' as const,
    };
    expect(ruleExtract(source)).toMatchObject({
      supplier: 'Fictional Test Ltd',
      endDate: null,
      autoRenew: null,
      hasDPA: null,
      annualValueGBP: null,
    });
  });
  it('extracts common natural renewal language', () => {
    const source = {
      id: 'natural',
      name: 'natural.txt',
      text: 'Supplier: Fictional Services Ltd.\nThis Agreement will renew automatically for successive 12-month terms with 45 days written notice.\nPayment is Net 30 days.',
      origin: 'upload' as const,
    };
    expect(ruleExtract(source)).toMatchObject({
      autoRenew: true,
      renewalTermMonths: 12,
      noticePeriodDays: 45,
      paymentTerms: 'Net 30 days',
    });
  });
  it.each(starterQuestions)('answers starter question with verified citations: %s', (q) => {
    const a = demoAsk(q, seeds, [], today);
    expect(askResponseSchema.safeParse(a).success).toBe(true);
    expect(a.matches.length).toBeGreaterThan(0);
    for (const m of a.matches)
      for (const cite of m.citations)
        expect(verifyQuote(cite.quote, seeds.find((c) => c.id === m.contractId)!.text)).toBe(true);
  });
  it('computes actual 90-day spend', () =>
    expect(demoAsk(starterQuestions[4], seeds, [], today).summary).toContain('£420,000'));
  it('separates customer and supplier liability', () => {
    expect(demoAsk(starterQuestions[2], seeds, [], today).matches.map((m) => m.contractId)).toEqual(
      expect.arrayContaining(['apex-biolabs', 'lumen-analytics', 'novapay-gateway']),
    );
    expect(
      demoAsk('Where is supplier liability uncapped?', seeds, [], today).matches.some(
        (m) => m.contractId === 'orbit-hris',
      ),
    ).toBe(true);
  });
  it('provides a useful unsupported-question fallback', () =>
    expect(demoAsk('How much is a spaceship?', seeds, [], today).summary).toContain(
      'suggested questions',
    ));
  it('keeps previous user intent on a follow-up', () =>
    expect(
      demoAsk(
        'And only English law?',
        seeds,
        [{ role: 'user', content: starterQuestions[0] }],
        today,
      ).matches.every(
        (m) =>
          seeds.find((c) => c.id === m.contractId)?.extraction.governingLaw === 'England and Wales',
      ),
    ).toBe(true));
  it('narrows a supplier follow-up and recalculates its spend', () => {
    const answer = demoAsk(
      'What about Northwind?',
      seeds,
      [{ role: 'user', content: starterQuestions[4] }],
      today,
    );
    expect(answer.matches.map((match) => match.contractId)).toEqual(['northwind-logistics']);
    expect(answer.summary).toContain('£96,000');
    expect(answer.summary).toContain('across 1 agreements');
  });
  it('parses the committed PDF with page anchors and extracts terms', async () => {
    const { text, totalPages } = await parsePDF(
      new Uint8Array(readFileSync('data/contracts/03-helix-pharma-sow.pdf')),
    );
    expect(totalPages).toBe(5);
    expect(text).toContain('## Page 1');
    const e = ruleExtract({ id: 'pdf', name: 'helix.pdf', text, origin: 'upload' });
    expect(e).toMatchObject({
      supplier: 'Helix Pharma UK Ltd',
      annualValueGBP: 160000,
      endDate: '2027-03-12',
      autoRenew: false,
    });
    expect(e.evidence.every((e) => e.verified)).toBe(true);
  });
  it('exports portable Markdown with evidence and synthetic footer', () => {
    expect(exportPortfolio(seeds)).toContain('SYNTHETIC DEMO DATA. Fictional company. Not real.');
    expect(exportPortfolio(seeds)).toContain('| Supplier |');
    expect(exportContract(sterling)).toContain('Source: 04-sterling-fintech-msa.md');
  });
});
