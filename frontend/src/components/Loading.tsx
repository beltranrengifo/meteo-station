// Loading states: the whole page on first load, and placeholder chart cards while a new range loads.
import { LoaderCircle } from 'lucide-react';

export function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner" role="status">
      <LoaderCircle size={18} className="spin" aria-hidden="true" />
      {label}
    </span>
  );
}

// Until the first data arrives: nothing on the page would have a value yet.
export function PageLoading() {
  return (
    <div className="page-loading">
      <Spinner label="Cargando datos de la estación…" />
    </div>
  );
}

// The six chart cards as grey placeholders, so the layout does not jump when the data lands.
export function ChartsLoading({ rangeTitle }: { rangeTitle: string }) {
  return (
    <>
      <Spinner label={`Cargando ${rangeTitle.toLowerCase()}…`} />
      <div className="charts-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <article key={i} className="chart-card skeleton-card">
            <span className="skeleton skeleton-eyebrow" />
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-chart" />
          </article>
        ))}
      </div>
    </>
  );
}
