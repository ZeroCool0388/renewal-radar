import { z } from 'zod';
import { askRequestSchema } from '@/lib/schema';
import { askCorpus } from '@/lib/llm';
import { verifyExtraction } from '@/lib/citations';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = askRequestSchema.parse(await request.json());
    const contracts = body.contracts.map((c) => ({
      ...c,
      extraction: verifyExtraction(c.extraction, c),
    }));
    return Response.json(await askCorpus(body.question, contracts, body.history, body.forceDemo), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return Response.json({ error: 'The request body is not valid JSON.' }, { status: 400 });
    if (error instanceof z.ZodError)
      return Response.json(
        { error: 'Enter a question and load at least one valid contract.' },
        { status: 400 },
      );
    return Response.json(
      {
        error: 'The answer could not complete. Try again or continue in demo mode.',
        canUseDemo: true,
      },
      { status: 502 },
    );
  }
}
