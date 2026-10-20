// Petit serveur statique pour tester le jeu dans un navigateur (sans Electron, donc sans hébergement LAN).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const port = Number(process.env.PORT) || 8080;
createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = normalize(join(dist, url === '/' ? 'index.html' : url));
  if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Introuvable');
  }
}).listen(port, () => console.log(`Aura Clash : http://localhost:${port}`));
