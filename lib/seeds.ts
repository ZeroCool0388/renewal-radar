import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import index from '@/data/contracts/index.json';
import { resolveRelativeDates } from './dates';
import { extractionSchema, type Contract } from './schema';
import { verifyExtraction } from './citations';
export async function loadSeeds(today = new Date()): Promise<Contract[]> {
  return Promise.all(
    index.map(async (item) => {
      const raw = await readFile(
        path.join(process.cwd(), 'data/contracts', path.basename(item.filePath)),
        'utf8',
      );
      const extractionRaw = await readFile(
        path.join(process.cwd(), 'data/extractions', `${item.slug}.json`),
        'utf8',
      );
      const source = {
        id: item.slug,
        name: path.basename(item.filePath),
        text: resolveRelativeDates(raw, today),
        origin: 'seed' as const,
      };
      const extraction = extractionSchema.parse(
        JSON.parse(resolveRelativeDates(extractionRaw, today)),
      );
      return {
        ...source,
        extraction: verifyExtraction(extraction, source),
        reviewed: false,
        note: '',
      };
    }),
  );
}
