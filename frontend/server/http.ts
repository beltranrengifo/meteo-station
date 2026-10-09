// JSON responses for the read API, with the CDN cache time in the headers.

export function json(body: unknown, cacheSeconds: number): Response {
  return Response.json(body, {
    headers: {
      // Browsers always revalidate; the Vercel CDN keeps the response for cacheSeconds and
      // serves the stale copy for as long again while it fetches a fresh one.
      'Cache-Control': `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`,
    },
  });
}

// Rejected before touching Supabase, so a flood of bad requests costs nothing downstream.
export function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400, headers: { 'Cache-Control': 'public, s-maxage=3600' } });
}

export function serverError(error: unknown): Response {
  console.error(error);
  return Response.json({ error: 'server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}
