"use client";
import { useId } from 'react';
import { changePeriodBoundary, type PeriodPreset, type QueryPeriod } from '@/lib/query-period';

const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export function QueryPeriodPicker({ preset, custom, full, onPreset, onCustom }: {
  preset: PeriodPreset; custom: QueryPeriod; full: QueryPeriod;
  onPreset: (value: PeriodPreset) => void; onCustom: (value: QueryPeriod) => void;
}) {
  const id = useId();
  const years = Array.from({ length: Number(full.to.slice(0, 4)) - Number(full.from.slice(0, 4)) + 1 }, (_, i) => Number(full.from.slice(0, 4)) + i);
  return <div className="query-period-bar" aria-label="Период всех графиков">
    <div className="query-period-presets" role="group" aria-label="Период">
      {([['36', '3 года'], ['24', '24 месяца'], ['custom', 'Свой период']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={preset === value} onClick={() => onPreset(value)}>{label}</button>)}
    </div>
    {preset === 'custom' && <div className="query-period-custom">{(['from', 'to'] as const).map(side => {
      const label = side === 'from' ? 'С' : 'По';
      const [year, month] = custom[side].split('-');
      return <fieldset key={side}><legend>{label}</legend>
        <label className="sr-only" htmlFor={id + side + 'month'}>{label}: месяц</label>
        <select id={id + side + 'month'} value={month} onChange={e => onCustom(changePeriodBoundary(custom, side, year + '-' + e.target.value, full))}>
          {monthNames.map((name, i) => { const m = String(i + 1).padStart(2, '0'); const date = year + '-' + m;
            return <option key={m} value={m} disabled={date < full.from || date > full.to}>{name}</option>;
          })}
        </select>
        <label className="sr-only" htmlFor={id + side + 'year'}>{label}: год</label>
        <select id={id + side + 'year'} value={year} onChange={e => onCustom(changePeriodBoundary(custom, side, e.target.value + '-' + month, full))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </fieldset>;
    })}</div>}
  </div>;
}
