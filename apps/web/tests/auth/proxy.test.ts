import { describe, expect, it } from 'vitest';
import { classifyRoute } from '../../proxy';

describe('classifyRoute', () => {
  it.each([
    '/dashboard',
    '/dashboard/',
    '/dashboard/projects',
    '/dashboard/projects/abc/knowledge',
  ])('protects the owner page %s', (path) => {
    expect(classifyRoute(path)).toBe('owner-page');
  });

  it.each([
    '/api/projects',
    '/api/projects/abc',
    '/api/projects/abc/knowledge',
    '/api/projects/abc/knowledge/upload-url',
    '/api/projects/abc/knowledge/finalize',
    '/api/projects/abc/conversations',
    '/api/projects/abc/config',
    '/api/knowledge/abc',
    '/api/conversations/abc',
  ])('protects the owner API route %s', (path) => {
    expect(classifyRoute(path)).toBe('owner-api');
  });

  it.each([
    '/',
    '/embed',
    '/embed/abc',
    '/sign-in',
    '/sign-in/factor-one',
    '/sign-up',
    '/sign-up/verify-email-address',
    '/api/widget/config',
    '/api/widget/chat',
    '/api/clerk/webhook',
    '/api/posthog-config',
    // Share the text of a protected prefix but are not under it.
    '/dashboardx',
    '/api/projectsx',
    '/api/knowledge-base',
    '/api/conversationsx',
  ])('leaves %s public', (path) => {
    expect(classifyRoute(path)).toBe('public');
  });
});
