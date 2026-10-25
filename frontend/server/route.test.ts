import { describe, expect, it } from 'vitest';
import { pickRoute } from './route';

const VIEWS = ['now', 'day', 'last-24h'] as const;

describe('pickRoute', () => {
  it('takes the name from the param the vercel.json rewrite adds, and drops that param', () => {
    const picked = pickRoute(new URL('https://x/api/readings?view=day&date=2026-10-10&station=a'), 'view', VIEWS);
    expect(picked.ok && picked.value.name).toBe('day');
    expect(picked.ok && picked.value.url.search).toBe('?date=2026-10-10&station=a');
  });
  it('falls back to the public path when the function sees the URL before the rewrite', () => {
    const picked = pickRoute(new URL('https://x/api/last-24h?station=a'), 'view', VIEWS);
    expect(picked.ok && picked.value.name).toBe('last-24h');
    expect(picked.ok && picked.value.url.search).toBe('?station=a');
  });
  it('rejects a missing, unknown or repeated name', () => {
    expect(pickRoute(new URL('https://x/api/readings'), 'view', VIEWS)).toEqual({ ok: false, error: 'missing parameter: view' });
    expect(pickRoute(new URL('https://x/api/readings?view=month'), 'view', VIEWS)).toEqual({ ok: false, error: 'unknown view: month' });
    expect(pickRoute(new URL('https://x/api/readings?view=now&view=day'), 'view', VIEWS)).toEqual({ ok: false, error: 'repeated parameter: view' });
  });
  it('prefers the param over the path', () => {
    const picked = pickRoute(new URL('https://x/api/now?view=day'), 'view', VIEWS);
    expect(picked.ok && picked.value.name).toBe('day');
  });
});
