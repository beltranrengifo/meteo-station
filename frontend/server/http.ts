// JSON responses for the read API, with the CDN cache time in the headers.
import type { CachePolicy } from './params.js';

export function json<T>(body: T, cache: CachePolicy): Response {
  return Response.json(body, {
    headers: {
      // Browsers always revalidate; only the Vercel CDN keeps a copy.
      'Cache-Control': `public, max-age=0, s-maxage=${cache.sMaxAge}, stale-while-revalidate=${cache.staleWhileRevalidate}`,
    },
  });
}

// Rejected before touching Supabase, so a flood of bad requests costs nothing downstream.
export function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400, headers: { 'Cache-Control': 'public, s-maxage=3600' } });
}

// A station that is not listed (yet): cached briefly, so listing it shows up soon.
export function notFound(error: string): Response {
  return Response.json({ error }, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } });
}

export function serverError(error: unknown): Response {
  console.error(error);
  return Response.json({ error: 'server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}
