import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSeeds } from '@/lib/seeds';
import { POST as extract } from '@/app/api/extract/route';
import { POST as ask } from '@/app/api/ask/route';
import { configuredMode, extractSource, askCorpus } from '@/lib/llm';
import { demoAsk } from '@/lib/qa';
import { generateObject } from 'ai';
vi.mock('ai', () => ({ generateObject: vi.fn() }));
const contracts = await loadSeeds();
const source = contracts[0];
const json = (data: unknown) =>
  new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe('API routes', () => {
  it('extracts JSON sources in demo mode', async () => {
    const response = await extract(json({ sources: [source], forceDemo: true }));
    expect(response.status).toBe(200);
    const r = await response.json();
    expect(r.mode).toBe('demo');
    expect(r.contracts[0].extraction.supplier).toBe('Northwind Logistics Ltd');
  });
  it('rejects malformed input', async () => {
    expect((await extract(json({ sources: [] }))).status).toBe(400);
    expect((await ask(json({ question: '?', contracts: [] }))).status).toBe(400);
  });
  it('returns verified answers', async () => {
    const response = await ask(
      json({ question: 'Which suppliers can we exit in Q1?', contracts, forceDemo: true }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).answer.matches.length).toBeGreaterThan(0);
  });
  it('accepts Markdown upload', async () => {
    const form = new FormData();
    form.append('forceDemo', 'true');
    form.append(
      'files',
      new File(
        [
          'Supplier: Fictional Upload Ltd.\nAnnual value: GBP 12000.\nEnd date: 2027-04-20.\nAuto-renewal: No.\nNotice period: 30 days.',
        ],
        'fictional.md',
      ),
    );
    const response = await extract(
      new Request('http://localhost/api/extract', { method: 'POST', body: form }),
    );
    const r = await response.json();
    expect(response.status).toBe(200);
    expect(r.contracts[0].extraction.annualValueGBP).toBe(12000);
    expect(r.contracts[0].origin).toBe('upload');
  });
  it('accepts PDF upload with page evidence', async () => {
    const form = new FormData();
    form.append('forceDemo', 'true');
    form.append(
      'files',
      new File([readFileSync('data/contracts/03-helix-pharma-sow.pdf')], 'helix.pdf', {
        type: 'application/pdf',
      }),
    );
    const response = await extract(
      new Request('http://localhost/api/extract', { method: 'POST', body: form }),
    );
    const r = await response.json();
    expect(response.status).toBe(200);
    expect(
      r.contracts[0].extraction.evidence.some((e: { location: string }) =>
        e.location.startsWith('Page'),
      ),
    ).toBe(true);
  });
  it('returns an actionable error for corrupt PDF', async () => {
    const form = new FormData();
    form.append('files', new File(['not a pdf'], 'corrupt.pdf'));
    const response = await extract(
      new Request('http://localhost/api/extract', { method: 'POST', body: form }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('PDF could not be read');
  });
  it('rejects unsupported and oversized uploads', async () => {
    const form = new FormData();
    form.append('files', new File(['No document'], 'bad.exe'));
    expect(
      (await extract(new Request('http://localhost/api/extract', { method: 'POST', body: form })))
        .status,
    ).toBe(400);
    const large = new FormData();
    large.append('files', new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.txt'));
    expect(
      (await extract(new Request('http://localhost/api/extract', { method: 'POST', body: large })))
        .status,
    ).toBe(413);
  });
});
describe('provider adapter wiring (mocked generation, no network calls)', () => {
  it('defaults to demo without keys', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('LLM_PROVIDER', '');
    expect(configuredMode()).toBe('demo');
  });
  it('rejects an invalid provider', () => {
    vi.stubEnv('LLM_PROVIDER', 'unknown');
    expect(() => configuredMode()).toThrow('Invalid LLM_PROVIDER');
  });
  it.each(['openai', 'anthropic'] as const)(
    'routes live extraction and Q&A through %s',
    async (provider) => {
      // Test-only sentinel: generateObject is mocked and no credential is transmitted.
      vi.stubEnv('LLM_PROVIDER', provider);
      vi.stubEnv(
        provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY',
        'unit-test-sentinel',
      );
      vi.mocked(generateObject).mockResolvedValueOnce({ object: source.extraction } as never);
      const r = await extractSource(source);
      expect(r.mode).toBe(provider);
      expect(r.extraction.supplier).toBe(source.extraction.supplier);
      expect(generateObject).toHaveBeenCalledOnce();
      const opts = vi.mocked(generateObject).mock.calls[0][0];
      expect((opts.model as { provider: string }).provider).toContain(provider);
      const a = demoAsk('Which suppliers can we exit in Q1?', contracts);
      vi.mocked(generateObject).mockResolvedValueOnce({ object: a } as never);
      expect((await askCorpus('Which suppliers can we exit in Q1?', contracts)).mode).toBe(
        provider,
      );
    },
  );
  it('surfaces provider failure as a retryable API response', async () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'unit-test-sentinel');
    vi.mocked(generateObject).mockRejectedValue(new Error('Upstream failed'));
    const response = await extract(json({ sources: [source] }));
    expect(response.status).toBe(502);
    expect((await response.json()).canUseDemo).toBe(true);
  });
});
