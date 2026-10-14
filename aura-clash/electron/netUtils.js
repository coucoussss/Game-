// Utilitaires réseau : adresses IPv4 locales et adresses de diffusion (broadcast).
const os = require('os');

const LAN_PORT = 41234; // WebSocket (TCP) : la partie
const BEACON_PORT = 41235; // UDP : annonces pour la découverte automatique

function ipToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function intToIp(n) {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

function isPrivate(ip) {
  return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

/** Adresses IPv4 non internes, les adresses privées (LAN) en premier. */
function localIPv4s() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifaces)) {
    for (const it of list || []) {
      const v4 = it.family === 'IPv4' || it.family === 4;
      if (!v4 || it.internal) continue;
      out.push({ name, address: it.address, netmask: it.netmask });
    }
  }
  // Les cartes virtuelles (VirtualBox, VMware, WSL, Hyper-V) sont placées en dernier.
  const virtual = (n) => /virtual|vmware|vbox|vethernet|wsl|hyper-v|docker|loopback/i.test(n);
  out.sort((a, b) => {
    const score = (x) => (isPrivate(x.address) ? 0 : 2) + (virtual(x.name) ? 1 : 0);
    return score(a) - score(b);
  });
  return out;
}

/** Adresses de diffusion de chaque interface, plus la diffusion générale. */
function broadcastAddresses() {
  const set = new Set(['255.255.255.255']);
  for (const it of localIPv4s()) {
    if (!it.netmask) continue;
    const addr = ipToInt(it.address);
    const mask = ipToInt(it.netmask);
    set.add(intToIp((addr | (~mask >>> 0)) >>> 0));
  }
  return [...set];
}

module.exports = { LAN_PORT, BEACON_PORT, localIPv4s, broadcastAddresses };
