# Renewal Radar implementation plan

1. Scaffold strict Next.js / React / TypeScript with Tailwind and accessible dialog primitives.
2. Create nine substantial synthetic agreements, extraction fixtures and a text PDF.
3. Implement date resolution, deterministic statuses, conservative citation verification and tested schemas.
4. Implement the dashboard, filters, sorting, timeline and source-linked split detail view.
5. Add demo/live extraction and Q&A server routes, session context, uploads and Markdown export.
6. Verify boundary cases, all starter questions, PDF/Markdown ingestion, reviewed notes, desktop/mobile, build/lint/types, and provider wiring.
7. Document architecture, demo narrative and deployment. Do not claim credential-backed or remote deployment checks without evidence.

## Design system

Reference: dashboard-concept.png plus detail/chat state concepts. True white main surface, cool #f8fafc rail/header, #0f172a text, #64748b muted, #e2e8f0 borders, #00858a teal. Risk #b45309 amber / #b91c1c red. Radius 8-10px. Sans: Geist with system fallback. H1 28px/700, body 14px/1.5, labels 12px/600, money tabular. Lucide outline icons, 1.8px stroke, 16-20px. No raster assets needed in production interface. Dense six-column table with further terms available via column selector/detail; supporting fields must stay accessible. Left rail 220px, content padding 28px. Four KPI cards, one timeline band, one table region. At small widths collapse rail to accessible filter drawer, retain horizontally scrollable table, stack detail terms/document. Required copy and controls follow the brief; values and dates always come from actual resolved data.
