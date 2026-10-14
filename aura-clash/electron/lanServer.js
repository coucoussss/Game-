// Serveur LAN embarqué dans le .exe : salon + relais WebSocket.
//
// Modèle « hôte autoritaire » : la fenêtre du joueur qui crée la partie se connecte elle aussi à ce
// serveur (avec un jeton secret) et fait tourner la simulation. Le serveur :
//   - accepte jusqu'à 4 joueurs et attribue les identifiants ;
//   - transmet les messages des invités (entrées, choix de personnage) à l'hôte ;
//   - diffuse les messages de l'hôte (états du jeu) aux invités ;
//   - répond directement aux pings pour mesurer la latence.
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { LAN_PORT } = require('./netUtils');

const PROTOCOL = 2; // doit correspondre à NET_PROTOCOL (src/net/session.js)
const MAX_PLAYERS = 4;

class LanServer {
  constructor() {
    this.http = null;
    this.wss = null;
    this.clients = new Map(); // id -> { id, ws, name, isHost, alive }
    this.nextId = 1;
    this.hostToken = null;
    this.port = 0;
    this.name = 'Partie';
    this.inGame = false;
    this.heartbeat = null;
  }

  get running() {
    return !!this.wss;
  }

  /** Démarre le serveur (essaie les ports suivants si le port est occupé). */
  async start({ port = LAN_PORT, name = 'Partie' } = {}) {
    if (this.running) return this.info();
    this.name = String(name).slice(0, 24) || 'Partie';
    this.hostToken = crypto.randomBytes(16).toString('hex');
    this.nextId = 1;
    this.inGame = false;
    let lastErr = null;
    for (let p = port; p < port + 10; p++) {
      try {
        await this.listen(p);
        return this.info();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Impossible d’ouvrir un port pour la partie.');
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        // Page de diagnostic : http://IP:41234 dans un navigateur confirme que le pare-feu laisse passer.
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Aura Clash — serveur LAN actif (${this.clients.size}/${MAX_PLAYERS} joueurs)\n`);
      });
      const onError = (err) => { srv.close(); reject(err); };
      srv.once('error', onError);
      srv.listen(port, '0.0.0.0', () => {
        srv.off('error', onError);
        this.http = srv;
        this.port = port;
        this.wss = new WebSocketServer({ server: srv, maxPayload: 1 << 20 });
        this.wss.on('connection', (ws) => this.onConnection(ws));
        this.heartbeat = setInterval(() => this.checkAlive(), 5000);
        resolve();
      });
    });
  }

  info() {
    return { port: this.port, token: this.hostToken, protocol: PROTOCOL };
  }

  beaconInfo() {
    if (!this.running) return null;
    return {
      game: 'aura-clash',
      protocol: PROTOCOL,
      name: this.name,
      port: this.port,
      players: this.clients.size,
      max: MAX_PLAYERS,
      inGame: this.inGame,
    };
  }

  host() {
    for (const c of this.clients.values()) if (c.isHost) return c;
    return null;
  }

  sendTo(client, obj) {
    if (client && client.ws.readyState === 1) client.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }

  onConnection(ws) {
    const client = { id: 0, ws, name: '?', isHost: false, alive: true, ready: false };
    ws.on('pong', () => { client.alive = true; });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      this.onMessage(client, msg);
    });
    ws.on('close', () => this.onClose(client));
    ws.on('error', () => {});
    // Sans « hello » dans les 5 s, la connexion est fermée.
    setTimeout(() => { if (!client.ready) ws.terminate(); }, 5000);
  }

  onMessage(client, msg) {
    if (!client.ready) {
      if (msg.type !== 'hello') return;
      const isHost = msg.token === this.hostToken && !this.host();
      if (!isHost) {
        let reason = null;
        if (msg.protocol !== PROTOCOL) reason = 'Version du jeu différente de celle de l’hôte.';
        else if (!this.host()) reason = 'La partie n’est pas encore prête.';
        else if (this.inGame) reason = 'La partie a déjà commencé.';
        else if (this.clients.size >= MAX_PLAYERS) reason = 'La partie est complète (4 joueurs).';
        if (reason) {
          this.sendTo(client, { type: 'reject', reason });
          setTimeout(() => client.ws.close(), 100);
          return;
        }
      }
      client.ready = true;
      client.isHost = isHost;
      client.id = this.nextId++;
      client.name = String(msg.name || 'Joueur').slice(0, 16);
      this.clients.set(client.id, client);
      this.sendTo(client, { type: 'welcome', id: client.id, isHost, serverName: this.name });
      if (!isHost) this.sendTo(this.host(), { type: 'join', id: client.id, name: client.name });
      return;
    }

    if (msg.type === 'ping') {
      this.sendTo(client, { type: 'pong', t: msg.t });
      return;
    }

    if (client.isHost) {
      if (msg.type === 'start') this.inGame = true;
      if (msg.type === 'lobby') this.inGame = false;
      if (msg.type === 'kick' && this.clients.has(msg.id)) {
        const target = this.clients.get(msg.id);
        this.sendTo(target, { type: 'reject', reason: msg.reason || 'Exclu par l’hôte.' });
        setTimeout(() => target.ws.close(), 100);
        return;
      }
      const raw = JSON.stringify(msg);
      if (msg.to != null) {
        this.sendTo(this.clients.get(msg.to), raw);
      } else {
        for (const c of this.clients.values()) if (!c.isHost) this.sendTo(c, raw);
      }
    } else {
      msg.from = client.id;
      this.sendTo(this.host(), msg);
    }
  }

  onClose(client) {
    if (!client.ready) return;
    this.clients.delete(client.id);
    if (client.isHost) {
      // L'hôte est parti : la partie s'arrête pour tout le monde.
      for (const c of this.clients.values()) {
        this.sendTo(c, { type: 'hostLeft' });
        c.ws.close();
      }
      this.clients.clear();
    } else {
      this.sendTo(this.host(), { type: 'leave', id: client.id });
    }
  }

  checkAlive() {
    for (const c of this.clients.values()) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* fermé */ }
    }
  }

  async stop() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const c of this.clients.values()) {
      try { c.ws.close(); } catch { /* ignoré */ }
    }
    this.clients.clear();
    const wss = this.wss;
    const srv = this.http;
    this.wss = null;
    this.http = null;
    if (wss) await new Promise((r) => wss.close(() => r()));
    if (srv) await new Promise((r) => srv.close(() => r()));
  }
}

module.exports = { LanServer, PROTOCOL, MAX_PLAYERS };
