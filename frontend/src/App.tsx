// Placeholder until the dashboard (meteo-xkj): shows the raw /api/now response.
import { useEffect, useState } from 'react';

export function App() {
  const [now, setNow] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/now')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(setNow)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <main>
      <h1>Meteo Station</h1>
      {error && <p>Error: {error}</p>}
      <pre>{now ? JSON.stringify(now, null, 2) : 'Loading…'}</pre>
    </main>
  );
}
