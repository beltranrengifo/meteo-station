// Custom range picker (react-datepicker), in Madrid time: one calendar for the first and last
// day, and a start and end time. Loaded lazily by RangeCharts: the picker and date-fns are only
// downloaded when needed.
import { es } from 'date-fns/locale/es';
import { useState } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Temporal } from 'temporal-polyfill';
import { customRangeProblem, daysRange, endAfter, installStart, lastMinute, type CustomRange } from '../lib/custom-range';
import { fromPickerDate, toPickerDate } from '../lib/format';

registerLocale('es', es);

// The day of `day` at the time of `time` (picker dates: Madrid wall-clock in local fields).
function withTime(day: Date, time: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes());
}

function pickedDay(date: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

const TIME_PICKER = {
  locale: 'es',
  showTimeSelect: true,
  showTimeSelectOnly: true,
  timeIntervals: 15,
  timeCaption: 'Hora',
  timeFormat: 'HH:mm',
  dateFormat: 'HH:mm',
  className: 'picker-input picker-time',
  popperPlacement: 'bottom-start' as const,
};

interface CustomRangePickerProps {
  value: CustomRange;
  onChange: (range: CustomRange) => void;
  installDate: string | undefined; // YYYY-MM-DD, from /api/now
}

export function CustomRangePicker({ value, onChange, installDate }: CustomRangePickerProps) {
  const from = toPickerDate(value.from);
  // The end shown is the last minute inside the range: 23:59 for a whole day.
  const to = toPickerDate(lastMinute(value));
  // The first day clicked of a new range, until the last one is clicked too.
  const [firstDay, setFirstDay] = useState<Date | null>(null);
  const now = toPickerDate(Temporal.Now.instant().toString());
  // Times after now are greyed out: the time list is built on the day already picked.
  const notFuture = (time: Date) => time.getTime() <= now.getTime();
  // Data starts at 00:00 on the install day, so whole days before it are greyed out.
  const first = installDate === undefined ? undefined : toPickerDate(installStart(installDate).toString());
  const problem = customRangeProblem(value, installDate);

  return (
    <div className="custom-range">
      {/* Not <label>s: the calendar opens inside them, and clicks there would refocus the input. */}
      <div className="picker-field">
        <span id="custom-days-label">Días</span>
        <DatePicker
          locale="es"
          selectsRange
          ariaLabelledBy="custom-days-label"
          startDate={firstDay ?? from}
          endDate={firstDay ? null : to}
          minDate={first}
          maxDate={now}
          dateFormat="d MMM yyyy"
          rangeSeparator=" – "
          className="picker-input"
          popperPlacement="bottom-start"
          onChange={([start, end]) => {
            if (start && end) {
              // Whole days: from 00:00 to 23:59, or to now on today.
              setFirstDay(null);
              onChange(daysRange(pickedDay(start), pickedDay(end), Temporal.Now.instant()));
            } else {
              setFirstDay(start);
            }
          }}
          onCalendarClose={() => setFirstDay(null)}
        />
      </div>
      <div className="picker-field">
        <span id="custom-from-label">Desde las</span>
        <DatePicker
          {...TIME_PICKER}
          ariaLabelledBy="custom-from-label"
          filterTime={notFuture}
          selected={from}
          onChange={(time: Date | null) => time && onChange({ ...value, from: fromPickerDate(withTime(from, time)) })}
        />
      </div>
      <div className="picker-field">
        <span id="custom-to-label">Hasta las</span>
        <DatePicker
          {...TIME_PICKER}
          ariaLabelledBy="custom-to-label"
          filterTime={notFuture}
          selected={to}
          onChange={(time: Date | null) => time && onChange({ ...value, to: endAfter(fromPickerDate(withTime(to, time)), Temporal.Now.instant()) })}
        />
      </div>
      {problem && <p role="alert" className="custom-range-problem">{problem}</p>}
    </div>
  );
}
