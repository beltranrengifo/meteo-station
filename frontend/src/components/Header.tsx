// Top bar: name, place, whether the station is sending, and a button to fetch again now.
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CloudSun, RefreshCw } from 'lucide-react';
import { useClock } from '../lib/clock';
import { isStale } from '../lib/format';

interface HeaderProps {
  lastTs: string | null;
}

export function Header({ lastTs }: HeaderProps) {
  const now = useClock();
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  const stale = isStale(lastTs, now);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <CloudSun size={24} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <div>
          <strong>Meteo Station</strong>
          <span>Estación doméstica · Madrid, Las Rozas</span>
        </div>
      </div>
      <div className="top-actions">
        <span className={`connection ${stale ? 'down' : ''}`}>
          <i aria-hidden="true" /> {stale ? 'Sensor sin conexión' : 'Sensor conectado'}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Actualizar datos"
          onClick={() => queryClient.invalidateQueries()}
        >
          <RefreshCw size={17} className={fetching ? 'spin' : undefined} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
