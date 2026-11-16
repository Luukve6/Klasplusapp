// Meldingen zonder server: de app kijkt zelf (bij openen, bij terugkomen en af en toe op de
// achtergrond) of er iets nieuws is, en zet dan een melding op het toestel. Huiswerkherinneringen
// worden vooruit ingepland. Er gaat niets naar een server van Klas+; die bestaat niet.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BackgroundFetch } from '@transistorsoft/capacitor-background-fetch';
import { api, type Afspraak } from '../api';
import { beginVanDag, dagNaam, naarInvoer, plusDagen } from './datum';
import { leesInstellingen } from './instellingen';
import { lees, schrijf, verwijder } from './opslag';
import { ochtendMelding } from './ochtendmelding';
import { metHoofdletter } from './tekst';
import { isAndroid, Ochtend } from './ochtendNative';
import { alleLeerplannen, isMaken, lerenTitel, notitieVan } from './leerplan';
import { opMoment } from '../components/les/Invoerrij';

/** Alleen in de telefoon-app; in de browser (demo) kan het niet. */
export const kanNotificaties = Capacitor.isNativePlatform();

const GEZIENE_CIJFERS = 'notificaties.cijfers';
/** Wanneer Klas+ voor het laatst heeft gekeken, en of dat op de achtergrond was. */
const LAATSTE = 'notificaties.laatste';
/**
 * Android: een eigen kanaal met hoge prioriteit, zodat meldingen bovenin verschijnen en geluid maken
 * (het standaardkanaal van de plugin staat op een lagere stand). iOS negeert dit.
 */
const KANAAL = 'klasplus';
const ROOSTER = 'notificaties.rooster';
const VOLGNUMMER = 'notificaties.volgnummer';
/** Huiswerkherinneringen krijgen vaste nummers, zodat we ze steeds kunnen vervangen. */
const HUISWERK_EERSTE = 5000;
const HUISWERK_DAGEN = 8;
/** Ochtendmeldingen ook met vaste nummers: vandaag en de dagen erna. */
const OCHTEND_EERSTE = 6000;
const OCHTEND_DAGEN = 8;
/** Leerherinneringen: een vast blok nummers, zodat we ze elke keer helemaal kunnen vervangen. */
const LEREN_EERSTE = 7000;
const LEREN_MAX = 200;

/** Een uniek nummer per melding (Android wil een geheel getal). */
function volgnummer(): number {
  const n = ((lees<number>(VOLGNUMMER) ?? 10_000) % 4_000_000) + 1;
  schrijf(VOLGNUMMER, n);
  return n + 10_000;
}

/** Vraagt de telefoon om meldingen te mogen tonen. True als het mag. */
export async function vraagToestemming(): Promise<boolean> {
  if (!kanNotificaties) return false;
  const nu = await LocalNotifications.checkPermissions();
  if (nu.display === 'granted') return true;
  const antwoord = await LocalNotifications.requestPermissions();
  return antwoord.display === 'granted';
}

async function stuur(meldingen: { titel: string; tekst: string; pad: string }[]) {
  if (meldingen.length === 0) return;
  await LocalNotifications.schedule({
    notifications: meldingen.map((m) => ({
      id: volgnummer(),
      title: m.titel,
      body: m.tekst,
      channelId: KANAAL,
      extra: { pad: m.pad },
    })),
  });
}

/** "dinsdag 3e uur Engels" */
function lesInWoorden(a: Afspraak): string {
  const vandaag = beginVanDag(new Date());
  const dag = beginVanDag(new Date(a.start));
  const wanneer =
    dag.getTime() === vandaag.getTime() ? 'vandaag' : dag.getTime() === plusDagen(vandaag, 1).getTime() ? 'morgen' : dagNaam(dag);
  const vak = metHoofdletter(a.vak ?? a.omschrijving);
  return `${metHoofdletter(wanneer)}${a.lesuur ? ` ${a.lesuur}e uur` : ''} ${vak}`;
}

// ---- Nieuwe cijfers ----

async function controleerCijfers() {
  const resultaat = await api.cijfers();
  if (resultaat.offline) return;
  const bekend = lees<string[]>(GEZIENE_CIJFERS);
  const ids = resultaat.data.map((c) => c.id);
  schrijf(GEZIENE_CIJFERS, ids);
  // De eerste keer alles onthouden, zonder melding: anders zou elk bestaand cijfer "nieuw" zijn.
  if (!bekend) return;
  const oud = new Set(bekend);
  const nieuw = resultaat.data.filter((c) => !oud.has(c.id));
  if (nieuw.length > 4) {
    return stuur([{ titel: `${nieuw.length} nieuwe cijfers`, tekst: [...new Set(nieuw.map((c) => c.vak.naam))].join(', '), pad: '/cijfers' }]);
  }
  await stuur(
    nieuw.map((c) => ({
      titel: `Nieuw cijfer voor ${metHoofdletter(c.vak.naam)}`,
      tekst: `${c.omschrijving}: ${c.weergave}`,
      pad: '/cijfers',
    })),
  );
}

