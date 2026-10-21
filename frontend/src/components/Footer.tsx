// Footer: when the next reading lands, the Open-Meteo credit its CC BY 4.0 licence asks for, and
// a link to the source code.
import { useClock } from '../lib/clock';
import { isStale } from '../lib/format';
import { msUntilNextReading } from '../../shared/refresh';

export function Footer({ lastTs }: { lastTs: string | null }) {
  const now = useClock();
  const seconds = Math.ceil(msUntilNextReading(now.epochMilliseconds) / 1000);
  return (
    <footer>
      <span>
        GORRAPLANISTAS <b>βeta</b>
      </span>
      <span>
        Datos de la estación{isStale(lastTs, now) ? '' : ` · Próxima lectura en ${seconds} s`}
      </span>
      <small className="attribution">
        Cielo, UV y previsión: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a>
        {' · '}Código: <a href="https://github.com/beltranrengifo/meteo-station" target="_blank" rel="noreferrer">GitHub</a>
      </small>
    </footer>
  );
}
