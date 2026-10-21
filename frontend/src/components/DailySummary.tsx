// "El aviso de hoy": the 9:00 notification's text at the top of the forecast tab, for those who
// get it (the app installed and the alert on). "Leído" closes it on this device until the next
// day's notification.
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDailySummary, useStations } from '../lib/api';
import { dismissSummary, isSummaryDismissed, summaryRows } from '../lib/daily-summary';
import { formatFullDate, formatTime } from '../lib/format';
import { alertState } from '../lib/push';
import { chooseStation } from '../lib/station';

export function DailySummary() {
  const [subscribed, setSubscribed] = useState(false);
  const [closedDay, setClosedDay] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    alertState()
      .then((state) => {
        if (active) {
          setSubscribed(state === 'on');
        }
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      active = false;
    };
  }, []);

  const { data } = useDailySummary(subscribed);
  // The notification is about the default station, whichever one the dashboard shows.
  const stations = useStations();
  const place = stations.data && chooseStation(stations.data, null)?.name;
  if (!data || closedDay === data.day || isSummaryDismissed(data.day)) {
    return null;
  }

  const close = () => {
    dismissSummary(data.day);
    setClosedDay(data.day);
  };

  return (
    <section className="daily-summary" aria-labelledby="daily-summary-title">
      <span className="eyebrow">El aviso de hoy · {formatTime(data.sentAt)}</span>
      <h3 id="daily-summary-title">{place ?? 'Hoy'}</h3>
      <p className="daily-summary-date">{formatFullDate(data.day)}</p>
      <ul>
        {summaryRows(data.body).map((row, i) => (
          <li key={i} className={row.warning ? 'warning' : undefined}>
            <span className="daily-summary-emoji" aria-hidden="true">{row.emoji}</span>
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={close}>
        <Check size={16} aria-hidden="true" /> Leído
      </button>
    </section>
  );
}
