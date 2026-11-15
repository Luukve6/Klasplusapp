import { describe, expect, it } from 'vitest';
import type { VakOverzicht } from './cijfers';
import { berekenSlagen, herkenNiveau, standaardSoort, type Niveau } from './examen';

// Vakken met een SE-gemiddelde; de cijfers zelf doen er voor de uitslag niet toe.
const vakken = (se: Record<string, number>): VakOverzicht[] =>
  Object.entries(se).map(([naam, gemiddelde], i) => ({
    vak: { code: `v${i}`, naam, volgnummer: i },
    cijfers: [],
    gemiddelde,
  }));
const uitslag = (se: Record<string, number>, niveau: Niveau = 'vwo') => berekenSlagen(vakken(se), {}, niveau);

describe('herkenNiveau: examenjaar uit de klasnaam', () => {
  it.each([
    ['6 vwo', 'vwo'],
    ['V6', 'vwo'],
    ['6V2', 'vwo'],
    ['6 gymnasium', 'vwo'],
    ['H5a', 'havo'],
    ['havo 5', 'havo'],
    ['5 havo', 'havo'],
    ['4 mavo', 'tl'],
    ['vmbo-tl 4', 'tl'],
    ['4 kader', 'kb'],
    ['BB4', 'bb'],
    ['4KB2', 'kb'],
  ])('%s → %s', (klas, niveau) => {
    expect(herkenNiveau(klas)).toBe(niveau);
  });

  it.each(['5 vwo', '4 vwo', '4 havo', '3 mavo', '4B', '4T', '', null])('%s is geen examenjaar', (klas) => {
    expect(herkenNiveau(klas)).toBeNull();
  });
});

describe('standaardSoort: hoe een vak meetelt', () => {
  it('lichamelijke opvoeding telt niet mee met een cijfer', () => {
    expect(standaardSoort('Lichamelijke opvoeding', 'vwo')).toBe('niet');
    expect(standaardSoort('Lichamelijke opvoeding', 'tl')).toBe('niet');
  });
  it('havo/vwo: maatschappijleer en profielwerkstuk horen bij het combinatiecijfer', () => {
    expect(standaardSoort('Maatschappijleer', 'havo')).toBe('combi');
    expect(standaardSoort('Profielwerkstuk', 'vwo')).toBe('combi');
  });
  it('vmbo: maatschappijleer is alleen een schoolexamen, CKV krijgt geen cijfer', () => {
    expect(standaardSoort('Maatschappijleer', 'tl')).toBe('se');
    expect(standaardSoort('CKV', 'kb')).toBe('niet');
  });
  it('een gewoon vak heeft een centraal examen', () => {
    expect(standaardSoort('Wiskunde B', 'vwo')).toBe('ce');
  });
});

describe('berekenSlagen: CE nodig voor een 6', () => {
  it('rekent 11 − SE uit, met één decimaal', () => {
    const r = uitslag({ Nederlands: 6.0, Engels: 7.3, Biologie: 4.4 });
    const nodig = Object.fromEntries(r.vakken.map((v) => [v.naam, v.ceNodig]));
    expect(nodig).toEqual({ Nederlands: 5.0, Engels: 3.7, Biologie: 6.6 });
  });
  it('kan niet meer als je meer dan een 10 nodig hebt', () => {
    expect(uitslag({ Biologie: 0.8 }).vakken[0].ceNodig).toBeNull();
  });
});

describe('berekenSlagen: havo en vwo', () => {
  it('alles 6 of hoger: op koers', () => {
    expect(uitslag({ Nederlands: 6.4, Engels: 7.1, 'Wiskunde B': 6.0, Biologie: 7.3 }).stand).toBe('goed');
  });
  it('één 5 mag', () => {
    expect(uitslag({ Nederlands: 6.4, Engels: 7.1, 'Wiskunde B': 6.0, Biologie: 5.2 }).stand).toBe('letop');
  });
  it('twee 5\'en buiten de kernvakken met een gemiddelde van 6,0 of hoger: let op', () => {
    expect(uitslag({ Nederlands: 7, Engels: 7, 'Wiskunde A': 7, Geschiedenis: 8, Biologie: 5, Aardrijkskunde: 5 }).stand).toBe('letop');
  });
  it('twee 5\'en met een gemiddelde onder de 6,0: niet', () => {
    expect(uitslag({ Nederlands: 6, Engels: 6, 'Wiskunde A': 6, Biologie: 5, Aardrijkskunde: 5 }).stand).toBe('niet');
  });
  it('twee 5\'en bij de kernvakken: niet', () => {
    const r = uitslag({ Nederlands: 5.2, Engels: 5.0, 'Wiskunde A': 8, Geschiedenis: 8, Economie: 8 });
    expect(r.stand).toBe('niet');
    expect(r.tekst.join(' ')).toMatch(/hooguit één een 5/);
  });
  it('een 4 bij wiskunde (kernvak): niet', () => {
    const r = uitslag({ Nederlands: 7, Engels: 7, 'Wiskunde B': 4.2, Biologie: 8, Scheikunde: 8 });
    expect(r.stand).toBe('niet');
    expect(r.tekst.join(' ')).toMatch(/geen 4 of lager/);
  });
  it('lager dan een 4: niet', () => {
    expect(uitslag({ Nederlands: 7, Engels: 7, Biologie: 3.2 }).stand).toBe('niet');
  });
  it('drie onvoldoendes: niet', () => {
    expect(uitslag({ Nederlands: 8, Engels: 8, Biologie: 5, Aardrijkskunde: 5, Geschiedenis: 5 }).stand).toBe('niet');
  });
  it('maatschappijleer en profielwerkstuk vormen samen het combinatiecijfer', () => {
    const r = uitslag({ Nederlands: 7, Maatschappijleer: 7, Profielwerkstuk: 8 });
    expect(r.combi?.delen).toEqual(['Maatschappijleer', 'Profielwerkstuk']);
    expect(r.combi?.eind).toBe(8); // (7 + 8) / 2 = 7,5 → 8
  });
});

describe('berekenSlagen: vmbo', () => {
  it('één 4 met de rest 6 of hoger en minstens één 7: let op', () => {
    expect(uitslag({ Nederlands: 6, Engels: 7, Wiskunde: 4.2, Biologie: 6 }, 'tl').stand).toBe('letop');
  });
  it('één 4 zonder een 7: niet', () => {
    expect(uitslag({ Nederlands: 6, Engels: 6, Wiskunde: 4.2, Biologie: 6 }, 'tl').stand).toBe('niet');
  });
  it('een 4 en een 5 samen mag op het vmbo niet', () => {
    expect(uitslag({ Nederlands: 7, Engels: 7, Wiskunde: 4.2, Biologie: 5.0 }, 'kb').stand).toBe('niet');
  });
  it('Nederlands moet minstens een 5 zijn', () => {
    const r = uitslag({ Nederlands: 4.2, Engels: 8, Wiskunde: 8, Biologie: 8 }, 'tl');
    expect(r.stand).toBe('niet');
    expect(r.tekst.join(' ')).toMatch(/Nederlands/);
  });
});
