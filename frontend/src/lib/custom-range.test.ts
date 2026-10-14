import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { customRangeProblem, daysRange, lastDaysRange, endAfter, installStart, lastMinute, selectionToRange } from './custom-range';

const at = (value: string) => Temporal.Instant.from(value);

describe('installStart', () => {
  it('is 00:00 in Madrid on the install day', () => {
    expect(installStart('2026-10-08').toString()).toBe('2026-10-07T22:00:00Z');
  });
});

describe('daysRange', () => {
  const day = (value: string) => Temporal.PlainDate.from(value);
  const now = at('2026-10-14T15:48:30Z'); // 17:48:30 in Madrid
  it('runs from 00:00 on the first day to the end of a past last day', () => {
    expect(daysRange(day('2026-10-09'), day('2026-10-10'), now)).toEqual({
      from: '2026-10-08T22:00:00Z',
      to: '2026-10-10T22:00:00Z',
    });
  });
  it('ends at the current minute when the last day is today', () => {
    expect(daysRange(day('2026-10-13'), day('2026-10-14'), now)).toEqual({
      from: '2026-10-12T22:00:00Z',
      to: '2026-10-14T15:49:00Z',
    });
  });
  it('keeps the length of the day when the clocks change', () => {
    expect(daysRange(day('2026-10-25'), day('2026-10-25'), at('2026-11-01T00:00:00Z')).to).toBe('2026-10-25T23:00:00Z');
  });
});

describe('lastDaysRange', () => {
  const today = Temporal.PlainDate.from('2026-11-14');
  it('runs from 00:00 on the first day to 00:00 tomorrow, in Madrid', () => {
    expect(lastDaysRange(30, today, '2026-10-01')).toEqual({ from: '2026-10-15T22:00:00Z', to: '2026-11-14T23:00:00Z' });
  });
  it('starts no earlier than the install day', () => {
    expect(lastDaysRange(30, today, '2026-10-20').from).toBe('2026-10-19T22:00:00Z');
  });
});

describe('lastMinute and endAfter', () => {
  const now = at('2026-10-14T15:48:30Z');
  it('shows a whole day as ending at 23:59', () => {
    expect(lastMinute({ from: '2026-10-08T22:00:00Z', to: '2026-10-10T22:00:00Z' })).toBe('2026-10-10T21:59:00Z');
  });
  it('takes the picked end minute in, up to the current one', () => {
    expect(endAfter('2026-10-14T10:00:00Z', now)).toBe('2026-10-14T10:01:00Z');
    expect(endAfter('2026-10-14T20:00:00Z', now)).toBe('2026-10-14T15:49:00Z');
  });
});

describe('customRangeProblem', () => {
  it('accepts a range from 00:00 in Madrid on the install day', () => {
    expect(customRangeProblem({ from: '2026-10-07T22:00:00Z', to: '2026-10-08T22:00:00Z' }, '2026-10-08')).toBeNull();
  });
  it('rejects a range starting before the install day, naming the day', () => {
    expect(customRangeProblem({ from: '2026-10-07T21:59:00Z', to: '2026-10-08T22:00:00Z' }, '2026-10-08'))
      .toBe('No hay datos antes del 8 de octubre.');
  });
  it('leaves the install day to the API while it is unknown', () => {
    expect(customRangeProblem({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' }, undefined)).toBeNull();
  });
});
const BOUNDS = { from: '2026-10-14T06:00:30Z', to: '2026-10-14T08:00:30Z' };

describe('selectionToRange', () => {
  it('widens the selection to whole minutes, in either drag direction', () => {
    const expected = { from: '2026-10-14T06:10:00Z', to: '2026-10-14T06:41:00Z' };
    expect(selectionToRange(at('2026-10-14T06:10:20Z'), at('2026-10-14T06:40:10Z'), BOUNDS)).toEqual(expected);
    expect(selectionToRange(at('2026-10-14T06:40:10Z'), at('2026-10-14T06:10:20Z'), BOUNDS)).toEqual(expected);
  });
  it('keeps the selection inside the chart range', () => {
    expect(selectionToRange(at('2026-10-14T05:00:00Z'), at('2026-10-14T09:00:00Z'), BOUNDS)).toEqual({
      from: '2026-10-14T06:00:00Z',
      to: '2026-10-14T08:01:00Z',
    });
  });
  it('ignores a selection under 2 minutes', () => {
    expect(selectionToRange(at('2026-10-14T06:10:00Z'), at('2026-10-14T06:11:00Z'), BOUNDS)).toBeNull();
  });
});
