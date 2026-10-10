import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { runTask } from './provider';

const LOCAL_PROVIDER = 'file://evals/provider.ts';

const AssertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('equals'), path: z.string(), value: z.unknown() }),
  z.object({ type: z.literal('contains'), path: z.string(), value: z.string() }),
  z.object({ type: z.literal('not-contains'), path: z.string(), value: z.string() }),
  z.object({ type: z.literal('includes'), path: z.string(), value: z.unknown() }),
  z.object({ type: z.literal('gte'), path: z.string(), value: z.number() }),
]);

const ConfigSchema = z.object({
  description: z.string().min(1),
  sharing: z.literal(false),
  env: z.object({
    PROMPTFOO_DISABLE_TELEMETRY: z.literal('1'),
    PROMPTFOO_DISABLE_SHARING: z.literal('1'),
    PROMPTFOO_DISABLE_UPDATE: z.literal('1'),
  }),
  providers: z.tuple([z.literal(LOCAL_PROVIDER)]),
  prompts: z.array(z.string()).min(1),
  tests: z
    .array(
      z.object({
        description: z.string().min(1),
        vars: z.record(z.string(), z.unknown()),
        assert: z.array(AssertionSchema).min(1),
      }),
    )
    .min(20)
    .max(30),
});

type Assertion = z.infer<typeof AssertionSchema>;

function equal(actual: unknown, expected: unknown) {
  return Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
}

function getPath(value: unknown, path: string): unknown {
  const tokens = path.match(/[^.[\]]+|\[(?:\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/g);
  if (!tokens || tokens.join('').length === 0) throw new Error(`Invalid assertion path ${path}`);
  let current = value;
  for (const token of tokens) {
    if (current == null || typeof current !== 'object') return undefined;
    if (token.startsWith('[')) {
      const inner = token.slice(1, -1);
      const key =
        inner.startsWith('"') || inner.startsWith("'") ? inner.slice(1, -1) : Number(inner);
      current = (current as Record<string, unknown>)[key as never];
    } else {
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current;
}

function check(assertion: Assertion, output: Record<string, unknown>): string | null {
  const actual = getPath(output, assertion.path);
  if (assertion.type === 'equals') {
    return equal(actual, assertion.value)
      ? null
      : `${assertion.path}: expected ${JSON.stringify(assertion.value)}, got ${JSON.stringify(actual)}`;
  }
  if (assertion.type === 'contains' || assertion.type === 'not-contains') {
    if (typeof actual !== 'string')
      return `${assertion.path}: expected a string, got ${JSON.stringify(actual)}`;
    const found = actual.includes(assertion.value);
    if (assertion.type === 'contains' && !found)
      return `${assertion.path}: did not contain ${JSON.stringify(assertion.value)}`;
    if (assertion.type === 'not-contains' && found)
      return `${assertion.path}: contained ${JSON.stringify(assertion.value)}`;
    return null;
  }
  if (assertion.type === 'includes') {
    return Array.isArray(actual) && actual.some((item) => equal(item, assertion.value))
      ? null
      : `${assertion.path}: did not include ${JSON.stringify(assertion.value)}`;
  }
  if (typeof actual !== 'number')
    return `${assertion.path}: expected a number, got ${JSON.stringify(actual)}`;
  return actual >= assertion.value
    ? null
    : `${assertion.path}: expected >= ${assertion.value}, got ${actual}`;
}

function show(value: unknown) {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\s+/g, ' ').slice(0, 500);
}

const configUrl = new URL('./promptfooconfig.json', import.meta.url);
const providerUrl = new URL('./provider.ts', import.meta.url);
const configText = await readFile(configUrl, 'utf8');
const providerText = await readFile(providerUrl, 'utf8');
const banned =
  /generateObject|extractLive|createOpenAI|createAnthropic|api\.openai\.com|api\.anthropic\.com|promptfoo\.dev/;
if (banned.test(configText) || banned.test(providerText)) {
  console.error(
    'Eval pack must stay on recorded fixtures and local rules. No model client is allowed.',
  );
  process.exit(1);
}

const config = ConfigSchema.parse(JSON.parse(configText));
for (const [key, value] of Object.entries(config.env)) process.env[key] = value;

const descriptions = new Set<string>();
for (const test of config.tests) {
  if (descriptions.has(test.description)) {
    console.error(`Duplicate eval description: ${test.description}`);
    process.exit(1);
  }
  descriptions.add(test.description);
}

console.log(config.description);
console.log(`provider: ${config.providers[0]}`);
console.log(`cases: ${config.tests.length}`);
console.log('sharing: false');
console.log('telemetry: disabled');

const started = performance.now();
let failed = 0;
let modelCalls = 0;
for (const test of config.tests) {
  const caseStarted = performance.now();
  const problems: string[] = [];
  try {
    const output = await runTask(test.vars);
    if (output.calledModel !== false || output.networkRequests !== 0) {
      modelCalls += 1;
      problems.push('model call detected');
    }
    for (const assertion of test.assert) {
      const problem = check(assertion, output);
      if (problem) problems.push(problem);
    }
  } catch (error) {
    problems.push(show(error));
  }
  const elapsed = Math.round(performance.now() - caseStarted);
  if (problems.length) {
    failed += 1;
    console.log(`FAIL  ${test.description}  (${elapsed} ms)`);
    for (const problem of problems) console.log(`      ${problem}`);
  } else {
    console.log(`PASS  ${test.description}  (${elapsed} ms)`);
  }
}

const suiteLatencyMs = performance.now() - started;
const passed = config.tests.length - failed;
const passRate = `${((passed / config.tests.length) * 100).toFixed(1)}%`;
console.log('');
console.log(`${passed}/${config.tests.length} passed`);
console.log(`pass_rate: ${passRate}`);
console.log(`suite_latency_ms: ${suiteLatencyMs.toFixed(1)}`);
console.log(`model_calls: ${modelCalls}`);
console.log(`cost_gbp: ${modelCalls === 0 ? 0 : 'unmeasured'}`);
if (failed > 0 || modelCalls > 0) process.exit(1);
