// Den vendrade OpenTimestamps-bundlen injiceras som klassiskt <script> av
// inlineOtsVendor-pluginen i vite.config.ts (se kommentaren där för varför den
// inte kan importeras som modul). Den sätter window.OpenTimestamps och har
// garanterat körts innan modulskriptet startar.
export function getOts(): OpenTimestampsApi {
  if (!window.OpenTimestamps) {
    throw new Error('The OpenTimestamps library failed to load.');
  }
  return window.OpenTimestamps;
}

// Bibliotekets stamp() väntar på ALLA kalenderservrar utan timeout, så en enda
// hängande server (t.ex. nere på TCP-nivå) hänger hela stampningen för evigt.
// Sondera därför först vilka kalendrar som alls svarar och skicka bara till dem.
const OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
  'https://ots.btc.catallaxy.com',
];

export async function reachableCalendars(): Promise<string[]> {
  // Sondera med en slumpmässig digest mot /digest — samma operation som
  // stampningen använder. En server kan svara på GET / men hänga på POST
  // (observerat med catallaxy), så bara ett riktigt POST-svar räknas.
  const junk = crypto.getRandomValues(new Uint8Array(32));
  const probes = OTS_CALENDARS.map(async url => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      // no-cors: vi bryr oss bara om att servern svarar, inte om innehållet.
      await fetch(url + '/digest', {
        method: 'POST',
        body: junk,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        mode: 'no-cors',
        signal: ctrl.signal,
      });
      return url;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
  const up = (await Promise.all(probes)).filter((url): url is string => url !== null);
  return up.length ? up : OTS_CALENDARS;
}

// Name the saved OpenTimestamps proof from the initial proof's filename so the
// timestamp stays identical: proof_<stamp>_initial.ots -> proof_<stamp>_opentimestamps.ots
export function opentimestampsProofName(otsName: string | null): string {
  if (otsName && /_opentimestamps\.ots$/i.test(otsName)) {
    return otsName;
  }
  if (otsName && /_initial\.ots$/i.test(otsName)) {
    return otsName.replace(/_initial\.ots$/i, '_opentimestamps.ots');
  }
  if (otsName && /\.ots$/i.test(otsName)) {
    return otsName.replace(/\.ots$/i, '_opentimestamps.ots');
  }
  return 'proof_opentimestamps.ots';
}
