import type { InputHTMLAttributes } from 'react';
import { korteDatumMetJaar } from '../../lib/datum';
import './ui.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { type: 'date' | 'time'; value: string };

/** "15 nov" (of "15 nov 2027" in een ander jaar), "19:00"; leeg blijft een streepje. */
function tekst(type: Props['type'], waarde: string): string {
  if (!waarde) return '-';
  return type === 'date' ? korteDatumMetJaar(`${waarde}T12:00:00`) : waarde.slice(0, 5);
}

/**
 * Datum- of tijdkiezer met de waarde altijd strak rechts, in het Nederlands. Elke telefoon tekent een
 * datumveld anders (iOS in het midden, Android links, soms Amerikaans), dus Klas+ toont de waarde zelf.
 * Daarover ligt het echte veld, onzichtbaar: tikken opent gewoon de kiezer van de telefoon.
 * `className` hoort bij het zichtbare veld (zoals invoerrij__veld); de rest gaat naar het echte veld.
 */
export function KiesVeld({ className = '', type, value, disabled, ...rest }: Props) {
  return (
    <span className={`kiesveld ${className}${disabled ? ' kiesveld--uit' : ''}`}>
      <span className="kiesveld__tekst" aria-hidden="true">
        {tekst(type, value)}
      </span>
      <input {...rest} type={type} value={value} disabled={disabled} className="kiesveld__invoer" />
    </span>
  );
}
