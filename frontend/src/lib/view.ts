// Which tab the dashboard shows: the station's own data or the forecast. Like the station, the
// choice lives in the URL (?view=forecast), so a link opens the same tab.
export type View = 'station' | 'forecast';

const PARAM = 'view';

export function viewFromSearch(search: string): View {
  return new URLSearchParams(search).get(PARAM) === 'forecast' ? 'forecast' : 'station';
}

export function viewFromUrl(): View {
  return viewFromSearch(window.location.search);
}

// The station tab is the default, so it leaves the URL clean. Replaces the current history
// entry, like switching stations.
export function setViewInUrl(view: View): void {
  const url = new URL(window.location.href);
  if (view === 'forecast') {
    url.searchParams.set(PARAM, view);
  } else {
    url.searchParams.delete(PARAM);
  }
  window.history.replaceState(null, '', url);
}
