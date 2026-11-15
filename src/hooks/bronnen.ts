// De gegevens achter Agenda, Huiswerk en Cijfers, op één plek. Zo delen Agenda en Huiswerk hetzelfde
// geheugen (dezelfde weken), en kan omlaag vegen op de ene pagina de andere meteen mee verversen.
import { api } from '../api';
import { maandagVan, naarInvoer, plusDagen } from '../lib/datum';
import { lees } from '../lib/opslag';
import { zetVerversers } from '../lib/bijgewerkt';
import { vulGeheugen } from './useLaden';

/** Een week plus de week ervoor en erna: bij het vegen staat de buurweek al klaar. */
export const laadWeken = (maandag: Date) => api.afspraken(plusDagen(maandag, -7), plusDagen(maandag, 14));

zetVerversers({
  weken: () => {
    const maandag = maandagVan(new Date());
    return laadWeken(maandag).then((r) => vulGeheugen('weken', [maandag.getTime()], r));
  },
  cijfers: () =>
    Promise.all([
      api.cijfers().then((r) => vulGeheugen('cijfers', [], r)),
      api.profiel().then((r) => vulGeheugen('profiel', [], r)),
    ]),
});

/**
 * Bij het opstarten: meteen de gegevens van de vorige keer laten zien (rooster van deze week, cijfers en
 * profiel), in plaats van grijze laadblokken tot school antwoordt. Ze staan al op de telefoon; de pagina
 * haalt daarna gewoon verse op. De balk "Bijgewerkt op" toont zolang eerlijk de tijd van die oude stand.
 */
function vulVanVorigeKeer() {
  const maandag = maandagVan(new Date());
  const cache = (sleutel: string) => lees<unknown>(`cache.${sleutel}`);
  const weken = cache(`afspraken.${naarInvoer(plusDagen(maandag, -7))}.${naarInvoer(plusDagen(maandag, 14))}`);
  if (weken) vulGeheugen('weken', [maandag.getTime()], weken);
  const cijfers = cache('cijfers');
  if (cijfers) vulGeheugen('cijfers', [], cijfers);
  const profiel = cache('profiel');
  if (profiel) vulGeheugen('profiel', [], profiel);
}
vulVanVorigeKeer();
