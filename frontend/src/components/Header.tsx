// Top bar: name, the station picker, whether the station is sending, and a button to fetch
// again now.
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { CloudSun, RefreshCw } from 'lucide-react';
import type { StationInfo } from '../../shared/api-types';
import { useClock } from '../lib/clock';
import { isStale } from '../lib/format';
import { StationPicker } from './StationPicker';

interface HeaderProps {
  lastTs: string | null;
  station: StationInfo;
  stations: StationInfo[];
  onStationChange: (id: string) => void;
}

export function Header({ lastTs, station, stations, onStationChange }: HeaderProps) {
  const now = useClock();
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  const stale = isStale(lastTs, now);
  // With a single station there is nothing to pick: its name is in the hero below.
  const picker = stations.length > 1;

  return (
    <header className={`topbar ${picker ? 'has-picker' : ''}`}>
      <div className="brand">
        <div className="brand-mark">
          <CloudSun size={24} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <div className="brand-text">
          <strong>Meteo Station</strong>
          <span>Red de estaciones meteorológicas</span>
        </div>
      </div>
      <div className="top-actions">
        {picker && <StationPicker station={station} stations={stations} onChange={onStationChange} />}
        <span className={`connection ${stale ? 'down' : ''}`}>
          <i aria-hidden="true" /> <span className="connection-label">{stale ? 'Sensor sin conexión' : 'Sensor conectado'}</span>
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
