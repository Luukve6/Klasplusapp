import { bijgewerkt } from '../../lib/datum';
import { useBijgewerkt } from '../../lib/bijgewerkt';
import './ui.css';

/**
 * Smalle balk boven de tabbalk: "Bijgewerkt op 28-10 om 15:22", of "Offline · bijgewerkt op …".
 * Eén tijd voor de hele app (zie lib/bijgewerkt.ts), dus hij verspringt niet bij het wisselen van tab.
 */
export function BijgewerktBalk() {
  const stand = useBijgewerkt();
  if (!stand) return null;
  return (
    <div className="bijgewerkt-balk" role="status">
      {stand.offline ? 'Offline · bijgewerkt' : 'Bijgewerkt'} op {bijgewerkt(stand.op)}
    </div>
  );
}
