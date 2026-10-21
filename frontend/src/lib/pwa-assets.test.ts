// The files that make the dashboard installable (PWA): the manifest, its icons and the links.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose?: string;
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as { icons: ManifestIcon[] };

describe('web app manifest', () => {
  it('opens standalone at the root', () => {
    expect(manifest).toMatchObject({ name: 'Gorraplanistas', start_url: '/', display: 'standalone', lang: 'es' });
  });
  it('points at icons that exist, one of them maskable', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(`public${icon.src}`)).toBe(true);
    }
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
  it('is linked from index.html, with the iPhone icon and the service worker in public/', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(existsSync('public/apple-touch-icon.png')).toBe(true);
    expect(existsSync('public/sw.js')).toBe(true);
  });
});
