import { completedMonth } from './query-items';
import { shiftMonth } from './search-demand';

export type QueryPeriod = { from: string; to: string };
export type PeriodPreset = '36' | '24' | 'custom';
export function analysisPeriod(now = new Date()): QueryPeriod {
  const to = completedMonth(now);
  return { from: shiftMonth(to, -35), to };
}
export function displayPeriod(preset: PeriodPreset, custom: QueryPeriod, full: QueryPeriod): QueryPeriod {
  return preset === 'custom' ? custom : { from: shiftMonth(full.to, -(Number(preset) - 1)), to: full.to };
}
export function validDisplayPeriod(period: QueryPeriod, full: QueryPeriod) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/;
  return month.test(period.from) && month.test(period.to) && period.from <= period.to && period.from >= full.from && period.to <= full.to;
}
export function changePeriodBoundary(period: QueryPeriod, side: keyof QueryPeriod, value: string, full: QueryPeriod): QueryPeriod {
  const bounded = value < full.from ? full.from : value > full.to ? full.to : value;
  return side === 'from' ? { from: bounded, to: bounded > period.to ? bounded : period.to }
    : { from: bounded < period.from ? bounded : period.from, to: bounded };
}
