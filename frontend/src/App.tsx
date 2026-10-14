import { useMemo, useRef, useState } from 'react';
import { Temporal } from 'temporal-polyfill';
import { CurrentConditions } from './components/CurrentConditions';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { PageLoading } from './components/Loading';
import { RangeCharts } from './components/RangeCharts';
import { useDay, useLast24h, useLast7Days, useNow, useRange, useSky } from './lib/api';
import { customRangeProblem, daysRange, lastDaysRange, type CustomRange } from './lib/custom-range';
import { TIME_ZONE, madridToday } from './lib/format';
import type { RangeResponse } from '../shared/api-types';
import { fromHours, fromReadings, lastHours, sliceSeries, type RangeKey, type RangeSeries } from './lib/series';

function rangeSeries(data: RangeResponse | undefined): RangeSeries | undefined {
  if (!data) {
    return undefined;
  }
  return data.resolution === 'minute' ? fromReadings(data.readings, data.from, data.to) : fromHours(data.hours, data.from, data.to);
}

// The custom range starts as yesterday 00:00 to this minute, in Madrid.
function initialCustomRange(): CustomRange {
  const today = madridToday();
  return daysRange(today.subtract({ days: 1 }), today, Temporal.Now.instant());
}

export function App() {
  const [range, setRange] = useState<RangeKey>('last24h');
  const [custom, setCustom] = useState(initialCustomRange);
  // A dragged stretch, cut from the data already shown, until its own data arrives.
  const [preview, setPreview] = useState<RangeSeries>();
  const today = madridToday();
  const now = useNow();
  const day = useDay(today, true);
  const last24h = useLast24h();
  const last7Days = useLast7Days(range === 'last7days');
  const installDate = now.data?.installDate;
  const customQuery = useRange(
    custom.from,
    custom.to,
    range === 'custom' && customRangeProblem(custom, installDate) === null,
  );
  const last30 = lastDaysRange(30, today, installDate);
  const last30Days = useRange(last30.from, last30.to, range === 'last30days' && installDate !== undefined, true);
  const sky = useSky();

  // Today: from 00:00 Madrid to when the data was fetched (/api/day returns no bounds).
  const todaySeries = useMemo(() => {
    if (!day.data) {
      return undefined;
    }
    const from = Temporal.PlainDate.from(day.data.date).toZonedDateTime(TIME_ZONE).toInstant().toString();
    const to = Temporal.Instant.fromEpochMilliseconds(day.dataUpdatedAt).toString();
    return fromReadings(day.data.readings, from, to);
  }, [day.data, day.dataUpdatedAt]);

  const last24hSeries = useMemo(
    () => last24h.data && fromReadings(last24h.data.readings, last24h.data.from, last24h.data.to),
    [last24h.data],
  );
  const last2hSeries = useMemo(() => last24hSeries && lastHours(last24hSeries, 2), [last24hSeries]);
  const customSeries = useMemo(() => rangeSeries(customQuery.data), [customQuery.data]);
  const last30DaysSeries = useMemo(() => rangeSeries(last30Days.data), [last30Days.data]);
  const last7DaysSeries = useMemo(
    () => last7Days.data && fromHours(last7Days.data.hours, last7Days.data.from, last7Days.data.to),
    [last7Days.data],
  );

  const reading = now.data?.reading ?? null;
  const lastTs = reading?.ts ?? null;
  const chart = {
    last2h: { series: last2hSeries, query: last24h },
    last24h: { series: last24hSeries, query: last24h },
    last7days: { series: last7DaysSeries, query: last7Days },
    last30days: { series: last30DaysSeries, query: last30Days },
    custom: {
      series: customSeries ?? (preview?.from === custom.from && preview.to === custom.to ? preview : undefined),
      query: customQuery,
    },
  }[range];

  // First load only: wait for the latest reading and today's data, which fill most of the page.
  // Later (a new day at midnight), the page stays and only the parts still loading show it.
  const loadedOnce = useRef(false);
  loadedOnce.current ||= !now.isPending && !day.isPending;
  if (!loadedOnce.current) {
    return (
      <main className="app-shell">
        <PageLoading />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Header lastTs={lastTs} />
      <div className="content">
        <Hero reading={reading} sky={sky.data} />
        {now.isError && <p role="alert" className="chart-status">No se pudieron cargar los datos actuales.</p>}
        <CurrentConditions reading={reading} today={todaySeries} last24h={last24h.data?.readings} />
        <RangeCharts
          range={range}
          onRangeChange={setRange}
          custom={custom}
          onCustomChange={setCustom}
          installDate={installDate}
          onSelectRange={(selected) => {
            if (chart.series) {
              setPreview(sliceSeries(chart.series, selected.from, selected.to));
            }
            setCustom(selected);
            setRange('custom');
          }}
          series={chart.series}
          isPending={chart.query.isLoading}
          isError={chart.query.isError}
        />
      </div>
      <Footer lastTs={lastTs} />
    </main>
  );
}
