// Génère l'icône de l'application (build/icon.png, 256×256) par code : une flamme d'aura
// dorée sur fond sombre. Encodeur PNG minimal (zlib de Node), aucune dépendance.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = 256;
const px = Buffer.alloc(S * S * 4);

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const u = (x - S / 2) / (S / 2);
    const v = (y - S / 2) / (S / 2);
    const r = Math.hypot(u, v);
    const i = (y * S + x) * 4;
    // Disque de fond aux bords arrondis
    const inside = r < 0.96 ? 1 : r < 1 ? (1 - r) / 0.04 : 0;
    // Flamme : silhouette en goutte, ondulée
    const fy = (v + 1) / 2; // 0 en haut, 1 en bas
    const width = 0.55 * Math.pow(Math.max(0, fy - 0.08), 0.8) * (1 - Math.max(0, fy - 0.75) * 2.6);
    const wave = Math.sin(fy * 14 + u * 3) * 0.04;
    const flame = Math.max(0, 1 - Math.abs(u + wave) / Math.max(0.001, width));
    const core = Math.max(0, 1 - Math.abs(u + wave) / Math.max(0.001, width * 0.45));
    const bgR = 18 + 30 * (1 - r), bgG = 14 + 10 * (1 - r), bgB = 40 + 60 * (1 - r);
    const fr = 255, fg = 150 + 90 * core, fb = 30 + 200 * core * core;
    const a = Math.min(1, flame * 2.2);
    px[i] = clamp(bgR * (1 - a) + fr * a);
    px[i + 1] = clamp(bgG * (1 - a) + fg * a);
    px[i + 2] = clamp(bgB * (1 - a) + fb * a);
    px[i + 3] = clamp(255 * inside);
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'icon.png'), png);
console.log('Icône générée : build/icon.png');
