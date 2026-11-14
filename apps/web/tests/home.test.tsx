import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@askwell/shared';
import Home from '../app/page';

describe('home page', () => {
  it('shows the app name from packages/shared', () => {
    expect(APP_NAME).toBe('Askwell');
    expect(renderToStaticMarkup(<Home />)).toContain(APP_NAME);
  });
});