// ---- Vervallen of gewijzigde uren ----

/** Per les wat we de vorige keer zagen: "v" vervallen, "g" gewijzigd, "" gewoon. */
type RoosterStand = Record<string, string>;

const standVan = (a: Afspraak) => (a.labels.includes('vervalt') ? 'v' : a.labels.includes('gewijzigd') ? 'g' : '');

async function controleerRooster() {
  const vandaag = beginVanDag(new Date());
  // Vanaf een week terug: nodig om te zien of docent of lokaal echt anders is dan normaal.
  const resultaat = await api.afspraken(plusDagen(vandaag, -7), plusDagen(vandaag, HUISWERK_DAGEN));
  if (resultaat.offline) return;
  const nu = Date.now();
  const komend = resultaat.data.filter((a) => new Date(a.start).getTime() > nu && !a.labels.includes('eigen'));
  const vorige = lees<RoosterStand>(ROOSTER);
  const stand: RoosterStand = Object.fromEntries(komend.map((a) => [a.id, standVan(a)]));
  schrijf(ROOSTER, stand);
  if (!vorige) return;

  const meldingen = komend
    .filter((a) => stand[a.id] && stand[a.id] !== vorige[a.id])
    .map((a) =>
      stand[a.id] === 'v'
        ? { titel: 'Uur vervalt', tekst: lesInWoorden(a), pad: '/' }
        : {
            titel: 'Les gewijzigd',
            tekst: [lesInWoorden(a), a.lokaal ? `lokaal ${a.lokaal}` : '', a.docenten.join(', ')].filter(Boolean).join(' · '),
            pad: '/',
          },
    );
  await stuur(meldingen.slice(0, 6));
}

// ---- Huiswerkherinneringen ----

const TAAK = new Set(['huiswerk', 'proefwerk', 'tentamen', 'so', 'mondeling']);
const soortTekst: Record<string, string> = { proefwerk: 'proefwerk', tentamen: 'tentamen', so: 'SO', mondeling: 'mondeling' };

const wisHuiswerk = () =>
  LocalNotifications.cancel({ notifications: Array.from({ length: HUISWERK_DAGEN }, (_, i) => ({ id: HUISWERK_EERSTE + i })) });

async function planHuiswerk(aan: boolean, tijdstip: string) {
  if (!aan) return wisHuiswerk();
  const vandaag = beginVanDag(new Date());
  // Eerst de nieuwe stand ophalen; pas als dat lukt de oude herinneringen vervangen.
  const resultaat = await api.afspraken(vandaag, plusDagen(vandaag, HUISWERK_DAGEN));
  await wisHuiswerk();
  const [uur, minuut] = tijdstip.split(':').map(Number);
  const meldingen = [];
  for (let i = 1; i < HUISWERK_DAGEN; i++) {
    const dag = plusDagen(vandaag, i);
    const taken = resultaat.data.filter(
      (a) =>
        naarInvoer(new Date(a.start)) === naarInvoer(dag) &&
        !a.afgerond &&
        !a.labels.includes('vervalt') &&
        a.labels.some((l) => TAAK.has(l)),
    );
    if (taken.length === 0) continue;
    // Op de avond ervoor, om het gekozen tijdstip.
    const moment = plusDagen(dag, -1);
    moment.setHours(uur, minuut, 0, 0);
    if (moment.getTime() <= Date.now()) continue;
    const lijst = taken.map((a) => {
      const soort = a.labels.find((l) => soortTekst[l]);
      return `${metHoofdletter(a.vak ?? a.omschrijving)}${soort ? ` (${soortTekst[soort]})` : ''}`;
    });
    meldingen.push({
      id: HUISWERK_EERSTE + i,
      title: `Huiswerk voor ${i === 1 ? 'morgen' : dagNaam(dag)}`,
      body: [...new Set(lijst)].join(', '),
      schedule: { at: moment, allowWhileIdle: true },
      channelId: KANAAL,
      extra: { pad: '/huiswerk' },
    });
  }
  if (meldingen.length) await LocalNotifications.schedule({ notifications: meldingen });
}

// ---- Ochtendmelding ----

const wisOchtend = async () => {
  if (isAndroid) await Ochtend.wis().catch(() => undefined);
  await LocalNotifications.cancel({
    notifications: Array.from({ length: OCHTEND_DAGEN }, (_, i) => ({ id: OCHTEND_EERSTE + i })),
  });
};

