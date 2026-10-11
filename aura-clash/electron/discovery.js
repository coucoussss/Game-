// Découverte automatique des parties sur le réseau local (UDP broadcast).
// L'hôte émet une balise par seconde ; les joueurs qui cherchent une partie écoutent le port BEACON_PORT.
const dgram = require('dgram');
const { BEACON_PORT, broadcastAddresses } = require('./netUtils');

class Discovery {
  constructor() {
    this.beaconSocket = null;
    this.beaconTimer = null;
    this.listenSocket = null;
    this.listenTimer = null;
    this.servers = new Map();
  }

  /** Commence à annoncer la partie. `getInfo` renvoie l'état courant (nombre de joueurs…). */
  startBeacon(getInfo) {
    this.stopBeacon();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.beaconSocket = sock;
    sock.on('error', () => {}); // une interface sans diffusion ne doit pas faire planter l'hôte
    sock.bind(0, () => {
      try { sock.setBroadcast(true); } catch { /* ignoré */ }
      const emit = () => {
        const info = getInfo();
        if (!info) return;
        const buf = Buffer.from(JSON.stringify(info));
        for (const addr of broadcastAddresses()) {
          sock.send(buf, BEACON_PORT, addr, () => {});
        }
      };
      emit();
      this.beaconTimer = setInterval(emit, 1000);
    });
  }

  stopBeacon() {
    clearInterval(this.beaconTimer);
    this.beaconTimer = null;
    if (this.beaconSocket) {
      try { this.beaconSocket.close(); } catch { /* déjà fermé */ }
      this.beaconSocket = null;
    }
  }

  /** Écoute les balises ; `onList` reçoit la liste des parties chaque seconde. */
  startListening(onList) {
    this.stopListening();
    this.servers.clear();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.listenSocket = sock;
    sock.on('error', () => { onList([]); });
    sock.on('message', (buf, rinfo) => {
      let info;
      try { info = JSON.parse(buf.toString('utf8')); } catch { return; }
      if (!info || info.game !== 'aura-clash') return;
      const key = `${rinfo.address}:${info.port}`;
      this.servers.set(key, { ...info, address: rinfo.address, seen: Date.now() });
      onList(this.list());
    });
    sock.bind(BEACON_PORT);
    this.listenTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, s] of this.servers) if (now - s.seen > 3500) this.servers.delete(k);
      onList(this.list());
    }, 1000);
  }

  list() {
    return [...this.servers.values()].map(({ seen, ...rest }) => rest);
  }

  stopListening() {
    clearInterval(this.listenTimer);
    this.listenTimer = null;
    if (this.listenSocket) {
      try { this.listenSocket.close(); } catch { /* déjà fermé */ }
      this.listenSocket = null;
    }
  }
}

module.exports = { Discovery };
