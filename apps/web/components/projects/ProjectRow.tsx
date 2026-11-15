'use client';

import { MAX_PROJECT_NAME_LENGTH, type Project } from '@askwell/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '../ui';
import { cleanProjectName, deleteProject, installHref, renameProject } from './api';

export type RowMode = 'view' | 'rename' | 'confirm-delete';

export interface ProjectRowViewProps {
  project: Project;
  mode: RowMode;
  draft: string;
  busy: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onStartDelete: () => void;
  onConfirmDelete: () => void;
  onCancel: () => void;
}

/** One project row. Presentational: ProjectRow holds the state. */
export function ProjectRowView({
  project,
  mode,
  draft,
  busy,
  error,
  onDraftChange,
  onStartRename,
  onSubmitRename,
  onStartDelete,
  onConfirmDelete,
  onCancel,
}: ProjectRowViewProps) {
  const inputId = `rename-${project.id}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmitRename();
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0" data-project-id={project.id}>
      {mode === 'rename' ? (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">
            New name for {project.name}
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel();
            }}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            autoFocus
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-glass px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !cleanProjectName(draft)}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              href={installHref(project.id)}
              className="block truncate font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {project.name}
            </Link>
            <p className="text-xs text-fg-muted">
              {project.messagesUsed} / {project.messageLimit} messages this month
            </p>
          </div>
          {mode === 'confirm-delete' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-muted">Delete this project? This can&apos;t be undone.</span>
              <Button onClick={onConfirmDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
              <Button variant="secondary" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onStartRename}>
                Rename
              </Button>
              <Button variant="secondary" onClick={onStartDelete}>
                Delete
              </Button>
            </div>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function ProjectRow({
  project,
  onRenamed,
  onDeleted,
}: {
  project: Project;
  onRenamed: (project: Project) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<RowMode>('view');
  const [draft, setDraft] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitRename() {
    const clean = cleanProjectName(draft);
    if (!clean || busy) return;
    if (clean === project.name) {
      setMode('view');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await renameProject(project.id, clean);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMode('view');
    onRenamed(result.data);
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteProject(project.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDeleted(project.id);
  }

  return (
    <ProjectRowView
      project={project}
      mode={mode}
      draft={draft}
      busy={busy}
      error={error}
      onDraftChange={setDraft}
      onStartRename={() => {
        setDraft(project.name);
        setError(null);
        setMode('rename');
      }}
      onSubmitRename={submitRename}
      onStartDelete={() => {
        setError(null);
        setMode('confirm-delete');
      }}
      onConfirmDelete={confirmDelete}
      onCancel={() => {
        setError(null);
        setMode('view');
      }}
    />
  );
}
