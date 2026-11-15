import { describe, expect, it } from 'vitest';
import type { Afspraak } from '../../api';
import { isTussenuur, metTussenuren } from './tussenuren';

// Een les op dinsdag 10 november 2026 (Nederlandse tijd), of op een andere dag.
const les = (lesuur: number | null, van: string, tot: string, dag = '2026-11-10', extra: Partial<Afspraak> = {}): Afspraak => ({
  id: `${dag}_${lesuur ?? van}`,
  start: `${dag}T${van}:00+01:00`,
  einde: `${dag}T${tot}:00+01:00`,
  heleDag: false,
  lesuur,
  omschrijving: 'VAK',
  lokaal: null,
  labels: [],
  vak: 'vak',
  docenten: [],
  inhoudHtml: null,
  afgerond: false,
  ...extra,
});

// Het normale rooster, zoals het op een andere dag staat: daaruit haalt Klas+ de tijden per lesuur.
const week = [
  les(1, '08:25', '09:15', '2026-11-09'),
  les(2, '09:15', '10:05', '2026-11-09'),
  les(3, '10:20', '11:10', '2026-11-09'),
  les(4, '11:10', '12:05', '2026-11-09'),
  les(5, '12:25', '13:15', '2026-11-09'),
  les(6, '13:15', '14:05', '2026-11-09'),
];

const tussen = (lessen: Afspraak[], ref = week) => metTussenuren(lessen, [...ref, ...lessen]).filter(isTussenuur);

describe('tussenuren', () => {
  it('een lesuur zonder les tussen twee lessen', () => {
    const t = tussen([les(3, '10:20', '11:10'), les(5, '12:25', '13:15')]);
    expect(t).toHaveLength(1);
    expect(t[0].uren).toEqual([4]);
    expect(t[0].tijd).toBe('11:10 – 12:05'); // de normale tijd van het 4e uur, zonder de pauze erna
  });

  it('twee tussenuren achter elkaar', () => {
    const t = tussen([les(2, '09:15', '10:05'), les(5, '12:25', '13:15')]);
    expect(t.map((x) => x.uren)).toEqual([[3, 4]]);
  });

  it('een pauze is geen tussenuur', () => {
    expect(tussen([les(2, '09:15', '10:05'), les(3, '10:20', '11:10')])).toHaveLength(0);
  });

  it('een blokuur (3e en 4e uur in één les) is geen tussenuur', () => {
    expect(tussen([les(3, '10:20', '12:05'), les(5, '12:25', '13:15')])).toHaveLength(0);
  });

  it('later beginnen of eerder vrij telt niet', () => {
    expect(tussen([les(3, '10:20', '11:10'), les(4, '11:10', '12:05')])).toHaveLength(0);
  });

  it('eigen afspraken en afspraken voor de hele dag tellen niet mee', () => {
    const eigen = les(null, '11:15', '12:00', '2026-11-10', { labels: ['eigen'] });
    const t = tussen([les(3, '10:20', '11:10'), eigen, les(5, '12:25', '13:15')]);
    expect(t).toHaveLength(1);
  });

  it('zonder rooster om mee te vergelijken: alleen bij een gat dat lang genoeg is', () => {
    expect(tussen([les(3, '10:20', '11:10'), les(5, '12:00', '12:50')], [])).toHaveLength(1);
    expect(tussen([les(3, '10:20', '11:10'), les(5, '11:30', '12:20')], [])).toHaveLength(0);
  });
});
