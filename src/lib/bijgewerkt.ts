// Eén "Bijgewerkt op …" voor de hele app, bij de tabbalk (op Agenda, Huiswerk en Cijfers). Elke bron
// (rooster en cijfers) meldt hier wanneer hij is opgehaald; de balk toont de nieuwste tijd, of "Offline"
// als het laatste ophalen van een bron mislukte. Zo verspringt de balk niet meer bij het wisselen van tab.
import { useSyncExternalStore } from 'react';
import type { Resultaat } from '../api';

export type Bron = 'weken' | 'cijfers';

interface Stand {
  op: string;
  offline: boolean;
}

let standen: Partial<Record<Bron, Stand>> = {};
let weergave: { op: string; offline: boolean } | null = null;
const luisteraars = new Set<() => void>();

function herbereken() {
  const lijst = Object.values(standen);
  const offline = lijst.filter((s) => s.offline);
  if (lijst.length === 0) weergave = null;
  // Offline: de oudste stand die we nog hebben, zodat de balk nooit nieuwer lijkt dan hij is.
  else if (offline.length) weergave = { op: offline.map((s) => s.op).sort()[0], offline: true };
  else weergave = { op: lijst.map((s) => s.op).sort().at(-1)!, offline: false };
  luisteraars.forEach((l) => l());
}

/** Een bron is (opnieuw) opgehaald. Een ouder resultaat (uit het geheugen) maakt de tijd niet ouder. */
export function meldBijgewerkt(bron: Bron, r: Resultaat<unknown>) {
  const oud = standen[bron];
  if (!r.offline && oud && !oud.offline && r.opgehaaldOp < oud.op) return;
  standen = { ...standen, [bron]: { op: r.opgehaaldOp, offline: !!r.offline } };
  herbereken();
}

/** Bij uitloggen of een ander kind: geen tijd van het vorige account laten staan. */
export function vergeetBijgewerkt() {
  standen = {};
  herbereken();
}

export function useBijgewerkt() {
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => luisteraars.delete(l);
    },
    () => weergave,
  );
}

// ---- Alles tegelijk verversen (omlaag vegen) ----

type Verversers = Partial<Record<Bron, () => Promise<unknown>>>;
let verversers: Verversers = {};

/** De datalaag (hooks/useLaden) geeft hier door hoe elke bron ververst wordt. */
export function zetVerversers(v: Verversers) {
  verversers = v;
}

/**
 * Omlaag vegen op Agenda, Huiswerk of Cijfers: alles opnieuw ophalen. `eigen` is de verversing van
 * de pagina zelf (die weet welke week hij toont); de andere bronnen gaan ernaast, met de stand van nu.
 */
export async function verversAlles(eigen: () => Promise<void>, bron: Bron): Promise<void> {
  const anderen = (Object.keys(verversers) as Bron[]).filter((b) => b !== bron).map((b) => verversers[b]!());
  await Promise.allSettled([eigen(), ...anderen]);
}
