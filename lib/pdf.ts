import { extractText, getDocumentProxy } from 'unpdf';
export class PDFInputError extends Error {}
export async function parsePDF(bytes: Uint8Array) {
  try {
    const pdf = await getDocumentProxy(bytes);
    try {
      const { text, totalPages } = await extractText(pdf, { mergePages: false });
      const result = text.map((page, i) => `## Page ${i + 1}\n\n${page}`).join('\n\n');
      if (result.replace(/## Page \d+/g, '').trim().length < 40)
        throw new PDFInputError(
          'This PDF has no readable text. Upload a text-based PDF, Markdown or text file. Scanned PDFs need OCR, which is outside this demo.',
        );
      return { text: result, totalPages };
    } finally {
      await pdf.loadingTask.destroy();
    }
  } catch (error) {
    if (error instanceof PDFInputError) throw error;
    throw new PDFInputError(
      'This PDF could not be read. Choose an unencrypted, text-based PDF or upload a Markdown or text version.',
    );
  }
}