/**
 * Plant voor elke dag met lessen een melding op het gekozen tijdstip, met de stand van nu. Elke keer
 * dat Klas+ kijkt (openen, achtergrond) worden ze vervangen, zodat een latere wijziging erin komt.
 *
 * Bewust niets op de achtergrond buiten de app om (geen eigen ophaalactie op Android, geen extra iOS-taak):
 * daarbij werd de inlogsleutel vernieuwd zonder dat de app het wist, en moest je steeds opnieuw inloggen.
 * Ochtend.wis() en het stoppen van de iOS-taak ruimen op wat een eerdere versie nog had ingepland.
 */
async function planOchtend(aan: boolean, tijdstip: string) {
  if (!aan) return wisOchtend();
  const vandaag = beginVanDag(new Date());
  // Vanaf een week terug: daarmee ziet de app of docent of lokaal echt anders is dan normaal.
  const resultaat = await api.afspraken(plusDagen(vandaag, -7), plusDagen(vandaag, OCHTEND_DAGEN));
  await wisOchtend();
  const [uur, minuut] = tijdstip.split(':').map(Number);
  const meldingen = [];
  for (let i = 0; i < OCHTEND_DAGEN; i++) {
    const dag = plusDagen(vandaag, i);
    const moment = new Date(dag);
    moment.setHours(uur, minuut, 0, 0);
    if (moment.getTime() <= Date.now()) continue;
    const melding = ochtendMelding(resultaat.data.filter((a) => naarInvoer(new Date(a.start)) === naarInvoer(dag)));
    if (!melding) continue;
    meldingen.push({
      id: OCHTEND_EERSTE + i,
      title: melding.titel,
      body: melding.tekst,
      schedule: { at: moment, allowWhileIdle: true },
      channelId: KANAAL,
      extra: { pad: '/' },
    });
  }
  if (meldingen.length) await LocalNotifications.schedule({ notifications: meldingen });
}

/** iPhone: de extra ochtendtaak van versie 0.1.18 weer weghalen. */
const OCHTEND_TAAK = 'com.transistorsoft.ochtend';
const stopOchtendTaak = () => BackgroundFetch.stop(OCHTEND_TAAK).catch(() => undefined);

// ---- Leerherinneringen ----

const wisLeren = () =>
  LocalNotifications.cancel({ notifications: Array.from({ length: LEREN_MAX }, (_, i) => ({ id: LEREN_EERSTE + i })) });

/**
 * Een melding op elk leermoment (leren voor een toets of huiswerk maken) dat nog moet komen. Ze staan
 * vooruit ingepland op het toestel, dus ze komen ook als Klas+ dicht is; op Android op de precieze tijd
 * zolang "Op de precieze tijd" aan staat. Elke keer dat Klas+ kijkt, worden ze helemaal vervangen, zodat
 * een verschoven of verwijderd moment klopt.
 */
async function planLeren(aan: boolean) {
  await wisLeren();
  if (!aan) return;
  const meldingen = [];
  for (const p of Object.values(alleLeerplannen())) {
    for (const m of p.momenten) {
      const moment = opMoment(m.datum, m.tijd);
      if (!m.aan || moment.getTime() <= Date.now() || meldingen.length >= LEREN_MAX) continue;
      const notitie = notitieVan(p, m);
      meldingen.push({
        id: LEREN_EERSTE + meldingen.length,
        title: lerenTitel(p),
        body:
          notitie ||
          `${isMaken(p) ? 'Huiswerk' : p.soort} voor ${dagNaam(new Date(p.toetsStart)).toLowerCase()}. Je had ${m.duur ?? p.duur} minuten gepland.`,
        schedule: { at: moment, allowWhileIdle: true },
        channelId: KANAAL,
        extra: { pad: `/leren/${encodeURIComponent(p.toetsId)}` },
      });
    }
  }
  if (meldingen.length) await LocalNotifications.schedule({ notifications: meldingen });
}

// ---- Alles samen ----

let bezig: Promise<void> | null = null;
let laatste = 0;

/**
 * Kijkt naar alles wat aan staat. Hooguit één keer tegelijk, en bij terugkomen in de app niet vaker
 * dan eens per 10 minuten (`altijd` slaat die wachttijd over, voor de achtergrond en na een instelling).
 */
export function controleerNu(altijd = false, opAchtergrond = false): Promise<void> {
  if (!kanNotificaties || !api.heeftSessie()) return Promise.resolve();
  if (bezig) return bezig;
  if (!altijd && Date.now() - laatste < 10 * 60_000) return Promise.resolve();
  laatste = Date.now();
  const n = leesInstellingen().notificaties;
  bezig = (async () => {
    const toegestaan = (await LocalNotifications.checkPermissions()).display === 'granted';
    if (!toegestaan) return;
    // Elk onderdeel los: als er één mislukt (geen verbinding), gaan de andere gewoon door.
    if (n.cijfers) await controleerCijfers().catch(() => undefined);
    if (n.rooster) await controleerRooster().catch(() => undefined);
    await planHuiswerk(n.huiswerk, n.huiswerkTijd).catch(() => undefined);
    await planOchtend(n.ochtend, n.ochtendTijd).catch(() => undefined);
    await planLeren(n.leren).catch(() => undefined);
    schrijf(LAATSTE, { op: new Date().toISOString(), achtergrond: opAchtergrond });
  })().finally(() => {
    bezig = null;
  });
  return bezig;
}

