// @vitest-environment happy-dom
import type { Project } from '@askwell/shared';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { ProjectsManager } = await import('../../components/projects');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = '44444444-4444-4444-8444-444444444444';
const project = (id: string, name: string): Project => ({
  id,
  name,
  publicKey: `pk_${id.slice(0, 8)}`,
  messagesUsed: 0,
  messageLimit: 100,
  periodStart: '2026-11-01T00:00:00+00:00',
  createdAt: '2026-11-15T10:00:00+00:00',
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fetch whose response we release by hand, to look at the page mid-request. */
function deferredFetch() {
  let release: (res: Response) => void = () => {};
  const fn = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  return { fn, release: (res: Response) => release(res) };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(projects: Project[]) {
  act(() => root.render(<ProjectsManager initialProjects={projects} />));
}

const $ = <T extends Element>(sel: string) => container.querySelector<T>(sel);
const createInput = () => $<HTMLInputElement>('#new-project-name')!;
const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label)!;

/** Types into a controlled React input. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit();
  });
}

describe('create form while busy', () => {
  it('disables the input during the request and enables it after', async () => {
    const f = deferredFetch();
    vi.stubGlobal('fetch', f.fn);
    render([]);

    type(createInput(), 'Store');
    await submit(createInput().form!);
    expect(createInput().disabled).toBe(true);

    await act(async () => f.release(json(201, { project: project(ID, 'Store') })));
    expect(createInput().disabled).toBe(false);
    expect(createInput().value).toBe('');
    expect(container.textContent).toContain('Store');
  });

  it('enables the input again after a failure, keeping the draft', async () => {
    const f = deferredFetch();
    vi.stubGlobal('fetch', f.fn);
    render([]);

    type(createInput(), 'Second');
    await submit(createInput().form!);
    expect(createInput().disabled).toBe(true);

    await act(async () =>
      f.release(json(403, { error: { code: 'limit_reached', message: 'Your Free plan allows 1 project' } })),
    );
    expect(createInput().disabled).toBe(false);
    expect(createInput().value).toBe('Second');
    expect(container.textContent).toContain('Your Free plan allows 1 project');
  });
});

describe('rename input while busy', () => {
  it('disables the input during the save and enables it after a failure', async () => {
    const f = deferredFetch();
    vi.stubGlobal('fetch', f.fn);
    render([project(ID, 'Store')]);

    await click(button('Rename'));
    const input = () => $<HTMLInputElement>(`#rename-${ID}`)!;
    type(input(), 'Shop');
    await submit(input().form!);
    expect(input().disabled).toBe(true);

    await act(async () =>
      f.release(json(500, { error: { code: 'internal_error', message: 'Could not rename the project' } })),
    );
    expect(input().disabled).toBe(false);
    expect(input().value).toBe('Shop');
  });
});

describe('create form placement', () => {
  it('keeps the typed draft when the last project is deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ok: true })),
    );
    render([project(ID, 'Store')]);
    const before = createInput();
    type(before, 'Draft name');

    await click(button('Delete'));
    await click(button('Delete'));

    expect(container.textContent).toContain('No projects yet');
    expect(createInput()).toBe(before);
    expect(createInput().value).toBe('Draft name');
  });
});
