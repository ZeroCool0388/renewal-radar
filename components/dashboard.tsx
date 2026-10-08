'use client';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from 'next-themes';
import {
  AlertTriangle,
  Download,
  FileUp,
  Loader2,
  MessageCircle,
  Moon,
  Plus,
  Radar,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './ui/command';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from './ui/empty';
import { Metrics } from './metrics';
import { Timeline } from './timeline';
import { ContractTable } from './contract-table';
import { FilterRail, emptyFilters, type Filters } from './filters';
import { ContractDetail } from './contract-detail';
import { AskPanel } from './ask-panel';
import { UploadDialog } from './upload-dialog';
import { ModeBadge } from './status';
import { deadlines } from '@/lib/dates';
import { verifyExtraction } from '@/lib/citations';
import { starterQuestions } from '@/lib/qa';
import { contractSchema, type Contract, type Mode } from '@/lib/schema';
import { exportPortfolio, downloadMarkdown } from '@/lib/export';
const storageKey = 'renewal-radar-session-v1';
export function Dashboard({
  initialContracts,
  liveConfigured,
  asOf,
}: {
  initialContracts: Contract[];
  liveConfigured: boolean;
  asOf: string;
}) {
  const [contracts, setContracts] = useState(initialContracts);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<{ id: string; quote?: string } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [questionDraft, setQuestionDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('demo');
  const [forceDemo, setForceDemo] = useState(false);
  const [ready, setReady] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const initialized = useRef(false);
  const reextract = useCallback(async (items: Contract[], demo = false) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: items.map(({ id, name, text, origin }) => ({ id, name, text, origin })),
          forceDemo: demo,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Extraction failed.');
      const next = z
        .array(contractSchema)
        .parse(result.contracts)
        .map((c) => ({
          ...c,
          reviewed: items.find((i) => i.id === c.id)?.reviewed ?? false,
          note: items.find((i) => i.id === c.id)?.note ?? '',
        }));
      setContracts(next);
      setMode(result.mode);
      toast.success(`${next.length} contracts re-extracted with verified evidence.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    const frame = requestAnimationFrame(() => {
      initialized.current = true;
      let combined = initialContracts;
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const stored = z
            .object({
              uploads: z.array(contractSchema),
              reviews: z.record(z.string(), z.object({ reviewed: z.boolean(), note: z.string() })),
            })
            .parse(JSON.parse(raw));
          combined = [
            ...initialContracts.map((c) => ({ ...c, ...stored.reviews[c.id] })),
            ...stored.uploads.map((c) => ({ ...c, extraction: verifyExtraction(c.extraction, c) })),
          ];
          setContracts(combined);
        }
      } catch {
        sessionStorage.removeItem(storageKey);
        toast.info('The sample portfolio was restored.');
      }
      setReady(true);
      if (liveConfigured) void reextract(combined);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialContracts, liveConfigured, reextract]);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          uploads: contracts.filter((c) => c.origin === 'upload'),
          reviews: Object.fromEntries(
            contracts.map((c) => [c.id, { reviewed: c.reviewed ?? false, note: c.note ?? '' }]),
          ),
        }),
      );
    } catch {
      toast.warning(
        'Browser storage is full. Keep this tab open; new uploads and notes may not survive a reload.',
      );
    }
  }, [contracts, ready]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const consumeDraft = useCallback(() => setQuestionDraft(''), []);
  const openContract = useCallback((id: string, quote?: string) => {
    setAskOpen(false);
    setSelected({ id, quote });
  }, []);
  const filtered = contracts.filter((c) => {
    const e = c.extraction,
      d = deadlines(e);
    return (
      (!filters.search ||
        `${e.supplier} ${e.category} ${c.name}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())) &&
      (filters.category === 'all' || e.category === filters.category) &&
      (filters.autoRenew === 'all' || e.autoRenew === (filters.autoRenew === 'yes')) &&
      (filters.status === 'all' || d.status === filters.status) &&
      (filters.value === 'all' ||
        (e.annualValueGBP !== null &&
          (filters.value === 'under' ? e.annualValueGBP < 100000 : e.annualValueGBP >= 100000))) &&
      (filters.notice === 'all' ||
        (e.noticePeriodDays !== null &&
          (filters.notice === 'short' ? e.noticePeriodDays < 60 : e.noticePeriodDays >= 60))) &&
      (filters.horizon === 'all' ||
        (d.daysToRenew !== null &&
          d.daysToRenew >= 0 &&
          d.daysToRenew <= Number(filters.horizon))) &&
      (filters.view === 'all' || (filters.view === 'reviewed' ? c.reviewed : d.status !== 'OK'))
    );
  });
  const attention = contracts.filter((c) => deadlines(c.extraction).status !== 'OK').length;
  const filterContent = (
    <FilterRail
      filters={filters}
      setFilters={setFilters}
      contracts={contracts}
      attention={attention}
    />
  );
  const continueDemo = () => {
    setForceDemo(true);
    setMode('demo');
    setError('');
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/" className="brand">
          <Radar aria-hidden="true" />
          <span>Renewal Radar</span>
        </Link>
        <nav aria-label="Main navigation">
          <button
            className="active"
            onClick={() => {
              setFilters(emptyFilters);
              setAskOpen(false);
            }}
          >
            Portfolio
          </button>
          <button onClick={() => setAskOpen(true)}>Ask the corpus</button>
          <button onClick={() => setUploadOpen(true)}>Import contracts</button>
        </nav>
        <div className="header-tools">
          <ModeBadge mode={mode} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search portfolio and questions"
            onClick={() => setCommandOpen(true)}
          >
            <Search />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <div className="workspace">
        <aside className="filter-rail" aria-label="Portfolio filters">
          {filterContent}
        </aside>
        <main id="main" className="dashboard-main">
          <div className="page-heading">
            <div>
              <h1>Portfolio overview</h1>
              <p>Stay ahead of renewals. Keep your options open.</p>
            </div>
            <div className="page-actions">
              <Button
                variant="outline"
                onClick={() =>
                  downloadMarkdown('renewal-radar-portfolio.md', exportPortfolio(filtered))
                }
              >
                <Download data-icon="inline-start" />
                <span>Export summary</span>
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                <Plus data-icon="inline-start" />
                Upload contract
              </Button>
            </div>
          </div>
          <div className="mobile-filter-bar">
            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal data-icon="inline-start" />
              Filters{filtered.length !== contracts.length ? ` (${filtered.length})` : ''}
            </Button>
            <Button variant="outline" onClick={() => setAskOpen(true)}>
              <MessageCircle data-icon="inline-start" />
              Ask the corpus
            </Button>
          </div>
          <Metrics contracts={filtered} />
          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Extraction needs attention</AlertTitle>
              <AlertDescription>
                {error}
                <div className="error-actions">
                  <Button variant="outline" onClick={() => reextract(contracts, forceDemo)}>
                    Try again
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      continueDemo();
                      reextract(contracts, true);
                    }}
                  >
                    Continue in demo mode
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {contracts.length ? (
            <>
              <Timeline contracts={filtered} onOpen={openContract} />
              <section className="table-panel" aria-label="Contract portfolio">
                <div className="table-heading">
                  <h2>
                    {filters.view === 'attention'
                      ? 'Needs attention'
                      : filters.view === 'reviewed'
                        ? 'Reviewed contracts'
                        : 'All contracts'}
                    <span className="count-pill">{filtered.length}</span>
                  </h2>
                  <div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => reextract(contracts, forceDemo)}
                    >
                      {busy ? (
                        <Loader2 className="spin" data-icon="inline-start" />
                      ) : (
                        <RefreshCw data-icon="inline-start" />
                      )}
                      {busy ? 'Extracting…' : 'Re-extract'}
                    </Button>
                    <Button onClick={() => setAskOpen(true)}>
                      <MessageCircle data-icon="inline-start" />
                      Ask the corpus
                    </Button>
                  </div>
                </div>
                <ContractTable
                  contracts={filtered}
                  onOpen={openContract}
                  onReset={() => setFilters(emptyFilters)}
                />
              </section>
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No contracts yet</EmptyTitle>
                <EmptyDescription>
                  Load the sample portfolio or upload a Markdown, text or PDF agreement.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setContracts(initialContracts)}>
                  Load sample portfolio
                </Button>
                <Button variant="outline" onClick={() => setUploadOpen(true)}>
                  <FileUp data-icon="inline-start" />
                  Upload contracts
                </Button>
              </EmptyContent>
            </Empty>
          )}
          <div className="page-footer">
            <span>Deadlines calculated as of {asOf} · GBP annualised values</span>
            <span>
              Renewal Radar <span> / </span> Synthetic portfolio
            </span>
          </div>
        </main>
      </div>
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="left" className="filter-sheet">
          <SheetHeader>
            <SheetTitle>Portfolio filters</SheetTitle>
            <SheetDescription>Refine your renewal view.</SheetDescription>
          </SheetHeader>
          {filterContent}
          <Button className="apply-filters" onClick={() => setFilterOpen(false)}>
            Show {filtered.length} contracts
          </Button>
        </SheetContent>
      </Sheet>
      <ContractDetail
        contract={contracts.find((c) => c.id === selected?.id) ?? null}
        initialQuote={selected?.quote}
        onClose={() => setSelected(null)}
        onUpdate={(c) => setContracts((all) => all.map((item) => (item.id === c.id ? c : item)))}
      />
      <AskPanel
        draft={questionDraft}
        onDraftConsumed={consumeDraft}
        open={askOpen}
        onOpenChange={setAskOpen}
        contracts={contracts}
        mode={mode}
        forceDemo={forceDemo}
        onMode={setMode}
        onDemo={continueDemo}
        onCitation={openContract}
      />
      <UploadDialog
        capacity={Math.max(0, 25 - contracts.length)}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        forceDemo={forceDemo}
        onDemo={continueDemo}
        onImported={(newContracts, newMode) => {
          setContracts((all) => [...all, ...newContracts]);
          setMode(newMode);
          toast.success(
            `${newContracts.length} contract${newContracts.length === 1 ? '' : 's'} added to the portfolio.`,
          );
        }}
      />
      <CommandDialog
        title="Search Renewal Radar"
        description="Open a contract or ask a question"
        open={commandOpen}
        onOpenChange={setCommandOpen}
      >
        <Command>
          <CommandInput placeholder="Find a supplier or question…" />
          <CommandList>
            <CommandEmpty>No matching supplier or question.</CommandEmpty>
            <CommandGroup heading="Contracts">
              {contracts.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.extraction.supplier ?? c.name}
                  onSelect={() => {
                    setCommandOpen(false);
                    openContract(c.id);
                  }}
                >
                  {c.extraction.supplier ?? c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Ask the corpus">
              {starterQuestions.map((q) => (
                <CommandItem
                  key={q}
                  onSelect={() => {
                    setCommandOpen(false);
                    setQuestionDraft(q);
                    setAskOpen(true);
                  }}
                >
                  {q}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
