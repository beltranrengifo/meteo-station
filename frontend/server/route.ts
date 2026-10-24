// Several endpoints share one Vercel Function: the Hobby plan allows 12 per deployment, and
// every .ts file in api/ is one. vercel.json rewrites each public URL to the shared function
// with the route in a query param (/api/now -> /api/readings?view=now), so the public URLs stay
// the same. This picks the route and returns the URL without that param, so each endpoint
// still checks its own params strictly.
import type { Parsed } from './params.js';

export function pickRoute<T extends string>(
  url: URL,
  param: string,
  names: readonly T[],
): Parsed<{ name: T; url: URL }> {
  const values = url.searchParams.getAll(param);
  if (values.length > 1) {
    return { ok: false, error: `repeated parameter: ${param}` };
  }
  // The rewrite adds the param; the last path segment covers a function that sees the public URL.
  const name = values[0] ?? url.pathname.split('/').pop() ?? '';
  if (!(names as readonly string[]).includes(name)) {
    return { ok: false, error: values.length === 0 ? `missing parameter: ${param}` : `unknown ${param}: ${name}` };
  }
  const rest = new URL(url);
  rest.searchParams.delete(param);
  return { ok: true, value: { name: name as T, url: rest } };
}
