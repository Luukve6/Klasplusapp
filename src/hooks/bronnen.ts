// De gegevens achter Agenda, Huiswerk en Cijfers, op één plek. Zo delen Agenda en Huiswerk hetzelfde
// geheugen (dezelfde weken), en kan omlaag vegen op de ene pagina de andere meteen mee verversen.
import { api } from '../api';
import { maandagVan, plusDagen } from '../lib/datum';
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
