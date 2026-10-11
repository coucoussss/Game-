// Crée release/AuraClash-<version>-windows.zip : le .exe portable, le guide et le script pare-feu.
// Petit écrivain ZIP (deflate de Node + CRC32), sans dépendance, utilisable sous Windows, macOS ou Linux.
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const exeName = `AuraClash-${pkg.version}-portable.exe`;
const exePath = join(root, 'release', exeName);
if (!existsSync(exePath)) {
  console.error(`Fichier introuvable : release/${exeName}\nLance d'abord « npm run build ».`);
  process.exit(1);
}
const entries = [
  [exePath, exeName],
  [join(root, 'LISEZMOI.txt'), 'LISEZMOI.txt'],
  [join(root, 'firewall.bat'), 'firewall.bat'],
];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const locals = [];
const centrals = [];
let offset = 0;
for (const [path, name] of entries) {
  if (!existsSync(path)) continue;
  const data = readFileSync(path);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const { time, date } = dosTime(statSync(path).mtime);
  const nameBuf = Buffer.from(name, 'utf8');
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
  lh.writeUInt16LE(8, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
  locals.push(lh, nameBuf, comp);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(time, 12);
  ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(offset, 42);
  centrals.push(ch, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
  console.log(`  + ${name} (${(data.length / 1048576).toFixed(1)} Mo)`);
}
const central = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
const out = join(root, 'release', `AuraClash-${pkg.version}-windows.zip`);
writeFileSync(out, Buffer.concat([...locals, central, end]));
console.log(`Archive prête : release/${basename(out)}`);
