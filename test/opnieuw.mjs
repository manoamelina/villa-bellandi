// Zet de lokale villa terug op het begin: deuren en lades dicht, fase I. Gebruik: node test/opnieuw.mjs
const { REGIA_PIN } = await import('../src/spel.js');
const ws = new WebSocket('ws://127.0.0.1:8790/live');
await new Promise((ok) => { ws.onopen = ok; });
ws.send(JSON.stringify({ t: 'hallo', rol: 'regia', pin: REGIA_PIN }));
await new Promise((r) => setTimeout(r, 250));
ws.send(JSON.stringify({ t: 'opnieuw' }));
await new Promise((r) => setTimeout(r, 250));
ws.close();
console.log('villa opnieuw begonnen');
process.exit(0);
