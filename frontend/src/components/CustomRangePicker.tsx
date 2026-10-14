// "Desde" and "Hasta" pickers for the custom range (react-datepicker), in Madrid time.
// Loaded lazily by RangeCharts: the picker and date-fns are only downloaded when needed.
import { es } from 'date-fns/locale/es';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Temporal } from 'temporal-polyfill';
import { customRangeProblem, installStart, type CustomRange } from '../lib/custom-range';
import { fromPickerDate, toPickerDate } from '../lib/format';

registerLocale('es', es);

interface CustomRangePickerProps {
  value: CustomRange;
  onChange: (range: CustomRange) => void;
  installDate: string | undefined; // YYYY-MM-DD, from /api/now
}

export function CustomRangePicker({ value, onChange, installDate }: CustomRangePickerProps) {
  const from = toPickerDate(value.from);
  const to = toPickerDate(value.to);
  const now = toPickerDate(Temporal.Now.instant().toString());
  // Data starts at 00:00 on the install day, so whole days before it are greyed out.
  const first = installDate === undefined ? undefined : toPickerDate(installStart(installDate).toString());
  const common = {
    locale: 'es',
    showTimeSelect: true,
    timeIntervals: 15,
    timeCaption: 'Hora',
    timeFormat: 'HH:mm',
    dateFormat: 'd MMM yyyy, HH:mm',
    maxDate: now,
    startDate: from,
    endDate: to,
    className: 'picker-input',
    popperPlacement: 'bottom-start' as const,
  };
  const problem = customRangeProblem(value, installDate);

  return (
    <div className="custom-range">
      {/* Not a <label>: the calendar opens inside it, and clicks there would refocus the input. */}
      <div className="picker-field">
        <span id="custom-from-label">Desde</span>
        <DatePicker
          {...common}
          ariaLabelledBy="custom-from-label"
          selectsStart
          minDate={first}
          selected={from}
          onChange={(date: Date | null) => date && onChange({ ...value, from: fromPickerDate(date) })}
        />
      </div>
      <div className="picker-field">
        <span id="custom-to-label">Hasta</span>
        <DatePicker
          {...common}
          ariaLabelledBy="custom-to-label"
          selectsEnd
          minDate={from}
          selected={to}
          onChange={(date: Date | null) => date && onChange({ ...value, to: fromPickerDate(date) })}
        />
      </div>
      {problem && <p role="alert" className="custom-range-problem">{problem}</p>}
    </div>
  );
}
