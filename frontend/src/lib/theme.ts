// Light or dark. The dashboard follows the system, unless the URL asks for a theme
// (?theme=light|dark), as Tablux does to embed the site in its own theme. The script in
// index.html reads the parameter before the first paint and leaves it in <html data-theme>,
// which it keeps while the tabs and the station change; index.css and the charts read it there.

export function isDark(forced: string | undefined, systemDark: boolean): boolean {
  return forced === undefined ? systemDark : forced === 'dark';
}
