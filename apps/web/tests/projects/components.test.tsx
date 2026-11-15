import { readFileSync } from 'node:fs';
import type { Project } from '@askwell/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_TITLE,
  ProjectRowView,
  ProjectsManager,
  type ProjectRowViewProps,
} from '../../components/projects';

const ID = '22222222-2222-4222-8222-222222222222';
const project = (id: string, name: string): Project => ({
  id,
  name,
  publicKey: `pk_${id}`,
  messagesUsed: 3,
  messageLimit: 100,
  periodStart: '2026-11-01T00:00:00+00:00',
  createdAt: '2026-11-15T10:00:00+00:00',
});

const noop = () => {};
function row(overrides: Partial<ProjectRowViewProps> = {}) {
  return renderToStaticMarkup(
    <ul>
      <ProjectRowView
        project={project(ID, 'Store')}
        mode="view"
        draft="Store"
        busy={false}
        error={null}
        onDraftChange={noop}
        onStartRename={noop}
        onSubmitRename={noop}
        onStartDelete={noop}
        onConfirmDelete={noop}
        onCancel={noop}
        {...overrides}
      />
    </ul>,
  );
}

describe('ProjectsManager', () => {
  it('shows the empty state with a create form when there are no projects', () => {
    const html = renderToStaticMarkup(<ProjectsManager initialProjects={[]} />);
    expect(html).toContain('data-state="empty"');
    expect(html).toContain(EMPTY_TITLE);
    expect(html).toContain('Create project');
    expect(html).not.toContain('Your projects');
  });

  it('lists each project with a link to its install page', () => {
    const other = '33333333-3333-4333-8333-333333333333';
    const html = renderToStaticMarkup(
      <ProjectsManager initialProjects={[project(ID, 'Store'), project(other, 'Blog')]} />,
    );
    expect(html).toContain(`href="/dashboard/install?project=${ID}"`);
    expect(html).toContain(`href="/dashboard/install?project=${other}"`);
    expect(html).toContain('Store');
    expect(html).toContain('Blog');
    expect(html).toContain('Create project');
    expect(html).not.toContain(EMPTY_TITLE);
  });

  it('renders project names as text, not HTML', () => {
    const html = renderToStaticMarkup(
      <ProjectsManager initialProjects={[project(ID, '<img src=x onerror=alert(1)>')]} />,
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('ProjectRowView', () => {
  it('view mode shows name, usage, Rename and Delete', () => {
    const html = row();
    expect(html).toContain('Store');
    expect(html).toContain('3 / 100 messages this month');
    expect(html).toContain('>Rename<');
    expect(html).toContain('>Delete<');
    expect(html).not.toContain('<input');
  });

  it('rename mode shows a labelled input with the draft, Save and Cancel', () => {
    const html = row({ mode: 'rename', draft: 'Shop' });
    expect(html).toContain(`id="rename-${ID}"`);
    expect(html).toContain(`for="rename-${ID}"`);
    expect(html).toContain('value="Shop"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain('>Save<');
    expect(html).toContain('>Cancel<');
  });

  it('disables Save for an empty name', () => {
    const html = row({ mode: 'rename', draft: '   ' });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it('confirm-delete mode asks before deleting', () => {
    const html = row({ mode: 'confirm-delete' });
    expect(html).toContain('Delete this project?');
    expect(html).toContain('>Delete<');
    expect(html).toContain('>Cancel<');
    expect(html).not.toContain('>Rename<');
  });

  it('shows a busy label while deleting', () => {
    expect(row({ mode: 'confirm-delete', busy: true })).toContain('Deleting…');
  });

  it("shows the server's error as an alert", () => {
    const html = row({ error: 'Project not found' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Project not found');
  });
});

describe('/dashboard page', () => {
  const src = readFileSync(new URL('../../app/dashboard/page.tsx', import.meta.url), 'utf8');
  it('reads projects with the owner client, never the service client', () => {
    expect(src).toContain('createOwnerClient()');
    expect(src).not.toMatch(/createServiceClient|supabase\/service/);
  });
});
