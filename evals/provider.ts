import { z } from 'zod';
import { verifyAnswer, verifyExtraction, verifyQuote } from '../lib/citations';
import { deadlines } from '../lib/dates';
import { configuredMode, extractSource } from '../lib/llm';
import { demoAsk } from '../lib/qa';
import { loadSeeds } from '../lib/seeds';
import type { Contract, Extraction, Mode } from '../lib/schema';
import { networkRequestCount } from './block-network';

// Recorded fixtures and local rules only. This module never calls a model.
for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER', 'LLM_MODEL']) {
  delete process.env[key];
}

const evalToday = new Date(2026, 9, 8, 12, 0, 0);
const clock = '2026-10-08';
const envKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER', 'LLM_MODEL'] as const;

const SYNTHETIC = 'SYNTHETIC DEMO DATA. Fictional company. Not real.';

function base(): Record<string, unknown> {
  return { calledModel: false, networkRequests: networkRequestCount(), costGbp: 0 };
}

function withEnv<T>(env: Record<string, string>, run: () => T): T {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if ((envKeys as readonly string[]).includes(key) && value) process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const key of envKeys) {
      const prior = previous.get(key);
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  }
}

function guardDemo(): Record<string, unknown> | null {
  const mode = configuredMode();
  if (mode === 'demo') return null;
  return { blockedLive: true, mode, error: null, clock, ...base() };
}

function present(extraction: Extraction, extra: Record<string, unknown> = {}) {
  const timing = deadlines(extraction, evalToday);
  return {
    blockedLive: false,
    mode: 'demo' as const,
    error: null,
    clock,
    supplier: extraction.supplier,
    category: extraction.category,
    annualValueGBP: extraction.annualValueGBP,
    currency: extraction.currency,
    startDate: extraction.startDate,
    endDate: extraction.endDate,
    termMonths: extraction.termMonths,
    noticePeriodDays: extraction.noticePeriodDays,
    autoRenew: extraction.autoRenew,
    renewalTermMonths: extraction.renewalTermMonths,
    liabilityCapCustomer: extraction.liabilityCapCustomer,
    liabilityCapSupplier: extraction.liabilityCapSupplier,
    governingLaw: extraction.governingLaw,
    terminationAllowed: extraction.terminationForConvenience?.allowed ?? null,
    terminationSummary: extraction.terminationForConvenience?.summary ?? null,
    hasDPA: extraction.hasDPA,
    paymentTerms: extraction.paymentTerms,
    noticeWindowOpensOn: timing.noticeWindowOpensOn,
    daysToNotice: timing.daysToNotice,
    daysToRenew: timing.daysToRenew,
    status: timing.status,
    trap: timing.trap,
    evidenceCount: extraction.evidence.length,
    evidenceVerified: extraction.evidence.every((item) => item.verified === true),
    warningMessages: extraction.warnings.map((warning) => warning.message).join('\n'),
    ...extra,
    ...base(),
  };
}

let seedsPromise: Promise<Contract[]> | null = null;

function portfolio() {
  return (seedsPromise ??= loadSeeds(evalToday));
}

async function contract(slug: string) {
  const found = (await portfolio()).find((item) => item.id === slug);
  if (!found) throw new Error(`Unknown agreement: ${slug}`);
  return found;
}

async function portfolioTask(): Promise<Record<string, unknown>> {
  const blocked = guardDemo();
  if (blocked) return blocked;
  const contracts = await portfolio();
  return {
    blockedLive: false,
    mode: configuredMode(),
    error: null,
    clock,
    count: contracts.length,
    ids: contracts.map((item) => item.id),
    allSynthetic: contracts.every((item) => item.text.includes(SYNTHETIC)),
    allEvidenceVerified: contracts.every(
      (item) =>
        item.extraction.evidence.length > 0 &&
        item.extraction.evidence.every((evidence) => evidence.verified === true),
    ),
    ...base(),
  };
}

async function recordedTask(slug: string): Promise<Record<string, unknown>> {
  const blocked = guardDemo();
  if (blocked) return blocked;
  const item = await contract(slug);
  return present(item.extraction, { synthetic: item.text.includes(SYNTHETIC) });
}

async function rulesTask(vars: {
  slug?: string;
  text?: string;
  name?: string;
}): Promise<Record<string, unknown>> {
  const blocked = guardDemo();
  if (blocked) return blocked;
  if (Boolean(vars.slug) === Boolean(vars.text))
    throw new Error('Provide a seed slug or upload text.');
  const source = vars.slug
    ? await contract(vars.slug)
    : {
        id: 'eval-upload',
        name: vars.name ?? 'upload.txt',
        text: vars.text ?? '',
        origin: 'upload' as const,
      };
  const { extraction, mode } = await extractSource(
    { id: source.id, name: source.name, text: source.text, origin: 'upload' },
    true,
  );
  if (mode !== 'demo') return { blockedLive: true, mode, error: null, clock, ...base() };
  return present(extraction, { synthetic: source.text.includes(SYNTHETIC) });
}

