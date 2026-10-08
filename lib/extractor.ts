import { extractionSchema, fields, type Extraction, type Source, type Field } from './schema';
import { findLocation, verifyExtraction } from './citations';
export function ruleExtract(source: Source): Extraction {
  const result: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f, null]));
  const evidence: Extraction['evidence'] = [];
  const text = source.text;
  const validDate = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
  };
  function read(
    field: Field,
    patterns: RegExp[],
    convert: (s: string, m: RegExpMatchArray) => unknown = (s) => s.trim(),
  ) {
    for (const pattern of patterns) {
      const m = text.match(pattern);
      if (m) {
        const value = convert(m[1], m);
        if (value !== null) {
          result[field] = value;
          evidence.push({ field, quote: m[0], location: findLocation(m[0], text) });
        }
        break;
      }
    }
  }
  const line = (name: string) =>
    new RegExp(`${name}:\\s*([^\\n]+?)(?:\\.(?=\\s|$)|(?=\\n|$))`, 'i');
  read('supplier', [
    line('Supplier'),
    /(?:between|provided by)\s+([A-Z][\w &'-]+(?:Ltd|Limited|LLC))/,
  ]);
  read('category', [line('Service category'), line('Category')]);
  read(
    'annualValueGBP',
    [
      /Annual (?:contract value|fees?|value|subscription)(?:\s*(?:are|is))?\s*[:=]?\s*(?:GBP|£)\s*([\d,]+(?:\.\d{2})?)/i,
    ],
    (s) => Number(s.replace(/,/g, '')),
  );
  read(
    'currency',
    [
      /Contract currency:\s*(GBP|USD|EUR)/i,
      /(?:Annual (?:contract value|fees?|value|subscription)(?:\s*(?:are|is))?\s*[:=]?\s*)(GBP|£)/i,
    ],
    (s) => (s === '£' ? 'GBP' : s.toUpperCase()),
  );
  read('startDate', [/(?:Start|Effective|Commencement) date:\s*(\d{4}-\d{2}-\d{2})/i], (s) =>
    validDate(s),
  );
  read('endDate', [/(?:End|Expiry|Expiration) date:\s*(\d{4}-\d{2}-\d{2})/i], (s) => validDate(s));
  read('termMonths', [/Initial term:\s*(\d+)\s*months/i], Number);
  read(
    'noticePeriodDays',
    [
      /Notice period:\s*(\d+)\s*(?:calendar\s*)?days/i,
      /(\d+)[-\s]days?['’]?\s*(?:prior\s*)?(?:written\s*)?notice/i,
    ],
    Number,
  );
  read(
    'autoRenew',
    [
      /Auto[- ]renewal:\s*(Yes|No)/i,
      /(?:shall|will)\s+(not renew automatically|renew automatically)/i,
    ],
    (s) => /^(yes|renew automatically)$/i.test(s),
  );
  read(
    'renewalTermMonths',
    [/Renewal term:\s*(\d+)\s*months/i, /successive\s+(\d+)[- ]month\s*(?:terms|periods)/i],
    Number,
  );
  read('liabilityCapCustomer', [line('Customer liability cap')]);
  read('liabilityCapSupplier', [line('Supplier liability cap')]);
  read('governingLaw', [
    line('Governing law'),
    /governed by (?:the )?laws? of ([A-Za-z ]+?)(?:\.|\n)/i,
  ]);
  read(
    'terminationForConvenience',
    [
      /Termination for convenience:\s*(Yes\.[^\n]+|No\.[^\n]+)/i,
      /(The Customer may terminate[^\n.]*for convenience[^\n.]*\.)/i,
      /(Neither party may terminate[^\n.]*convenience[^\n.]*\.)/i,
    ],
    (s) => ({ allowed: /^yes|^the customer may/i.test(s), summary: s }),
  );
  read('hasDPA', [/Data processing addendum:\s*(Yes|No)/i], (s) => /^yes$/i.test(s));
  read('paymentTerms', [line('Payment terms'), /(Net\s*\d+(?:\s*days)?)/i]);
  const warnings: Extraction['warnings'] = [];
  if (
    result.terminationForConvenience &&
    !(result.terminationForConvenience as { allowed: boolean }).allowed
  )
    warnings.push({
      field: 'terminationForConvenience',
      message: 'No termination for convenience during the initial term.',
    });
  for (const f of ['liabilityCapCustomer', 'liabilityCapSupplier'] as const)
    if (/uncapped/i.test(String(result[f])))
      warnings.push({
        field: f,
        message: `${f === 'liabilityCapCustomer' ? 'Customer' : 'Supplier'} liability includes an uncapped exception.`,
      });
  return verifyExtraction(extractionSchema.parse({ ...result, warnings, evidence }), source);
}
