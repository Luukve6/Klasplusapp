import type { Afspraak } from '../../api';
import { nlTijd, tijdvak } from '../../lib/datum';

export interface Tussenuur {
  soort: 'tussenuur';
  /** Welke lesuren er niets is, bijvoorbeeld [4] of [4, 5]. */
  uren: number[];
  /** Voor de sleutel in de lijst. */
  start: string;
  /** "11:10 – 12:05": de normale tijd van die lesuren, of anders het gat tussen de lessen. */
  tijd: string;
}

/** Minuten sinds middernacht (Nederlandse tijd), om tijden van verschillende dagen te vergelijken. */
const minuten = (iso: string) => {
  const n = nlTijd(new Date(iso));
  return n.uur * 60 + n.minuut;
};

/**
 * Tussenuren op één dag: een lesuur zonder les, tussen twee lessen in. Een pauze is geen tussenuur:
 * daar lopen de uurnummers gewoon door (2e uur, pauze, 3e uur). Een blokuur (3e en 4e uur in één les)
 * ook niet: we kijken in de rest van de week hoe laat elk lesuur normaal begint, en tellen alleen een
 * lesuur dat in het gat valt. Vóór de eerste en na de laatste les tellen we niets: dan begin je later
 * of ben je eerder vrij.
 */
export function metTussenuren(lessen: Afspraak[], week: Afspraak[]): (Afspraak | Tussenuur)[] {
  // Hoe laat elk lesuur meestal begint, uit alle lessen van de geladen weken.
  const beginVan = new Map<number, number>();
  const eindeVan = new Map<number, number>();
  for (const a of week) {
    if (!a.lesuur || a.heleDag || beginVan.has(a.lesuur)) continue;
    beginVan.set(a.lesuur, minuten(a.start));
    eindeVan.set(a.lesuur, minuten(a.einde));
  }
  const klok = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const uit: (Afspraak | Tussenuur)[] = [];
  let vorige: Afspraak | null = null;
  for (const a of lessen) {
    const telt = !!a.lesuur && !a.heleDag && !a.labels.includes('eigen');
    if (telt && vorige && a.lesuur! > vorige.lesuur! + 1 && new Date(a.start) > new Date(vorige.einde)) {
      const van = minuten(vorige.einde);
      const tot = minuten(a.start);
      const uren: number[] = [];
      for (let u = vorige.lesuur! + 1; u < a.lesuur!; u++) {
        const begin = beginVan.get(u);
        // Onbekend lesuur: tellen als het gat lang genoeg is voor een les (een pauze is korter).
        if (begin === undefined ? tot - van >= 40 : begin >= van && begin < tot) uren.push(u);
      }
      if (uren.length) {
        const b = beginVan.get(uren[0]);
        const e = eindeVan.get(uren[uren.length - 1]);
        // Normale tijden van die lesuren, zolang ze in het gat passen (anders gewoon het gat zelf).
        const tijd =
          b !== undefined && e !== undefined && b >= van && e <= tot && b < e
            ? `${klok(b)} – ${klok(e)}`
            : tijdvak(vorige.einde, a.start);
        uit.push({ soort: 'tussenuur', uren, start: vorige.einde, tijd });
      }
    }
    uit.push(a);
    // De les ervoor: de laatst eindigende met een uurnummer (bij twee lessen tegelijk de langste).
    if (telt && (!vorige || new Date(a.einde) >= new Date(vorige.einde))) vorige = a;
  }
  return uit;
}

export const isTussenuur = (x: Afspraak | Tussenuur): x is Tussenuur => 'soort' in x && x.soort === 'tussenuur';
