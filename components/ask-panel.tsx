'use client';
import { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  MessageCircle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from './ui/input-group';
import { ModeBadge } from './status';
import { starterQuestions } from '@/lib/qa';
import { askResponseSchema, type Contract, type Mode, type AskResponse } from '@/lib/schema';
import { verifyAnswer } from '@/lib/citations';
type Turn = { question: string; answer?: AskResponse; mode?: Mode };
export function AskPanel({
  open,
  onOpenChange,
  contracts,
  mode,
  forceDemo,
  onMode,
  onDemo,
  onCitation,
  draft,
  onDraftConsumed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contracts: Contract[];
  mode: Mode;
  forceDemo: boolean;
  onMode: (m: Mode) => void;
  onDemo: () => void;
  onCitation: (id: string, quote: string) => void;
  draft: string;
  onDraftConsumed: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedQuestion, setFailedQuestion] = useState('');
  const latestTurn = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (() => {
      const turn = latestTurn.current;
      const scroll = turn?.closest<HTMLElement>('.chat-scroll');
      if (turn && scroll)
        scroll.scrollTo({
          top:
            scroll.scrollTop +
            turn.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top -
            15,
          behavior: 'instant',
        });
    })();
  }, [turns, busy]);
  useEffect(() => {
    if (open && draft) {
      const frame = requestAnimationFrame(() => {
        setQuestion(draft);
        onDraftConsumed();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [open, draft, onDraftConsumed]);
  async function ask(text: string, demo = forceDemo) {
    if (busy || !text.trim()) return;
    setError('');
    setQuestion('');
    setBusy(true);
    const previous = turns.slice(-5);
    setTurns((t) => [...t, { question: text }]);
    try {
      const history = previous.flatMap((t) => [
        { role: 'user', content: t.question },
        ...(t.answer ? [{ role: 'assistant', content: t.answer.summary }] : []),
      ]);
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, contracts, history, forceDemo: demo }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Could not answer that question.');
      const answer = verifyAnswer(askResponseSchema.parse(result.answer), contracts);
      onMode(result.mode);
      setTurns((t) =>
        t.map((turn, i) => (i === t.length - 1 ? { ...turn, answer, mode: result.mode } : turn)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that question.');
      setFailedQuestion(text);
      setTurns((t) => t.slice(0, -1));
      setQuestion(text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="ask-sheet">
        <SheetHeader>
          <div className="ask-heading">
            <span className="ask-icon">
              <MessageCircle />
            </span>
            <div>
              <SheetTitle>Ask the corpus</SheetTitle>
              <SheetDescription>Answers grounded in your contracts.</SheetDescription>
            </div>
          </div>
          <div className="ask-meta">
            <ModeBadge mode={mode} />
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setTurns([]);
                setError('');
              }}
              disabled={busy || !turns.length}
            >
              <RotateCcw data-icon="inline-start" />
              New conversation
            </Button>
          </div>
        </SheetHeader>
        <div className="chat-scroll">
          <details className="suggested" open={!turns.length}>
            <summary>{turns.length ? 'Suggested questions' : 'Try a prompt'}</summary>
            {starterQuestions.map((q) => (
              <button key={q} onClick={() => ask(q)} disabled={busy}>
                {q}
                <ChevronRight />
              </button>
            ))}
          </details>
          <div className="chat-turns" aria-live="polite">
            {turns.map((turn, i) => (
              <div key={i} ref={i === turns.length - 1 ? latestTurn : null} className="chat-turn">
                <p className="user-message">{turn.question}</p>
                {turn.answer ? (
                  <>
                    <p className="answer-prose">{turn.answer.summary}</p>
                    <div className="answer-matches">
                      {turn.answer.matches.map((match) => {
                        const c = contracts.find((c) => c.id === match.contractId);
                        return (
                          <article className="answer-match" key={match.contractId}>
                            <h3>{c?.extraction.supplier ?? c?.name}</h3>
                            <p>{match.reason}</p>
                            {match.citations.map((cite, j) =>
                              j === 0 ? (
                                <div className="answer-citation" key={j}>
                                  <blockquote>“{cite.quote}”</blockquote>
                                  <button onClick={() => onCitation(match.contractId, cite.quote)}>
                                    {cite.location}
                                    <ArrowUpRight />
                                  </button>
                                </div>
                              ) : null,
                            )}
                            {match.citations.length > 1 && (
                              <details className="additional-sources">
                                <summary>{match.citations.length - 1} supporting sources</summary>
                                {match.citations.slice(1).map((cite, j) => (
                                  <div className="answer-citation" key={j}>
                                    <blockquote>“{cite.quote}”</blockquote>
                                    <button
                                      onClick={() => onCitation(match.contractId, cite.quote)}
                                    >
                                      {cite.location}
                                      <ArrowUpRight />
                                    </button>
                                  </div>
                                ))}
                              </details>
                            )}
                          </article>
                        );
                      })}
                    </div>
                    <p className="answer-caveat">{turn.answer.caveat}</p>
                    <span className="turn-mode">
                      Answered in {turn.mode === 'demo' ? 'demo mode' : `${turn.mode} live mode`}
                    </span>
                  </>
                ) : (
                  <p className="thinking">
                    <Loader2 className="spin" />
                    Reading your portfolio…
                  </p>
                )}
              </div>
            ))}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <div className="error-actions">
                  <Button variant="outline" size="sm" onClick={() => ask(failedQuestion)}>
                    Try again
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onDemo();
                      ask(failedQuestion, true);
                    }}
                  >
                    Continue in demo mode
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <InputGroup>
            <InputGroupTextarea
              aria-label="Ask a question"
              placeholder="Ask about renewals, notice or liability…"
              maxLength={2000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
            />
            <InputGroupAddon align="block-end">
              <span>Enter to send · Shift + Enter for a new line</span>
              <InputGroupButton
                type="submit"
                size="icon-sm"
                disabled={busy || question.trim().length < 2 || !contracts.length}
                aria-label="Send question"
              >
                {busy ? <Loader2 className="spin" /> : <ArrowUp />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <p>Synthetic data. Human review before commercial action.</p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
