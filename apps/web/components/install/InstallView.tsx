import Link from 'next/link';
import { EmptyState, ErrorState, GlassPanel } from '../ui';
import { CopyButton } from './CopyButton';

export type InstallState =
  | { kind: 'ready'; projectName: string; snippet: string }
  | { kind: 'no-projects' }
  | { kind: 'not-found' }
  | { kind: 'no-origin' };

export const STEPS = [
  'Paste the tag into your site, just before </body>.',
  'Reload the page.',
  'Click the chat button in the corner to try it.',
] as const;

const linkClass =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function ProjectsLink({ children }: { children: string }) {
  return (
    <Link href="/dashboard" className={linkClass}>
      {children}
    </Link>
  );
}

/** The Install page body for each state. The snippet is rendered as text, never HTML. */
export function InstallView({ state }: { state: InstallState }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Install</h1>
      {state.kind === 'no-projects' ? (
        <EmptyState
          title="Create a project first"
          description="Each project gets its own script tag. Create one, then come back here."
          action={<ProjectsLink>Create a project first</ProjectsLink>}
        />
      ) : state.kind === 'not-found' ? (
        <EmptyState
          title="Project not found"
          description="This project doesn't exist or isn't yours. Pick one from your projects."
          action={<ProjectsLink>Go to projects</ProjectsLink>}
        />
      ) : state.kind === 'no-origin' ? (
        <ErrorState message="We couldn't work out this app's address to build the tag. Try reloading." />
      ) : (
        <>
          <GlassPanel className="flex flex-col gap-3">
            <h2 className="truncate text-lg font-semibold">{state.projectName}</h2>
            <pre className="rounded-md border border-border bg-glass p-3 text-sm break-all whitespace-pre-wrap text-fg">
              <code data-snippet>{state.snippet}</code>
            </pre>
            <CopyButton text={state.snippet} />
          </GlassPanel>
          <GlassPanel>
            <h2 className="mb-2 text-lg font-semibold">How to install</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-fg">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </GlassPanel>
        </>
      )}
    </div>
  );
}