async function askTask(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<Record<string, unknown>> {
  const blocked = guardDemo();
  if (blocked) return blocked;
  const contracts = await portfolio();
  const answer = demoAsk(question, contracts, history, evalToday);
  const quotes = answer.matches.flatMap((match) =>
    match.citations.map((citation) => citation.quote),
  );
  const locations = answer.matches.flatMap((match) =>
    match.citations.map((citation) => citation.location),
  );
  const citationsVerified = answer.matches.every((match) =>
    match.citations.every((citation) => {
      const source = contracts.find((item) => item.id === match.contractId);
      return Boolean(source && verifyQuote(citation.quote, source.text));
    }),
  );
  return {
    blockedLive: false,
    mode: 'demo',
    error: null,
    clock,
    summary: answer.summary,
    caveat: answer.caveat,
    matchIds: answer.matches.map((match) => match.contractId),
    matchCount: answer.matches.length,
    quotes: quotes.join('\n'),
    locations: locations.join('\n'),
    citationsVerified,
    ...base(),
  };
}

async function citationsTask(): Promise<Record<string, unknown>> {
  const blocked = guardDemo();
  if (blocked) return blocked;
  const contracts = await portfolio();
  const sterling = await contract('sterling-fintech');
  const tampered = verifyExtraction(
    {
      ...sterling.extraction,
      evidence: sterling.extraction.evidence.map((item) =>
        item.field === 'annualValueGBP'
          ? { ...item, quote: 'Annual contract value: GBP 9999999.' }
          : item,
      ),
    },
    sterling,
  );
  const withheld = verifyAnswer(
    {
      summary: 'A fabricated claim',
      matches: [
        {
          contractId: sterling.id,
          reason: 'invented',
          citations: [{ quote: 'Not a real source quote', location: '9' }],
        },
      ],
      caveat: '',
    },
    contracts,
  );
  return {
    blockedLive: false,
    mode: 'demo',
    error: null,
    clock,
    tamperedAnnualValue: tampered.annualValueGBP,
    tamperWarning:
      tampered.warnings.find((warning) => warning.field === 'annualValueGBP')?.message ?? '',
    typographyVerified: verifyQuote('CUSTOMER’S  annual\nfee', "Customer's annual fee"),
    changedAmountVerified: verifyQuote('Fees: GBP 9000', 'Fees: GBP 8000'),
    ellipsisVerified: verifyQuote('Fees ... 8000', 'Fees are GBP 8000'),
    withheldSummary: withheld.summary,
    withheldMatchCount: withheld.matches.length,
    ...base(),
  };
}

function modeTask(env: Record<string, string>): Record<string, unknown> {
  return withEnv(env, () => {
    try {
      const mode: Mode = configuredMode();
      if (mode === 'openai' || mode === 'anthropic')
        return { blockedLive: true, mode, error: null, clock, ...base() };
      return { blockedLive: false, mode, error: null, clock, ...base() };
    } catch (error) {
      return {
        blockedLive: false,
        mode: null,
        error: error instanceof Error ? error.message : String(error),
        clock,
        ...base(),
      };
    }
  });
}

const AskSchema = z.object({
  task: z.literal('ask'),
  question: z.string().min(2),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional(),
});
const RulesSchema = z.object({
  task: z.literal('rules'),
  slug: z.string().optional(),
  text: z.string().optional(),
  name: z.string().optional(),
});
const RecordedSchema = z.object({ task: z.literal('recorded'), slug: z.string().min(1) });
const ModeSchema = z.object({
  task: z.literal('mode'),
  env: z.record(z.string(), z.string()),
});
const TaskSchema = z.object({ task: z.enum(['portfolio', 'citations']) });

export async function runTask(vars: unknown): Promise<Record<string, unknown>> {
  try {
    const task = z.object({ task: z.string() }).parse(vars).task;
    switch (task) {
      case 'portfolio':
        TaskSchema.parse(vars);
        return await portfolioTask();
      case 'recorded':
        return await recordedTask(RecordedSchema.parse(vars).slug);
      case 'rules':
        return await rulesTask(RulesSchema.parse(vars));
      case 'ask': {
        const parsed = AskSchema.parse(vars);
        return await askTask(parsed.question, parsed.history);
      }
      case 'citations':
        TaskSchema.parse(vars);
        return await citationsTask();
      case 'mode':
        return modeTask(ModeSchema.parse(vars).env);
      default:
        throw new Error(`Unknown eval task: ${task}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        error.issues
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join('; '),
      );
    }
    throw error;
  }
}
