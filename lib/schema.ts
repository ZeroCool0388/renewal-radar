import { z } from 'zod';
export const fields = [
  'supplier',
  'category',
  'annualValueGBP',
  'currency',
  'startDate',
  'endDate',
  'termMonths',
  'noticePeriodDays',
  'autoRenew',
  'renewalTermMonths',
  'liabilityCapCustomer',
  'liabilityCapSupplier',
  'governingLaw',
  'terminationForConvenience',
  'hasDPA',
  'paymentTerms',
] as const;
export const fieldSchema = z.enum(fields);
export const evidenceSchema = z.object({
  field: fieldSchema,
  quote: z.string().min(4),
  location: z.string(),
  verified: z.boolean().optional(),
});
const date = z.iso.date().nullable();
export const extractionSchema = z.object({
  supplier: z.string().nullable(),
  category: z.string().nullable(),
  annualValueGBP: z.number().nonnegative().nullable(),
  currency: z.string().nullable(),
  startDate: date,
  endDate: date,
  termMonths: z.number().int().positive().nullable(),
  noticePeriodDays: z.number().int().nonnegative().nullable(),
  autoRenew: z.boolean().nullable(),
  renewalTermMonths: z.number().int().positive().nullable(),
  liabilityCapCustomer: z.string().nullable(),
  liabilityCapSupplier: z.string().nullable(),
  governingLaw: z.string().nullable(),
  terminationForConvenience: z.object({ allowed: z.boolean(), summary: z.string() }).nullable(),
  hasDPA: z.boolean().nullable(),
  paymentTerms: z.string().nullable(),
  warnings: z.array(z.object({ message: z.string(), field: fieldSchema })),
  evidence: z.array(evidenceSchema),
});
export const contractSchema = z.object({
  id: z.string().max(120),
  name: z.string().max(200),
  text: z.string().min(20).max(120000),
  origin: z.enum(['seed', 'upload']),
  extraction: extractionSchema,
  reviewed: z.boolean().optional(),
  note: z.string().max(5000).optional(),
});
export const sourceSchema = contractSchema.pick({ id: true, name: true, text: true, origin: true });
export const askResponseSchema = z.object({
  summary: z.string(),
  matches: z.array(
    z.object({
      contractId: z.string(),
      reason: z.string(),
      citations: z
        .array(z.object({ quote: z.string(), location: z.string() }))
        .min(1)
        .max(5),
    }),
  ),
  caveat: z.string(),
});
export const askRequestSchema = z.object({
  question: z.string().min(2).max(2000),
  contracts: z.array(contractSchema).min(1).max(25),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(5000) }))
    .max(12)
    .optional(),
  forceDemo: z.boolean().optional(),
});
export type Extraction = z.infer<typeof extractionSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type AskResponse = z.infer<typeof askResponseSchema>;
export type Field = (typeof fields)[number];
export type Mode = 'demo' | 'openai' | 'anthropic';
