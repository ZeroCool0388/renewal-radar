# Synthetic contract corpus

Nine fictional agreements, approximately 2,800-3,000 words each, are held under `contracts/`. Every Markdown begins with `SYNTHETIC DEMO DATA. Fictional company. Not real.` No company, customer, contact or transaction represents a real entity. Dates and amounts are invented.

## Rolling date convention

Tokens are resolved when the server loads the seed corpus, before extraction validation or citation verification. The same transformation is applied to the document and its extraction JSON so quoted dates always match the visible source.

| Token                  | Resolution                                                |
| ---------------------- | --------------------------------------------------------- |
| `{{TODAY+55}}`         | 55 calendar days after load day                           |
| `{{TODAY-8}}`          | 8 calendar days before load day                           |
| `{{START:55:12}}`      | 12 calendar months before the date 55 days after load day |
| `{{Q1:03-12}}`         | Next occurrence of 12 March, including today              |
| `{{Q1START:03-12:12}}` | 12 months before that March date                          |

Calendar-month subtraction clamps month ends. Q1 dates roll independently: after BrightPath's February expiry but before Helix's March expiry, BrightPath moves to next year's Q1 and Helix remains in the current Q1. The Q1 answer filters the actual resolved documents, rather than promising the same supplier list all year.

Northwind ends in 55 days with 90 days' notice, and Sterling ends in 22 days with 30 days' notice. Their notice deadlines have passed, so they show **Notice missed – will auto-renew**. Orbit ends in 57 days with 45 days' notice (deadline in 12 days); NovaPay ends in 75 days with 60 days' notice (deadline in 15 days). These show **Notice window open**. The relative dates guarantee at least two open windows and one automatic renewal within 30 days on every demo day. These four contracts are traps and need attention. At the initial October 2026 demo date, four agreements ending in 90 days have £420,000 annualised spend.

Uploads never resolve tokens or move dates. They are ordinary fixed-date documents. The committed five-page `03-helix-pharma-sow.pdf` is deliberately dated 2026-03-12 to 2027-03-12. It exercises real PDF text extraction, page anchors and uploads; it is not included again in the seed index.

## Files

- `contracts/index.json`: portfolio index and sector tags.
- `contracts/*.md`: full source documents.
- `extractions/*.json`: extraction templates, all non-null fields carry verbatim source quotes.
- `qa-fixtures.json`: starter intent map, source-backed example matches and quotation templates. Runtime selection, totals and date predicates are recomputed, including after uploads.

`npm run seed` regenerates Markdown, JSON and Q&A fixtures from the synthetic definitions in `scripts/generate-seeds.ts`. The PDF can be regenerated with `scripts/generate-pdf.py` using Python and ReportLab; neither tool is needed to run or deploy the app.

The source verifier normalises whitespace, case and quote typography and then requires a continuous match. It deliberately does not use permissive edit-distance matching, which could accept changed monetary amounts. Quote existence does not prove that a model interpreted the clause correctly: human review remains necessary.
