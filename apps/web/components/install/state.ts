import type { InstallState } from './InstallView';
import { buildSnippet } from './snippet';

export interface InstallProject {
  name: string;
  public_key: string;
}

/** Project lookups, done with the owner client so RLS scopes them. */
export interface InstallLoader {
  /** The project if the owner owns it, else null (missing and not-theirs look the same). */
  ownedProject(id: string): Promise<InstallProject | null>;
  /** The owner's oldest project, or null with none. */
  firstProject(): Promise<InstallProject | null>;
}

/** Which Install page state to show for `?project=` (null when absent). */
export async function resolveInstallState(
  projectId: string | null,
  origin: string | null,
  loader: InstallLoader,
): Promise<InstallState> {
  const project = projectId ? await loader.ownedProject(projectId) : await loader.firstProject();
  if (!project) return projectId ? { kind: 'not-found' } : { kind: 'no-projects' };
  const snippet = origin ? buildSnippet(origin, project.public_key) : null;
  if (!snippet) return { kind: 'no-origin' };
  return { kind: 'ready', projectName: project.name, snippet };
}
