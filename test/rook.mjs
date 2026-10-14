// Rooktest van de server met Node's ingebouwde WebSocket. Gebruik: node test/rook.mjs (met de lokale Worker op 8790).
const URL = 'ws://127.0.0.1:8790/live';
const { CODES, REGIA_PIN } = await import('../src/spel.js');
const codes = Object.keys(CODES);

function verbind(naam) {
  return new Promise((ok) => {
    const ws = new WebSocket(URL);
    const inbox = [];
    ws.onmessage = (e) => { if (e.data !== 'pong') inbox.push(JSON.parse(e.data)); };
    ws.onopen = () => ok({ ws, inbox, naam, stuur: (m) => ws.send(JSON.stringify(m)) });
  });
}
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const laatste = (c, t) => [...c.inbox].reverse().find((m) => m.t === t);
const fouten = [];
const check = (ok, wat) => { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten.push(wat); };

// Begin schoon
const schoon = await verbind('schoon');
schoon.stuur({ t: 'hallo', rol: 'regia', pin: REGIA_PIN }); await wacht(150);
schoon.stuur({ t: 'opnieuw' }); await wacht(150); schoon.ws.close();

const tv = await verbind('tv'); tv.stuur({ t: 'hallo', rol: 'scherm' }); await wacht(200);
const koppel = laatste(tv, 'koppel');
check(koppel && /^\d{4}$/.test(koppel.code), 'tv krijgt koppelcode ' + (koppel && koppel.code));

const regia = await verbind('regia');
regia.stuur({ t: 'hallo', rol: 'regia', pin: '000000' }); await wacht(150);
check(laatste(regia, 'fout')?.reden === 'pin', 'verkeerde pin geweigerd');
regia.stuur({ t: 'hallo', rol: 'regia', pin: REGIA_PIN }); await wacht(150);
const welkomR = laatste(regia, 'welkom');
check(welkomR && welkomR.token, 'regia aangemeld met token');
check(laatste(regia, 'staat')?.staat?.status?.tv?.wacht === true, 'regia ziet dat er een tv op koppeling wacht');
regia.stuur({ t: 'koppel', code: '0000' }); await wacht(150);
check(laatste(regia, 'fout')?.reden === 'koppelcode', 'verkeerde koppelcode geweigerd');
regia.stuur({ t: 'koppel', code: koppel.code }); await wacht(200);
const welkomTv = laatste(tv, 'welkom');
check(welkomTv && welkomTv.token, 'tv gekoppeld');
check(laatste(regia, 'staat')?.staat?.status?.tv?.verbonden === 1, 'regia ziet 1 gekoppelde tv');

const p = [];
for (let i = 0; i < 3; i++) {
  const c = await verbind('speler' + i);
  c.stuur({ t: 'hallo', rol: 'speler', code: codes[i].toLowerCase().split('').join(' ') });
  p.push(c);
}
const fout = await verbind('fout'); fout.stuur({ t: 'hallo', rol: 'speler', code: 'ZZZZZZ' });
await wacht(250);
check(p.every((c) => laatste(c, 'welkom')?.speler?.id), 'drie spelers aangemeld (code met spaties en kleine letters): ' + p.map((c) => laatste(c, 'welkom')?.speler?.voor).join(', '));
check(laatste(fout, 'fout')?.reden === 'code', 'onbekende code geweigerd');
check(laatste(regia, 'staat')?.staat?.status?.spelers?.length === 3, 'regia telt 3 spelers');
check(p[0].inbox.filter((m) => m.t === 'staat').every((m) => !m.staat.status && !m.staat.scherm), 'spelers krijgen alleen de deuren te zien');

regia.stuur({ t: 'deur', deur: 'archivio', open: true }); await wacht(200);
check(p.every((c) => laatste(c, 'staat')?.staat?.deuren?.archivio === true), 'archivio gaat open op alle telefoons');
regia.stuur({ t: 'deur', deur: 'kelder', open: true }); await wacht(100);
check(laatste(p[0], 'staat')?.staat?.deuren?.kelder === undefined, 'onbekende deur genegeerd');
p[1].stuur({ t: 'deur', deur: 'sala', open: true }); await wacht(150);
check(laatste(p[0], 'staat')?.staat?.deuren?.sala === false, 'speler kan geen deur openen');

