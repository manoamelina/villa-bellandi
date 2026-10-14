// Blijft de staat bewaard als de server herstart? Gebruik: node test/bewaren.mjs zet  →  herstart  →  node test/bewaren.mjs lees
const { REGIA_PIN } = await import('../src/spel.js');
const ws = new WebSocket('ws://127.0.0.1:8790/live');
const actie = process.argv[2];
let klaar = false;
ws.onopen = () => ws.send(JSON.stringify({ t: 'hallo', rol: 'regia', pin: REGIA_PIN }));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t !== 'staat' || klaar) return;
  klaar = true;
  if (actie === 'zet') {
    ws.send(JSON.stringify({ t: 'deur', deur: 'sala', open: true }));
    setTimeout(() => { console.log('sala open gezet'); process.exit(0); }, 300);
  } else {
    console.log('na herstart: sala open =', m.staat.deuren.sala);
    ws.send(JSON.stringify({ t: 'opnieuw' }));
    setTimeout(() => process.exit(m.staat.deuren.sala ? 0 : 1), 300);
  }
};