/** Bij uitloggen: alles van het vorige account vergeten en ingeplande herinneringen weghalen. */
export async function wisNotificaties() {
  verwijder(GEZIENE_CIJFERS);
  verwijder(ROOSTER);
  if (kanNotificaties) {
    await wisHuiswerk().catch(() => undefined);
    await wisOchtend().catch(() => undefined);
    await wisLeren().catch(() => undefined);
  }
}

let gestart = false;

/**
 * Eén keer bij het opstarten: tik op een melding opent de juiste pagina, controleer bij terugkomen
 * in de app, en laat de telefoon de app af en toe op de achtergrond wekken (iOS en Android bepalen
 * zelf hoe vaak; meestal elk kwartier tot een paar keer per dag, en niet als je de app wegveegt).
 */
export async function startNotificaties() {
  if (!kanNotificaties || gestart) return;
  gestart = true;

  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: KANAAL,
      name: 'Klas+',
      description: 'Nieuwe cijfers, roosterwijzigingen en herinneringen',
      importance: 4,
      visibility: 1,
      vibration: true,
    }).catch(() => undefined);
  }

  await LocalNotifications.addListener('localNotificationActionPerformed', (actie) => {
    const pad = actie.notification.extra?.pad;
    if (typeof pad === 'string') window.location.hash = `#${pad}`;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void controleerNu();
  });

  await BackgroundFetch.configure(
    {
      minimumFetchInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: false,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
    },
    async (taak) => {
      await controleerNu(true, true).catch(() => undefined);
      BackgroundFetch.finish(taak);
    },
    async (taak) => {
      BackgroundFetch.finish(taak);
    },
  ).catch(() => undefined);
  if (Capacitor.getPlatform() === 'ios') void stopOchtendTaak();

  void controleerNu(true);
}

// ---- Status en testen (Instellingen › Meldingen) ----

export interface MeldingStatus {
  /** Mag Klas+ meldingen tonen? */
  toestemming: boolean;
  /** Android: mogen meldingen op de precieze tijd komen? null op iPhone (daar altijd). */
  preciezeTijd: boolean | null;
  /** Wanneer Klas+ voor het laatst keek, en of dat op de achtergrond was. */
  laatste: { op: string; achtergrond: boolean } | null;
  /** Android: staat Klas+ bij de batterij op "Onbeperkt"? null op iPhone. */
  batterijOnbeperkt: boolean | null;
}

export async function meldingStatus(): Promise<MeldingStatus> {
  const laatste = lees<{ op: string; achtergrond: boolean }>(LAATSTE);
  if (!kanNotificaties) return { toestemming: false, preciezeTijd: null, laatste, batterijOnbeperkt: null };
  const toestemming = (await LocalNotifications.checkPermissions()).display === 'granted';
  let preciezeTijd: boolean | null = null;
  if (Capacitor.getPlatform() === 'android') {
    preciezeTijd = await LocalNotifications.checkExactNotificationSetting()
      .then((s) => s.exact_alarm === 'granted')
      .catch(() => null);
  }
  const batterijOnbeperkt = isAndroid
    ? await Ochtend.batterij()
        .then((b) => b.onbeperkt)
        .catch(() => null)
    : null;
  return { toestemming, preciezeTijd, laatste, batterijOnbeperkt };
}

/** Android: vraagt of Klas+ op de achtergrond mag draaien (batterij "Onbeperkt"). */
export async function vraagBatterij(): Promise<void> {
  if (isAndroid) await Ochtend.vraagBatterij();
}

/**
 * Android 12 en nieuwer: zonder deze toestemming mag de telefoon een ingeplande melding (ochtend,
 * huiswerk) uitstellen, soms lang. Opent het scherm in de instellingen van de telefoon.
 */
export async function vraagPreciezeTijd(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.changeExactNotificationSetting();
}

/** Een melding over vijf seconden, om te zien of meldingen aankomen. */
export async function stuurTestmelding(): Promise<void> {
  if (!kanNotificaties) throw new Error('Meldingen werken alleen in de app op je telefoon.');
  if (!(await vraagToestemming())) throw new Error('Klas+ mag nog geen meldingen sturen.');
  await LocalNotifications.schedule({
    notifications: [
      {
        id: volgnummer(),
        title: 'Testmelding',
        body: 'Meldingen van Klas+ komen aan.',
        channelId: KANAAL,
        schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      },
    ],
  });
}
