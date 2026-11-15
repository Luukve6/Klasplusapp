import { Link } from 'react-router-dom';
import { GraduationCap, Paperclip, PencilLine } from 'lucide-react';
import type { Afspraak } from '../../api';
import { tijdvak } from '../../lib/datum';
import { useInstellingen } from '../../lib/instellingen';
import { metHoofdletter } from '../../lib/tekst';
import { lesLink, toetsIdVan } from '../../lib/leerplan';
import { LesLabel } from './LesLabel';
import type { Tussenuur } from './tussenuren';
import './agenda.css';
import '../les/les.css';

/** "AK – KNNW – H5.AK4" → "KNNW". Alleen bij lessen; een eigen afspraak heeft geen docent. */
function docentCode(a: Afspraak): string | null {
  if (a.labels.includes('eigen')) return null;
  const delen = a.omschrijving.split(' – ');
  return delen.length >= 3 ? delen[1] : null;
}

/** De twee regels tekst, in de weergave die de leerling in Instellingen koos. */
function regels(a: Afspraak, modern: boolean): [string, string] {
  const tijd = a.heleDag ? 'Hele dag' : tijdvak(a.start, a.einde);
  if (modern) {
    // "Aardrijkskunde" / "09:00 – 09:45 · S252 · KNNW"
    const titel = a.vak && !a.labels.includes('eigen') ? metHoofdletter(a.vak) : a.omschrijving;
    return [titel, [tijd, a.lokaal, docentCode(a)].filter(Boolean).join(' · ')];
  }
  // Klassiek: "AK – KNNW – H5.AK4 (S252)" / "09:00 – 09:45"
  return [a.lokaal ? `${a.omschrijving} (${a.lokaal})` : a.omschrijving, tijd];
}

/**
 * Ingepland met Klas+ (of herkend aan de titel, als het van de schoolsite komt): leren voor een toets,
 * of huiswerk maken. Die krijgen een icoontje in het uurvakje in plaats van een leeg vakje.
 */
function soortVan(a: Afspraak): 'leren' | 'maken' | null {
  if (a.lesuur) return null;
  if (a.labels.includes('leren')) return 'leren';
  const titel = a.omschrijving;
  if (a.labels.includes('eigen') && (toetsIdVan(a) || (titel.startsWith('Huiswerk voor ') && titel.endsWith(' maken')))) {
    return 'maken';
  }
  return null;
}

/**
 * Eén les in de lijst: links het uurnummer in een vierkantje, dan twee regels tekst, rechts de labels.
 * `bezig`: de les van nu (of in de pauze de volgende); dan krijgt de rij een lichte tint.
 */
export function LesRij({ afspraak, bezig }: { afspraak: Afspraak; bezig?: boolean }) {
  const { agenda } = useInstellingen();
  const [titel, onder] = regels(afspraak, agenda === 'modern');
  const soort = soortVan(afspraak);

  return (
    <Link
      to={lesLink(afspraak)}
      className={`lesrij lesrij--link${bezig ? ' lesrij--nu' : ''}`}
      aria-current={bezig ? 'time' : undefined}
    >
      {/* Zonder lesuur (bijvoorbeeld een persoonlijke afspraak) blijft het vierkantje leeg, zodat alles netjes uitlijnt. */}
      <div
        className={`lesrij__uur${afspraak.lesuur ? '' : ' lesrij__uur--leeg'}`}
        aria-label={afspraak.lesuur ? `${afspraak.lesuur}e uur` : undefined}
      >
        {soort === 'leren' ? (
          <GraduationCap size={19} strokeWidth={2.2} aria-hidden="true" />
        ) : soort === 'maken' ? (
          <PencilLine size={18} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          (afspraak.lesuur ?? '')
        )}
      </div>
      <div className="lesrij__tekst">
        <span className="lesrij__titel">
          {titel}
          {afspraak.heeftBijlagen && <Paperclip className="paperclip" size={13} strokeWidth={2.2} aria-label="met bijlage" />}
        </span>
        <span className="lesrij__tijd">{onder}</span>
      </div>
      {afspraak.labels.length > 0 && (
        <div className="lesrij__labels">
          {afspraak.labels.map((l) => (
            <LesLabel key={l} label={l} afgerond={afspraak.afgerond} />
          ))}
        </div>
      )}
    </Link>
  );
}

/** Een tussenuur: een lesuur zonder les tussen twee lessen in. Rustig en niet aanklikbaar. */
export function TussenuurRij({ tussenuur }: { tussenuur: Tussenuur }) {
  const { uren } = tussenuur;
  const aantal = uren.length;
  return (
    <div className="lesrij lesrij--tussen">
      <div className="lesrij__uur lesrij__uur--tussen" aria-hidden="true">
        {aantal === 1 ? uren[0] : `${uren[0]}-${uren[aantal - 1]}`}
      </div>
      <div className="lesrij__tekst">
        <span className="lesrij__titel">{aantal === 1 ? 'Tussenuur' : `${aantal} tussenuren`}</span>
        <span className="lesrij__tijd">{tussenuur.tijd}</span>
      </div>
    </div>
  );
}
