// ?theme=light|dark: the script in index.html, the CSS built from index.css and the charts.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import { isDark } from './theme';

const html = readFileSync('index.html', 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

// What the script in index.html leaves in <html data-theme> for a given URL.
function themeFor(search: string): string | undefined {
  const root = { dataset: {} as Record<string, string> };
  new Function('document', 'location', script)({ documentElement: root }, { search });
  return root.dataset.theme;
}

async function builtCss(): Promise<string> {
  const require = createRequire(`${process.cwd()}/`);
  const compiler = await compile(readFileSync('src/index.css', 'utf8'), {
    loadStylesheet: async (id, base) => {
      const path = require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id, { paths: [base] });
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  return compiler.build([]);
}

describe('the script in index.html', () => {
  it('runs in the head, before anything paints', () => {
    expect(html.indexOf('<script>')).toBeGreaterThan(-1);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'));
  });

  it('takes the theme from the URL, whatever else is in it', () => {
    expect(themeFor('?theme=dark')).toBe('dark');
    expect(themeFor('?theme=light')).toBe('light');
    expect(themeFor('?station=meteo-station-1&view=forecast&theme=dark')).toBe('dark');
  });

  it('sets nothing without the parameter or for an unknown theme', () => {
    expect(themeFor('')).toBeUndefined();
    expect(themeFor('?view=forecast')).toBeUndefined();
    expect(themeFor('?theme=blue')).toBeUndefined();
    expect(themeFor('?theme=')).toBeUndefined();
  });
});

describe('index.css', () => {
  it('keeps the system choice when no theme is forced', async () => {
    expect(await builtCss()).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{\s*color-scheme: dark;/);
  });

  it('turns the dark tokens on with ?theme=dark, on any system', async () => {
    expect(await builtCss()).toMatch(/^\s*:root\[data-theme='dark'\] \{\s*color-scheme: dark;/m);
  });
});

describe('isDark', () => {
  it('follows the system when no theme is forced', () => {
    expect(isDark(undefined, true)).toBe(true);
    expect(isDark(undefined, false)).toBe(false);
  });

  it('ignores the system when a theme is forced', () => {
    expect(isDark('dark', false)).toBe(true);
    expect(isDark('light', true)).toBe(false);
  });
});
