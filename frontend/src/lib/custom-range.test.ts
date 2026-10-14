import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { selectionToRange } from './custom-range';

const at = (value: string) => Temporal.Instant.from(value);
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
