// Guards the Vercel layout: the Hobby plan fails any deployment with more than 12 functions
// (exceeded_serverless_functions_per_deployment), and every public URL must still reach one.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const API = join(ROOT, 'api');

// Vercel makes a function of every .js/.ts file in api/ whose name does not start with _ or .
function functionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) {
      return [];
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return functionFiles(path);
    }
    return /\.(ts|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

interface Rewrite { source: string; destination: string }
const { rewrites } = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { rewrites: Rewrite[] };

// Only the /api/:name(a|b) form used in vercel.json.
function sourcePattern(source: string): RegExp {
  return new RegExp(`^${source.replace(/:\w+\(([^)]+)\)/g, '(?:$1)')}$`);
}

function servedBy(path: string): string | null {
  if (existsSync(join(ROOT, `${path}.ts`))) {
    return path;
  }
  const rewrite = rewrites.find((r) => sourcePattern(r.source).test(path));
  return rewrite ? rewrite.destination.split('?')[0] : null;
}

describe('vercel config', () => {
  it('keeps at most 10 functions, leaving room under the Hobby limit of 12', () => {
    expect(functionFiles(API).length).toBeLessThanOrEqual(10);
  });

  it('serves every public URL, including the ones installed apps and pg_cron call', () => {
    const paths = [
      '/api/now', '/api/day', '/api/last-24h', '/api/last-7-days', '/api/range', '/api/month', '/api/daily',
      '/api/sky', '/api/forecast', '/api/stations', '/api/daily-summary',
      '/api/push/subscribe', '/api/push/unsubscribe', '/api/cron/daily-forecast',
    ];
    for (const path of paths) {
      const target = servedBy(path);
      expect(target, path).not.toBeNull();
      expect(existsSync(join(ROOT, `${target}.ts`)), path).toBe(true);
    }
  });

  it('does not rewrite similar names', () => {
    expect(servedBy('/api/daily-summary')).toBe('/api/daily-summary');
    expect(servedBy('/api/nowx')).toBeNull();
  });
});
