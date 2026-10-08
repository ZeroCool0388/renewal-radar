'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileText,
  Info,
  TriangleAlert,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Button } from './ui/button';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { Field, FieldLabel, FieldDescription } from './ui/field';
import { Textarea } from './ui/textarea';
import { StatusPill } from './status';
import { fields, type Contract } from '@/lib/schema';
import { clauses, evidenceFor, verifyQuote } from '@/lib/citations';
import { deadlines } from '@/lib/dates';
import { displayValue, labels, money, exportContract, downloadMarkdown } from '@/lib/export';
export function ContractDetail({
  contract,
  initialQuote,
  onClose,
  onUpdate,
}: {
  contract: Contract | null;
  initialQuote?: string;
  onClose: () => void;
  onUpdate: (c: Contract) => void;
}) {
  const [highlight, setHighlight] = useState(initialQuote ?? '');
  const viewer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHighlight(initialQuote ?? ''));
    return () => cancelAnimationFrame(frame);
  }, [initialQuote, contract?.id]);
  useEffect(() => {
    if (highlight) {
      const frame = requestAnimationFrame(() =>
        (() => {
          const container = viewer.current;
          const target = container?.querySelector<HTMLElement>('[data-highlighted="true"]');
          if (container && target) {
            container.scrollTo({
              top:
                container.scrollTop +
                target.getBoundingClientRect().top -
                container.getBoundingClientRect().top -
                16,
              behavior: 'instant',
            });
            if (window.innerWidth <= 700) {
              const sheet = container.closest<HTMLElement>('.detail-sheet');
              const pane = container.closest<HTMLElement>('.document-pane');
              if (sheet && pane)
                sheet.scrollTo({
                  top:
                    sheet.scrollTop +
                    pane.getBoundingClientRect().top -
                    sheet.getBoundingClientRect().top,
                  behavior: 'instant',
                });
            }
          }
        })(),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [highlight, contract?.id]);
  if (!contract) return null;
  const c = contract;
  const d = deadlines(c.extraction);
  const document = clauses(c.text);
  return (
    <Sheet
      open={!!contract}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="detail-sheet">
        <SheetHeader>
          <Button variant="ghost" size="sm" className="back-button" onClick={onClose}>
            <ArrowLeft data-icon="inline-start" />
            Back to portfolio
          </Button>
          <div className="detail-heading">
            <div>
              <SheetTitle>{c.extraction.supplier ?? c.name}</SheetTitle>
              <SheetDescription>
                {c.extraction.category ?? 'Category not found'} <span>·</span>{' '}
                {money(c.extraction.annualValueGBP)} / year
              </SheetDescription>
            </div>
            <StatusPill status={d.status} />
          </div>
          <div className="detail-actions">
            <Button
              variant="outline"
              onClick={() => downloadMarkdown(`${c.id}-summary.md`, exportContract(c))}
            >
              <Download data-icon="inline-start" />
              Export summary
            </Button>
            <Button
              variant={c.reviewed ? 'secondary' : 'default'}
              onClick={() => onUpdate({ ...c, reviewed: !c.reviewed })}
            >
              <CheckCircle2 data-icon="inline-start" />
              {c.reviewed ? 'Reviewed' : 'Mark reviewed'}
            </Button>
          </div>
        </SheetHeader>
        <div className="detail-split">
          <section className="terms-pane" aria-labelledby="terms-heading">
            <h2 id="terms-heading">Key terms</h2>
            <dl className="terms-list">
              {fields.map((field) => {
                const e = evidenceFor(c.extraction, field);
                return (
                  <div className="term-row" key={field}>
                    <dt>{labels[field]}</dt>
                    <dd>{displayValue(c, field)}</dd>
                    {e ? (
                      <Button
                        variant="secondary"
                        size="xs"
                        aria-label={`Source for ${labels[field]}`}
                        onClick={() => setHighlight(e.quote)}
                      >
                        <FileText data-icon="inline-start" />
                        Source
                      </Button>
                    ) : (
                      <span className="unverified">No source</span>
                    )}
                  </div>
                );
              })}
            </dl>
            <Alert data-tone="warning">
              <TriangleAlert />
              <AlertTitle>Warnings & deadlines</AlertTitle>
              <AlertDescription>
                <ul>
                  {d.daysToNotice !== null && (
                    <li>
                      {d.daysToNotice < 0
                        ? `Last notice date passed ${Math.abs(d.daysToNotice)} days ago.${c.extraction.autoRenew ? ' Confirm whether valid notice was served.' : ''}`
                        : d.daysToNotice === 0
                          ? 'Last notice date is today.'
                          : `Last notice date is in ${d.daysToNotice} days.`}
                    </li>
                  )}
                  {c.extraction.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                  {!c.extraction.warnings.length && d.daysToNotice === null && (
                    <li>Some deadline terms are missing. Review the document.</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
            <Field className="note-field">
              <FieldLabel htmlFor="review-note">Add a note</FieldLabel>
              <Textarea
                id="review-note"
                placeholder="Add your review note here…"
                rows={3}
                maxLength={5000}
                value={c.note ?? ''}
                onChange={(e) => onUpdate({ ...c, note: e.target.value })}
              />
              <FieldDescription>
                Saved in this browser session. {c.note?.length ?? 0} / 5,000
              </FieldDescription>
            </Field>
          </section>
          <section className="document-pane" aria-labelledby="document-heading">
            <div className="document-header">
              <h2 id="document-heading">Contract document</h2>
              <span>
                <FileText />
                {c.name}
              </span>
            </div>
            <Alert>
              <Info />
              <AlertDescription>
                {c.origin === 'seed'
                  ? 'Synthetic contract. Dates resolve relative to today.'
                  : 'Uploaded text. Terms without verified evidence are withheld.'}
              </AlertDescription>
            </Alert>
            <div className="document-viewer" ref={viewer}>
              {document.map((clause) => {
                const active = !!highlight && verifyQuote(highlight, clause.body);
                const content = clause.body.replace(/^##\s+.+\n+/, '');
                return (
                  <article key={clause.id} id={`${c.id}-${clause.id}`} data-highlighted={active}>
                    <h3>{clause.heading}</h3>
                    {content.split(/\n\s*\n/).map((paragraph, i) => {
                      const rawIndex = paragraph.indexOf(highlight);
                      return (
                        <p key={i}>
                          {active && rawIndex >= 0 ? (
                            <>
                              {paragraph.slice(0, rawIndex)}
                              <mark>{highlight}</mark>
                              {paragraph.slice(rawIndex + highlight.length)}
                            </>
                          ) : (
                            paragraph.replace(/^#\s+/gm, '')
                          )}
                        </p>
                      );
                    })}
                    {active && (
                      <span className="highlight-label">
                        <ArrowUpRight />
                        Verified source clause
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
