// Jeu en ligne : salons hébergés par le serveur Cloudflare (dossier online/).
// L'adresse du serveur est fixée au build ; `?server=wss://…` dans l'URL (ou le stockage local)
// permet d'en essayer une autre.

export const ONLINE_SERVER = 'wss://aura-clash-online.REMPLACER.workers.dev';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 (faciles à confondre)

export function serverUrl() {
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q) { localStorage.setItem('auraclash.server', q); return q; }
    const s = localStorage.getItem('auraclash.server');
    if (s) return s;
  } catch { /* stockage ou URL indisponibles */ }
  return ONLINE_SERVER;
}

export function onlineConfigured() {
  return !serverUrl().includes('REMPLACER');
}

export function randomCode() {
  let c = '';
  const r = new Uint32Array(5);
  crypto.getRandomValues(r);
  for (const v of r) c += CODE_CHARS[v % CODE_CHARS.length];
  return c;
}

/** Normalise un code saisi (majuscules, sans espaces) ; null s'il est invalide. */
export function parseCode(text) {
  const c = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{5}$/.test(c) ? c : null;
}

export function roomUrl(code) {
  return `${serverUrl().replace(/\/+$/, '')}/r/${code}`;
}

export const ONLINE_ERRORS = {
  timeout: 'Le serveur en ligne ne répond pas. Vérifie ta connexion Internet.',
  error: 'Connexion au serveur en ligne impossible (connexion Internet, ou réseau qui bloque les WebSockets).',
};