regia.stuur({ t: 'scherm', scene: 'video', video: 'uitnodiging' }); await wacht(200);
const sc = laatste(tv, 'staat')?.staat?.scherm;
check(sc?.scene === 'video' && sc.video === 'uitnodiging', 'tv krijgt opdracht: video uitnodiging');
regia.stuur({ t: 'scherm', scene: 'video', video: 'bestaatniet' }); await wacht(100);
check(laatste(tv, 'staat')?.staat?.scherm?.video === 'uitnodiging', 'onbekende video genegeerd');
tv.stuur({ t: 'tv', geluid: true, speelt: 'uitnodiging', geladen: 1 }); await wacht(150);
const st = laatste(regia, 'staat')?.staat?.status?.tv;
check(st?.geluid && st.speelt === 'uitnodiging' && st.geladen === 1, 'regia ziet: geluid aan, speelt uitnodiging, 1 video geladen');
tv.stuur({ t: 'tv', geluid: true, speelt: '', geladen: 1, einde: sc.nonce }); await wacht(200);
check(laatste(regia, 'staat')?.staat?.scherm?.scene === 'wacht', 'na afloop terug naar wachtscherm');

p[2].ws.close(); await wacht(300);
check(laatste(regia, 'staat')?.staat?.status?.spelers?.length === 2, 'regia telt 2 spelers nadat er een wegging');

const tv2 = await verbind('tv2'); tv2.stuur({ t: 'hallo', rol: 'scherm', token: welkomTv.token }); await wacht(150);
check(laatste(tv2, 'welkom')?.rol === 'scherm', 'tv komt terug met zijn token, zonder opnieuw te koppelen');
const r2 = await verbind('r2'); r2.stuur({ t: 'hallo', rol: 'regia', token: welkomR.token }); await wacht(150);
check(laatste(r2, 'welkom')?.rol === 'regia', 'regia komt terug met token');
const r3 = await verbind('r3'); r3.stuur({ t: 'hallo', rol: 'regia', token: 'nep' }); await wacht(150);
check(laatste(r3, 'fout')?.reden === 'token', 'nep-token geweigerd');

regia.stuur({ t: 'zegel', fam: 'morelli', aan: true }); await wacht(200);
check(laatste(regia, 'staat')?.staat?.zegels?.morelli === true, 'regia zet het zegel van Morelli');
check(laatste(tv2, 'staat')?.staat?.zegels?.morelli === true, 'de tv weet van het zegel van Morelli');
check(p.every((c) => c.inbox.filter((m) => m.t === 'staat').every((m) => m.staat.zegels === undefined)), 'spelers zien de zegels van Il Pavone niet');
regia.stuur({ t: 'zegel', fam: 'falcone', aan: true }); await wacht(100);
check(laatste(regia, 'staat')?.staat?.zegels?.falcone === undefined, 'onbekende familie genegeerd');
p[0].stuur({ t: 'zegel', fam: 'caruso', aan: true }); await wacht(150);
check(laatste(regia, 'staat')?.staat?.zegels?.caruso === false, 'speler kan geen zegel zetten');
regia.stuur({ t: 'opnieuw' }); await wacht(200);
check(laatste(p[0], 'staat')?.staat?.deuren?.archivio === false, 'opnieuw beginnen sluit de deuren weer');
check(laatste(regia, 'staat')?.staat?.zegels?.morelli === false, 'opnieuw beginnen wist de zegels');

for (const c of [tv, regia, ...p, fout, tv2, r2, r3]) try { c.ws.close(); } catch (e) {}
console.log(fouten.length ? `\n${fouten.length} FOUT(EN)` : '\nalles in orde');
process.exit(fouten.length ? 1 : 0);
