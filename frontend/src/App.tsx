import { DayCharts } from './components/DayCharts';
import { NowPanel } from './components/NowPanel';
import { useDay, useNow } from './lib/api';
import { madridToday } from './lib/format';

export function App() {
  const now = useNow();
  const today = madridToday();
  const day = useDay(today, true);

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
        <header>
          <h1 className="text-2xl font-semibold">Meteo Station</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Madrid, zona noroeste · hora de Madrid</p>
        </header>

        {now.isPending && <p>Cargando…</p>}
        {now.isError && <p role="alert">No se pudieron cargar los datos actuales.</p>}
        {now.data && <NowPanel data={now.data} />}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Hoy</h2>
          {day.isPending && <p>Cargando…</p>}
          {day.isError && <p role="alert">No se pudieron cargar los datos de hoy.</p>}
          {day.data && <DayCharts readings={day.data.readings} />}
        </section>
      </main>
    </div>
  );
}
