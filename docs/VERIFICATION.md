# Verification and design review

Verified locally on 8 October 2026. Default mode: no API key and no `.env` required.

## Completed checks

| Check                 | Result                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install and launch    | Installed from the initial empty project; development and production servers both start without an env file.                                                                                                                                                                |
| Production build      | `npm run build` passes, including static favicon and Open Graph image.                                                                                                                                                                                                      |
| Static checks         | `npm run lint` and `npm run typecheck` pass.                                                                                                                                                                                                                                |
| Unit/API tests        | 51 pass: deadline boundaries, leap years, rolling seeds, conservative quote matching, invalid requests, PDF parsing, uploads, demo Q&A, provider selection and failure handling.                                                                                            |
| Browser checks        | Six Chromium checks pass: core flow and export, five prompts and follow-up, Markdown/PDF uploads and re-extraction, saved reviews, keyboard/mobile/dark mode, command palette and accessibility.                                                                            |
| Production endpoints  | Committed PDF uploaded to the production build: HTTP 200, Helix terms extracted in Demo mode. Production Ask: HTTP 200, one source-cited Q1 match. Open Graph PNG: HTTP 200.                                                                                                |
| Responsive review     | In-app browser inspected at 1440, 1024, 768 and 390 px. No page-width overflow; the table deliberately scrolls horizontally. Mobile risks repeat beside supplier names.                                                                                                     |
| Source navigation     | Apex Customer liability and Helix termination citations open the correct document clause with a verified quote highlight. Mobile citation navigation moves to the stacked document pane.                                                                                    |
| Accessibility         | Automated axe WCAG A/AA checks pass for the desktop dashboard and mobile filter sheet. Manual keyboard row movement, command palette, focus rings and mobile source navigation checked. This is not a comprehensive accessibility certification.                            |
| Runtime dependencies  | `npm audit --omit=dev`: zero vulnerabilities. Full audit reports five high development-only findings in the ESLint → fast-glob → micromatch → braces chain. The suggested fix downgrades the Next ESLint configuration to 14.x; it was not applied to this Next 16 project. |
| PDF visual review     | All five pages rendered and inspected: selectable text, clean headings, no missing glyphs, clipping or footer collisions.                                                                                                                                                   |
| Public source hygiene | Only synthetic contracts; blank env template; original brief and all env files excluded from Git and deployment.                                                                                                                                                            |

## What remains unverified

- Real authenticated OpenAI extraction, upload and Q&A calls.
- Real authenticated Anthropic extraction, upload and Q&A calls.
- A Vercel preview or production deployment. The local Vercel CLI has no active login.
- Physical mobile devices and Safari. Responsive checks used Chromium.

Both provider adapters have mocked-generation coverage, including truthful mode selection and citation rejection. This demonstrates wiring, not live service availability. No credentials were created or added. The live URL remains a clearly labelled placeholder.

The public source is published at [ZeroCool0388/02-contract-lifecycle-copilot](https://github.com/ZeroCool0388/02-contract-lifecycle-copilot), authored as Steve Grady using the GitHub noreply address. A fresh public clone passed `npm install`, `npm run build` and `npm run dev` with populated portfolio HTML and no env file. Vercel's dashboard redirects to its login page; no existing browser session was available.

## Screenshots

Captured from the working in-app browser, not mock data rendered as an interface. Desktop comparison viewport: **1505 × 1045**, matching the concept dimensions. The mobile image is a full-page capture at **390 px** wide.

- [Dashboard](dashboard.png)
- [Apex detail and highlighted Customer liability](contract-detail.png)
- [Cited Q1 answer](ask-corpus.png)
- [Mobile dashboard](mobile.png)

## Fidelity ledger

The concepts and latest implementation screenshots were inspected at their original dimensions. All visual controls are real HTML/React controls. No concept image is used as a production UI background.

| Comparison point        | Final result / intentional difference                                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall hierarchy       | Preserved white dashboard, cool slate rail, heading/actions, four KPIs, six-month timeline and contract table. The rail is 250 px rather than the concept's approximate 269 px.                                                                                        |
| Typography and figures  | Geist, strong dark headings and tabular money/day counts preserve the calm operations feel. Table labels and supplier names remain readable without large decorative type.                                                                                             |
| Colour and affordances  | Teal actions, subtle borders and 8–10 px radii retained. Teal darkened to `#00777c` so small white button labels pass contrast checks.                                                                                                                                 |
| Risk communication      | Red Sterling and amber Northwind/NovaPay rows match the intended first impression. Status icons supplement colour. Actual data produces four traps, three contracts needing attention and £1.012m annual spend; concept totals were illustrative.                      |
| Table density           | Six primary columns retained. Extra start/category/notice/liability columns appear through “More terms”; all fields also appear in detail. The ninth contract and an additional renewal-horizon filter make the page slightly taller.                                  |
| Contract detail         | 50/50 terms/document layout, source chips, warnings and review/export actions retained. Implemented as an accessible large sheet with independently scrolling panes. Highlights use the actual source paragraph, including Customer IP indemnity.                      |
| Corpus chat             | Right-side drawer, short prose, matching-contract cards and source links retained. Five starters collapse after the first turn; supporting quotes use disclosures to keep the answer readable. Three genuine Q1 matches replace the concept's invented example counts. |
| Responsive behaviour    | Desktop rail becomes a filter sheet; KPIs become a two-by-two grid; detail panes stack. Status pills repeat under mobile suppliers so risks stay visible before horizontal scrolling.                                                                                  |
| Scope and data fidelity | Dashboard concept navigation is authoritative. Extra report pages, account avatars and invented reviewed-by details in state concepts were omitted because the brief specifies no accounts. Dates, values and answers always derive from the verified portfolio.       |

The generated concepts contain illustrative legal wording and dates. They are visual references only; contract facts and the actual demo are authoritative. No known visual blocker remains. Live provider and hosted deployment verification remain the explicit acceptance boundaries above.

Above-the-fold copy review: brand, navigation, overview title, subtitle, Export summary, Upload contract, Re-extract and Ask the corpus match the dashboard concept. Added “Renewing within”, “More terms” and KPI explanations support required filtering and field access. “9 contracts”, “4 traps”, “£1.01m” and all dates intentionally replace illustrative concept values. Risk icons replace colour-only dots. Unrelated state-concept navigation and reviewer identity are excluded. These are documented scope/data/accessibility differences, not inert placeholders.
