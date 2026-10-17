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

// de fase van de avond
regia.stuur({ t: 'fase', fase: 'riunione' }); await wacht(200);
check(laatste(regia, 'staat')?.staat?.fase === 'riunione', 'regia zet de fase op La Riunione');
check(laatste(tv2, 'staat')?.staat?.fase === 'riunione', 'de tv kent de fase');
check(p.every((c) => c.inbox.filter((m) => m.t === 'staat').every((m) => m.staat.fase === undefined)), 'telefoons van spelers krijgen de fase niet');
regia.stuur({ t: 'fase', fase: 'feest' }); await wacht(100);
check(laatste(regia, 'staat')?.staat?.fase === 'riunione', 'onbekende fase genegeerd');
p[0].stuur({ t: 'fase', fase: 'sentenza' }); await wacht(150);
check(laatste(regia, 'staat')?.staat?.fase === 'riunione', 'speler kan de fase niet zetten');
regia.stuur({ t: 'deur', deur: 'archivio', open: true }); await wacht(200);
check(laatste(tv2, 'staat')?.staat?.fase === 'archivio', 'Archivio openen brengt de avond naar L’Archivio');
regia.stuur({ t: 'fase', fase: 'sala' }); await wacht(150);
regia.stuur({ t: 'deur', deur: 'archivio', open: false }); await wacht(100);
regia.stuur({ t: 'deur', deur: 'archivio', open: true }); await wacht(200);
check(laatste(tv2, 'staat')?.staat?.fase === 'sala', 'een deur zet de fase nooit terug');

// het archief: alleen de familiehoofden, Sebastiano en Caterina; de antwoorden blijven op de server
const { LADES } = await import('../src/lades.js');
const arch = (c) => laatste(c, 'staat')?.staat?.archief;
check(arch(p[0])?.mag === true && arch(p[1])?.mag === false, 'Alessandro mag in het archief, Marco niet');
p[1].stuur({ t: 'lade', nr: 1, cijfer: LADES[1].antwoord }); await wacht(150);
check(arch(regia)?.open?.[1] === false, 'Marco kan geen lade openen');
regia.stuur({ t: 'deur', deur: 'archivio', open: false }); await wacht(150);
p[0].stuur({ t: 'lade', nr: 1, cijfer: LADES[1].antwoord }); await wacht(150);
check(arch(regia)?.open?.[1] === false, 'met de deur dicht gaat geen lade open');
regia.stuur({ t: 'deur', deur: 'archivio', open: true }); await wacht(150);
p[0].stuur({ t: 'lade', nr: 0, cijfer: (LADES[0].antwoord + 1) % 10 }); await wacht(200);
check(arch(regia)?.fout?.[0] === 1 && arch(regia)?.klem?.[0] > 10000, 'fout antwoord: lade I klemt 15 seconden');
check(arch(p[0])?.cijfers?.[0] === null && arch(p[0])?.regels?.[0] === '', 'een dichte lade verraadt zijn cijfer niet');
p[0].stuur({ t: 'lade', nr: 0, cijfer: LADES[0].antwoord }); await wacht(200);
check(arch(regia)?.open?.[0] === false, 'zolang het slot klemt, helpt ook het goede cijfer niet');
p[0].stuur({ t: 'lade', nr: 1, cijfer: LADES[1].antwoord }); await wacht(200);
check(arch(p[0])?.open?.[1] === true && arch(p[0])?.cijfers?.[1] === LADES[1].antwoord && arch(p[0])?.regels?.[1] === LADES[1].regel, 'goed antwoord: lade II gaat open, met cijfer en onthulling');
check(arch(tv2)?.open?.[1] === true && arch(tv2)?.cijfers?.[1] === LADES[1].antwoord, 'de tv ziet lade II open');
regia.stuur({ t: 'tip', nr: 2, aan: true }); await wacht(200);
check(arch(p[0])?.tips?.[2] === LADES[2].tip, 'de hint van Donna Serafina komt aan bij lade III');
check(!JSON.stringify(p[1].inbox).includes(LADES[2].tip) && !JSON.stringify(p[1].inbox).includes(LADES[1].regel), 'Marco krijgt geen hint en geen onthulling');
regia.stuur({ t: 'lade', nr: 2, open: true }); await wacht(200);
check(arch(p[0])?.open?.[2] === true, 'Donna Serafina opent lade III zelf');
p[0].stuur({ t: 'lade', nr: 5, cijfer: 1 }); p[0].stuur({ t: 'lade', nr: 0, cijfer: 'x' }); await wacht(150);
check(arch(regia)?.open?.[0] === false && arch(regia)?.fout?.[0] === 1, 'onzin wordt genegeerd');

regia.stuur({ t: 'opnieuw' }); await wacht(200);
check(arch(regia)?.open?.every((o) => !o) && arch(regia)?.tips?.every((t) => !t) && arch(regia)?.fout?.every((f) => f === 0), 'opnieuw beginnen sluit de lades en haalt de hints weg');
check(laatste(tv2, 'staat')?.staat?.fase === 'benvenuto', 'opnieuw beginnen zet de fase op Il Benvenuto');
check(laatste(p[0], 'staat')?.staat?.deuren?.archivio === false, 'opnieuw beginnen sluit de deuren weer');
check(laatste(regia, 'staat')?.staat?.zegels?.morelli === false, 'opnieuw beginnen wist de zegels');

// Uitloggen: de Regia verliest zijn toegang; het oude token werkt daarna niet meer, de pincode wel.
const uit = await verbind('uit');
uit.stuur({ t: 'hallo', rol: 'regia', pin: REGIA_PIN }); await wacht(150);
const oudToken = laatste(uit, 'welkom')?.token;
uit.stuur({ t: 'uitloggen' }); await wacht(150);
check(!!oudToken && !!laatste(uit, 'uitgelogd'), 'Regia uitgelogd');
uit.stuur({ t: 'deur', deur: 'sala', open: true }); await wacht(150);
check(laatste(regia, 'staat')?.staat?.deuren?.sala === false, 'na uitloggen kan die verbinding niets meer');
const terug = await verbind('terug');
terug.stuur({ t: 'hallo', rol: 'regia', token: oudToken }); await wacht(150);
check(laatste(terug, 'fout')?.reden === 'token', 'het oude token werkt niet meer');
terug.stuur({ t: 'hallo', rol: 'regia', pin: REGIA_PIN }); await wacht(150);
check(!!laatste(terug, 'welkom')?.token && laatste(terug, 'welkom').token !== oudToken, 'met de pincode kom je er weer in');
check(!!welkomR?.token && (() => { regia.stuur({ t: 'fase', fase: 'riunione' }); return true; })(), 'andere Regia blijft ingelogd');
await wacht(150);
check(laatste(regia, 'staat')?.staat?.fase === 'riunione', 'de andere Regia kan nog steeds bedienen');
regia.stuur({ t: 'opnieuw' }); await wacht(150);

for (const c of [tv, regia, ...p, fout, tv2, r2, r3, uit, terug]) try { c.ws.close(); } catch (e) {}
console.log(fouten.length ? `\n${fouten.length} FOUT(EN)` : '\nalles in orde');
process.exit(fouten.length ? 1 : 0);
