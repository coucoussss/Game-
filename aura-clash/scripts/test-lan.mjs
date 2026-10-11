// Test du serveur LAN embarqué (sans Electron) : connexion de l'hôte avec son jeton, arrivée
// d'invités, relais des messages dans les deux sens, ping, refus quand la partie a commencé.
import { createRequire } from 'node:module';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const { LanServer } = require('../electron/lanServer.js');

const server = new LanServer();
const info = await server.start({ port: 41290, name: 'Test' });
const url = `ws://127.0.0.1:${info.port}`;
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? '✔' : '✘'} ${label}`); if (!ok) failures++; };

function client(name, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      const i = waiters.findIndex((w) => w.type === m.type);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else inbox.push(m);
    });
    const api = {
      ws,
      send: (o) => ws.send(JSON.stringify(o)),
      next: (type, ms = 2000) => {
        const i = inbox.findIndex((m) => m.type === type);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const w = { type, resolve: res };
          waiters.push(w);
          setTimeout(() => rej(new Error(`attente de « ${type} » expirée`)), ms);
        });
      },
    };
    ws.on('open', () => { api.send({ type: 'hello', name, token, protocol: 1 }); resolve(api); });
    ws.on('error', reject);
  });
}

try {
  const host = await client('Hôte', info.token);
  const w0 = await host.next('welcome');
  check(w0.isHost === true, 'l’hôte est reconnu grâce à son jeton');

  const a = await client('Alice');
  const wa = await a.next('welcome');
  check(wa.isHost === false && wa.id > 0, 'un invité reçoit un identifiant');
  const join = await host.next('join');
  check(join.name === 'Alice' && join.id === wa.id, 'l’hôte est prévenu de l’arrivée');

  a.send({ type: 'pick', charId: 'ren' });
  const pick = await host.next('pick');
  check(pick.from === wa.id && pick.charId === 'ren', 'message invité → hôte relayé avec l’expéditeur');

  host.send({ type: 'lobby', players: [] });
  check((await a.next('lobby')).type === 'lobby', 'message hôte → invités diffusé');

  a.send({ type: 'ping', t: 123 });
  check((await a.next('pong')).t === 123, 'le serveur répond aux pings');

  host.send({ type: 'start', cfg: {} });
  await a.next('start');
  const late = await client('Bob');
  const rej = await late.next('reject');
  check(/commencé/.test(rej.reason), 'refus d’un joueur quand le combat a commencé');

  check(server.beaconInfo().players === 2 && server.beaconInfo().inGame, 'balise de découverte à jour');

  a.ws.close();
  const leave = await host.next('leave');
  check(leave.id === wa.id, 'l’hôte est prévenu d’un départ');
  host.ws.close();
  late.ws.close();
} catch (err) {
  console.error('✘', err.message);
  failures++;
}
await server.stop();
if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log('Serveur LAN OK');
