'use client';
import { useState } from 'react';
import { FileUp, FileText, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Field, FieldLabel } from './ui/field';
import { contractSchema, type Contract, type Mode } from '@/lib/schema';
import { z } from 'zod';
export function UploadDialog({
  open,
  onOpenChange,
  forceDemo,
  onImported,
  onDemo,
  capacity,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  forceDemo: boolean;
  onImported: (contracts: Contract[], mode: Mode) => void;
  onDemo: () => void;
  capacity: number;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  function choose(selected: File[]) {
    setError('');
    if (selected.some((f) => !/\.(md|txt|pdf)$/i.test(f.name))) {
      setError('Choose .md, .txt or text-based .pdf contracts.');
      return;
    }
    if (selected.length > capacity) {
      setError(`This demo supports 25 contracts. You can add ${capacity} more in this session.`);
      return;
    }
    if (selected.reduce((s, f) => s + f.size, 0) > 4 * 1024 * 1024 || selected.length > 10) {
      setError('Choose up to 10 files with a combined size smaller than 4 MB.');
      return;
    }
    setFiles(selected);
  }
  async function upload(demo = forceDemo) {
    if (!files.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      files.forEach((f) => body.append('files', f));
      body.append('forceDemo', String(demo));
      const response = await fetch('/api/extract', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Upload failed.');
      const contracts = z.array(contractSchema).parse(result.contracts);
      onImported(contracts, result.mode);
      setFiles([]);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="upload-dialog">
        <DialogHeader>
          <DialogTitle>Import contracts</DialogTitle>
          <DialogDescription>
            Add synthetic agreements to your portfolio. Terms are extracted and checked against the
            source.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="contract-files" className="sr-only">
            Choose contract files
          </FieldLabel>
          <label
            className="dropzone"
            data-drag={drag}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              choose(Array.from(e.dataTransfer.files));
            }}
            htmlFor="contract-files"
          >
            <FileUp />
            <strong>Drop contracts here, or browse files</strong>
            <span>Markdown, text or text-based PDF · 4 MB total per upload</span>
            <input
              id="contract-files"
              type="file"
              multiple
              accept=".md,.txt,.pdf"
              onChange={(e) => choose(Array.from(e.target.files ?? []))}
              disabled={busy}
            />
          </label>
        </Field>
        {files.length > 0 && (
          <ul className="upload-files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <FileText />
                <span>
                  {f.name}
                  <small>{Math.ceil(f.size / 1024)} KB</small>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => i !== j))}
                  disabled={busy}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="upload-note">
          Scanned PDFs need OCR and are not supported. Uploads and review notes stay in this browser
          session; no database is used.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {!forceDemo && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onDemo();
                    upload(true);
                  }}
                >
                  Continue in demo mode
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!files.length || busy} onClick={() => upload()}>
            {busy ? (
              <Loader2 className="spin" data-icon="inline-start" />
            ) : (
              <FileUp data-icon="inline-start" />
            )}
            {busy
              ? 'Extracting terms…'
              : `Import ${files.length || ''} contract${files.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
