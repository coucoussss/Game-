// Serveur en ligne d'Aura Clash (Cloudflare Worker + Durable Object).
//
// Même rôle que le serveur LAN du .exe (electron/lanServer.js), mais accessible depuis Internet :
// chaque salon est un Durable Object identifié par un code de 5 lettres. Le joueur qui crée le salon
// en est l'hôte autoritaire ; le serveur ne fait que relayer :
//   - messages des invités → hôte (avec `from`) ;
//   - messages de l'hôte → tous les invités (ou un seul avec `to`) ;
//   - pings : réponse immédiate par le serveur.
// Le Durable Object est créé près du premier joueur qui s'y connecte (l'hôte), ce qui garde court
// le trajet de la simulation. Les messages sont relayés tels quels, sans les redécoder.

const PROTOCOL = 2; // doit correspondre à NET_PROTOCOL (src/net/session.js)
const MAX_PLAYERS = 4;
const CODE_RE = /^[A-Z0-9]{5}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/r\/([A-Za-z0-9]{5})$/);
    if (!m) {
      return new Response('Aura Clash — serveur en ligne actif\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
      });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    const code = m[1].toUpperCase();
    if (!CODE_RE.test(code)) return new Response('Code invalide', { status: 400 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(req);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    // Répond aux pings sans réveiller l'objet : la mesure de latence reste exacte.
    // (Les pings du jeu contiennent un horodatage, on les traite donc dans webSocketMessage.)
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id: 0, ready: false, isHost: false, name: '?' });
    return new Response(null, { status: 101, webSocket: client });
  }

  meta(ws) {
    return ws.deserializeAttachment() || { id: 0, ready: false };
  }

  players() {
    return this.state.getWebSockets().filter((ws) => this.meta(ws).ready);
  }

  host() {
    return this.players().find((ws) => this.meta(ws).isHost) || null;
  }

  send(ws, data) {
    try { ws.send(data); } catch { /* fermé */ }
  }

  reject(ws, reason) {
    this.send(ws, JSON.stringify({ type: 'reject', reason }));
    try { ws.close(4000, 'reject'); } catch { /* déjà fermé */ }
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string') return;
    const me = this.meta(ws);
    if (me.ready) {
      // Chemin rapide : relais sans décodage complet quand c'est possible
      if (data.startsWith('{"type":"ping"')) {
        this.send(ws, '{"type":"pong"' + data.slice(14));
        return;
      }
      if (me.isHost) {
        if (data.startsWith('{"type":"snap"')) {
          for (const p of this.players()) if (p !== ws) this.send(p, data);
          return;
        }
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (msg.type === 'start') await this.state.storage.put('inGame', true);
        if (msg.type === 'lobby') await this.state.storage.put('inGame', false);
        if (msg.type === 'kick') {
          const target = this.players().find((p) => this.meta(p).id === msg.id);
          if (target) this.reject(target, msg.reason || 'Exclu par l’hôte.');
          return;
        }
        if (msg.to != null) {
          const target = this.players().find((p) => this.meta(p).id === msg.to);
          if (target) this.send(target, data);
        } else {
          for (const p of this.players()) if (p !== ws) this.send(p, data);
        }
      } else {
        const h = this.host();
        // On ajoute l'expéditeur sans redécoder le message : {"from":N,...}
        if (h && data.charCodeAt(0) === 123) this.send(h, `{"from":${me.id},${data.slice(1)}`);
      }
      return;
    }

    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || msg.type !== 'hello') return;
    const host = this.host();
    const wantsHost = !!msg.create;
    if (msg.protocol !== PROTOCOL) return this.reject(ws, 'Version du jeu différente de celle de l’hôte : mets le jeu à jour.');
    if (wantsHost && host) return this.reject(ws, 'code-taken');
    if (!wantsHost) {
      if (!host) return this.reject(ws, 'Aucun salon avec ce code.');
      if (await this.state.storage.get('inGame')) return this.reject(ws, 'La partie a déjà commencé.');
      if (this.players().length >= MAX_PLAYERS) return this.reject(ws, 'Le salon est complet (4 joueurs).');
    }
    if (wantsHost) await this.state.storage.put('inGame', false);
    const nextId = ((await this.state.storage.get('nextId')) || 1);
    await this.state.storage.put('nextId', nextId + 1);
    const info = { id: nextId, ready: true, isHost: wantsHost, name: String(msg.name || 'Joueur').slice(0, 16) };
    ws.serializeAttachment(info);
    this.send(ws, JSON.stringify({ type: 'welcome', id: info.id, isHost: info.isHost, serverName: `Salon ${msg.room || ''}`.trim() }));
    if (!wantsHost && host) this.send(host, JSON.stringify({ type: 'join', id: info.id, name: info.name }));
  }

  async webSocketClose(ws) {
    await this.left(ws);
  }

  async webSocketError(ws) {
    await this.left(ws);
  }

  async left(ws) {
    const me = this.meta(ws);
    if (!me.ready || me.gone) return;
    ws.serializeAttachment({ ...me, ready: false, gone: true });
    try { ws.close(1000, 'bye'); } catch { /* déjà fermé */ }
    if (me.isHost) {
      for (const p of this.players()) {
        this.send(p, '{"type":"hostLeft"}');
        try { p.close(1000, 'host left'); } catch { /* déjà fermé */ }
      }
      await this.state.storage.deleteAll();
    } else {
      const h = this.host();
      if (h) this.send(h, JSON.stringify({ type: 'leave', id: me.id }));
    }
  }
}
