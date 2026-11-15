import { describe, expect, it } from 'vitest';
import type { Afspraak } from '../api';
import { ochtendMelding } from './ochtendmelding';
import { isNieuwer } from './update';

const les = (lesuur: number, van: string, vak: string, extra: Partial<Afspraak> = {}): Afspraak => ({
  id: `${lesuur}`,
  start: `2026-11-10T${van}:00+01:00`,
  einde: `2026-11-10T${van}:00+01:00`,
  heleDag: false,
  lesuur,
  omschrijving: vak.toUpperCase(),
  lokaal: '2.03',
  labels: [],
  vak,
  docenten: [],
  inhoudHtml: null,
  afgerond: false,
  ...extra,
});

describe('ochtendMelding', () => {
  it('noemt je eerste les met uur, tijd en lokaal', () => {
    expect(ochtendMelding([les(2, '09:15', 'engels'), les(1, '08:25', 'nederlands')])).toEqual({
      titel: 'Eerste les: Nederlands',
      tekst: '1e uur, om 08:25 in 2.03.',
    });
  });

  it('slaat een vervallen eerste uur over en meldt het', () => {
    const m = ochtendMelding([les(1, '08:25', 'nederlands', { labels: ['vervalt'] }), les(2, '09:15', 'engels')]);
    expect(m?.titel).toBe('Eerste les: Engels');
    expect(m?.tekst).toBe('2e uur, om 09:15 in 2.03. Nederlands (1e uur) is vervallen.');
  });

  it('meldt een gewijzigd lokaal', () => {
    const m = ochtendMelding([les(1, '08:25', 'nederlands'), les(3, '10:20', 'biologie', { labels: ['gewijzigd'], lokaal: 'B.12' })]);
    expect(m?.tekst).toContain('Biologie (3e uur) is gewijzigd, nu in B.12.');
  });

  it('alles vervallen', () => {
    expect(ochtendMelding([les(1, '08:25', 'nederlands', { labels: ['vervalt'] })])?.titel).toBe('Al je lessen vervallen vandaag');
  });

  it('geen lessen (alleen eigen afspraken of hele dag): geen melding', () => {
    expect(ochtendMelding([les(1, '08:25', 'bijles', { labels: ['eigen'] }), les(2, '00:00', 'excursie', { heleDag: true })])).toBeNull();
  });
});

describe('isNieuwer: versies vergelijken voor de updatemelding', () => {
  it.each([
    ['0.1.17', '0.1.16', true],
    ['v0.1.17', '0.1.16', true],
    ['0.2.0', '0.1.99', true],
    ['0.1.10', '0.1.9', true],
    ['0.1.16', '0.1.16', false],
    ['0.1.15', '0.1.16', false],
  ])('%s nieuwer dan %s: %s', (nieuw, huidig, verwacht) => {
    expect(isNieuwer(nieuw, huidig)).toBe(verwacht);
  });
});
