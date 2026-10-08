import { z } from 'zod';
import { sourceSchema, type Source } from '@/lib/schema';
import { extractSource } from '@/lib/llm';
import { parsePDF, PDFInputError } from '@/lib/pdf';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    let sources: Source[] = [];
    let forceDemo = false;
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      forceDemo = form.get('forceDemo') === 'true';
      const files = form.getAll('files');
      if (
        files.reduce<number>((sum, f) => sum + (f instanceof File ? f.size : 0), 0) >
        4 * 1024 * 1024
      )
        return Response.json(
          { error: 'The total upload must be smaller than 4 MB.' },
          { status: 413 },
        );
      if (!files.length || files.length > 10)
        return Response.json({ error: 'Choose between 1 and 10 files.' }, { status: 400 });
      for (const file of files) {
        if (!(file instanceof File) || !/\.(md|txt|pdf)$/i.test(file.name))
          return Response.json(
            { error: 'Supported formats: .md, .txt and text-based .pdf.' },
            { status: 400 },
          );
        if (file.size > 4 * 1024 * 1024)
          return Response.json({ error: 'Each file must be smaller than 4 MB.' }, { status: 413 });
        const text = /\.pdf$/i.test(file.name)
          ? (await parsePDF(new Uint8Array(await file.arrayBuffer()))).text
          : await file.text();
        sources.push(
          sourceSchema.parse({
            id: `upload-${crypto.randomUUID()}`,
            name: file.name,
            text,
            origin: 'upload',
          }),
        );
      }
    } else {
      const body = z
        .object({
          sources: z.array(sourceSchema).min(1).max(25),
          forceDemo: z.boolean().optional(),
        })
        .parse(await request.json());
      sources = body.sources;
      forceDemo = body.forceDemo ?? false;
    }
    // Limit parallel provider work to three to avoid a nine-request burst.
    const contracts = [];
    let mode = 'demo';
    for (let i = 0; i < sources.length; i += 3) {
      const results = await Promise.all(
        sources.slice(i, i + 3).map(async (source) => {
          const result = await extractSource(source, forceDemo);
          return { ...source, ...result };
        }),
      );
      for (const r of results) {
        mode = r.mode;
        contracts.push({
          id: r.id,
          name: r.name,
          text: r.text,
          origin: r.origin,
          extraction: r.extraction,
          reviewed: false,
          note: '',
        });
      }
    }
    return Response.json({ contracts, mode }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PDFInputError)
      return Response.json({ error: error.message }, { status: 422 });
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: 'Invalid contract input. Check file length, date formats and the request schema.',
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return Response.json({ error: 'The request body is not valid JSON.' }, { status: 400 });
    return Response.json(
      {
        error:
          'Extraction could not complete. Check your provider configuration or continue in demo mode.',
        canUseDemo: true,
      },
      { status: 502 },
    );
  }
}
