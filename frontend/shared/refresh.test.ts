import { describe, expect, it } from 'vitest';
import { msUntilNextReading } from './refresh';

const at = (iso: string) => Date.parse(iso);

describe('msUntilNextReading', () => {
  it('points at 8 s past the next minute boundary still ahead', () => {
    expect(msUntilNextReading(at('2026-10-09T09:56:00Z'))).toBe(8_000);
    expect(msUntilNextReading(at('2026-10-09T09:56:05Z'))).toBe(3_000);
    expect(msUntilNextReading(at('2026-10-09T09:56:30Z'))).toBe(38_000);
  });
  it('right at the landing point waits a whole minute', () => {
    expect(msUntilNextReading(at('2026-10-09T09:56:08Z'))).toBe(60_000);
    expect(msUntilNextReading(at('2026-10-09T09:56:08.001Z'))).toBe(59_999);
  });
});
