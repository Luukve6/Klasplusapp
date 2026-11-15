import type { Cijfer } from '../../api';
import { isOnvoldoende, toonCijfer } from '../../lib/cijfers';
import { korteDatum } from '../../lib/datum';
import './cijfers.css';

/** `nieuw`: vandaag binnengekomen; dan staat er een groen lijntje links van het vak. */
export function CijferRij({ cijfer, nieuw = false }: { cijfer: Cijfer; nieuw?: boolean }) {
  return (
    <div className={`cijferrij${nieuw ? ' cijferrij--nieuw' : ''}`}>
      <div className="cijferrij__tekst">
        <span className="cijferrij__vak">{cijfer.vak.naam}</span>
        <span className="cijferrij__toets">
          {cijfer.omschrijving} · {korteDatum(cijfer.datum)}
        </span>
      </div>
      <div className="cijferrij__rechts">
        <span className={`cijferrij__cijfer${isOnvoldoende(cijfer.waarde) ? ' onvoldoende' : ''}`}>
          {toonCijfer(cijfer)}
        </span>
        <span className="cijfer__klein">weging {cijfer.weging}</span>
        {nieuw && <span className="visueel-verborgen">, nieuw</span>}
      </div>
    </div>
  );
}
