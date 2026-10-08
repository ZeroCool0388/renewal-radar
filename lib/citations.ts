import type { Extraction, Source, AskResponse, Field } from './schema';
import { fields } from './schema';
export function normalize(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
// Conservative normalized matching: tolerate typography/whitespace, never invented words or numbers.
export function verifyQuote(quote: string, text: string) {
  const q = normalize(quote);
  return q.length >= 4 && normalize(text).includes(q);
}
export function clauses(text: string) {
  const chunks = text.split(/(?=^##\s)/m);
  return chunks.map((body, i) => ({
    id: `clause-${i}`,
    heading: body.match(/^##\s+(.+)/)?.[1] ?? 'Contract overview',
    body,
  }));
}
export function findLocation(quote: string, text: string) {
  return clauses(text).find((c) => verifyQuote(quote, c.body))?.heading ?? 'Document';
}
export function verifyExtraction(e: Extraction, source: Source): Extraction {
  const evidence = e.evidence.map((item) => ({
    ...item,
    verified: verifyQuote(item.quote, source.text),
    location: findLocation(item.quote, source.text),
  }));
  const result = {
    ...e,
    evidence,
    warnings: e.warnings.filter((w) => evidence.some((i) => i.field === w.field && i.verified)),
  };
  for (const field of fields) {
    if (result[field] !== null && !evidence.some((i) => i.field === field && i.verified)) {
      Object.assign(result, { [field]: null });
      result.warnings.push({
        field,
        message: `${field}: no verified source. Confirm this term manually.`,
      });
    }
  }
  return result;
}
export function evidenceFor(e: Extraction, field: Field) {
  const found = e.evidence.find((i) => i.field === field && i.verified);
  if (!found && field === 'renewalTermMonths' && e.autoRenew === false)
    return e.evidence.find((i) => i.field === 'autoRenew' && i.verified);
  return found;
}
export function verifyAnswer(answer: AskResponse, sources: Source[]): AskResponse {
  const matches = answer.matches
    .filter((m) =>
      sources.some(
        (s) =>
          s.id === m.contractId &&
          m.citations.length > 0 &&
          m.citations.every((c) => verifyQuote(c.quote, s.text)),
      ),
    )
    .map((m) => ({
      ...m,
      citations: m.citations.map((c) => ({
        ...c,
        location: findLocation(c.quote, sources.find((s) => s.id === m.contractId)!.text),
      })),
    }));
  if (matches.length !== answer.matches.length)
    return {
      summary:
        'Some answer evidence could not be verified. Only verified source matches are shown; ask a narrower question or review the documents.',
      matches,
      caveat: 'Unverified claims were withheld.',
    };
  if (answer.matches.length === 0)
    return {
      summary:
        'No verified source matches for this question. Try a supplier name or one of the suggested questions.',
      matches: [],
      caveat: answer.caveat,
    };
  return { ...answer, matches };
}
