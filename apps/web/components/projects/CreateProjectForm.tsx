'use client';

import { MAX_PROJECT_NAME_LENGTH, type Project } from '@askwell/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../ui';
import { cleanProjectName, createProject } from './api';

export function CreateProjectForm({ onCreated }: { onCreated: (project: Project) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanProjectName(name);
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const result = await createProject(clean);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName('');
    onCreated(result.data);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-2" aria-label="Create a project">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="new-project-name" className="sr-only">
          Project name
        </label>
        <input
          id="new-project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Locked while creating, so a later edit can't be cleared on success.
          disabled={busy}
          maxLength={MAX_PROJECT_NAME_LENGTH}
          placeholder="Project name, e.g. My store"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-glass px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        />
        <Button type="submit" disabled={busy || !cleanProjectName(name)}>
          {busy ? 'Creating…' : 'Create project'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-left text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
