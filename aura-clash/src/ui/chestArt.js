// Coffres dessinés en SVG, un style par rareté :
//   commun     : planches de bois, ferrures de fer, rivets
//   rare       : bois bleu nuit, bandes d'acier poli, saphir
//   épique     : laque violette, filets d'argent, cristaux améthyste qui percent le couvercle, runes
//   légendaire : or ciselé, rubis, couronne, rayons
//   mythique   : obsidienne fendue de magma, cornes, runes flottantes, flammes
// Le couvercle (.ch-lid) et la lumière intérieure (.ch-light) sont animés par le CSS (ouverture).

let uid = 0;

const PAL = {
  common: { body: ['#9a6a3e', '#6e4626', '#4a2e18'], band: ['#c9ccd2', '#7d828c', '#4e535c'], gem: ['#f2f2f2', '#9aa0aa'], glow: '#d8dde6', light: '#fff6dc' },
  rare: { body: ['#2f5a9a', '#1d3a6c', '#10223f'], band: ['#eef4ff', '#9fb4d6', '#5c7096'], gem: ['#bfe6ff', '#1f7cff'], glow: '#4aa8ff', light: '#cfe9ff' },
  epic: { body: ['#7a3ab8', '#4d1f80', '#2a0e4a'], band: ['#f2e9ff', '#b9a6d6', '#6e5a8e'], gem: ['#f6d8ff', '#b45cff'], glow: '#b45cff', light: '#f0d4ff' },
  legendary: { body: ['#ffe58a', '#e0a92a', '#8a5a0c'], band: ['#fff7d0', '#ffd23f', '#a8700c'], gem: ['#ffb0b8', '#e0102a'], glow: '#ffc23a', light: '#fff4c2' },
  mythic: { body: ['#3a2a3e', '#1a121e', '#070409'], band: ['#ff9a6a', '#ff3a1f', '#7a0a0a'], gem: ['#ffffff', '#ff2a5a'], glow: '#ff3a5a', light: '#ffd0a0' },
};

/** Étincelle à 4 branches. */
const spark = (x, y, s, cls = '') => `<path class="ch-spark ${cls}" d="M${x} ${y - s}L${x + s * 0.25} ${y - s * 0.25}L${x + s} ${y}L${x + s * 0.25} ${y + s * 0.25}L${x} ${y + s}L${x - s * 0.25} ${y + s * 0.25}L${x - s} ${y}L${x - s * 0.25} ${y - s * 0.25}Z"/>`;

/**
 * SVG d'un coffre. opts.open : couvercle déjà ouvert ; opts.cls : classes en plus.
 */
export function chestSvg(rarity = 'common', opts = {}) {
  const r = PAL[rarity] ? rarity : 'common';
  const p = PAL[r];
  const id = `c${++uid}`;
  const g = (n) => `${id}${n}`;
  const lvl = ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(r);

  // Planches (bois) ou motif du corps
  const planks = r === 'common' || r === 'rare'
    ? [0, 1, 2, 3].map((k) => `<line x1="${22 + k * 19}" y1="58" x2="${22 + k * 19}" y2="96" stroke="rgba(0,0,0,0.28)" stroke-width="1.2"/>`).join('')
      + `<path d="M24 66q8 -2 14 1M44 80q7 2 12 -1M66 70q6 -2 11 1M84 86q5 1 9 -2" stroke="rgba(0,0,0,0.18)" stroke-width="0.8" fill="none"/>`
    : '';
  // Filigrane (épique, légendaire)
  const filigree = lvl >= 2 && lvl <= 3
    ? `<path d="M30 76c6-10 14-10 16 0s10 10 14 0 10-10 14 0 10 10 16 0" fill="none" stroke="url(#${g('band')})" stroke-width="1.6" opacity="0.9"/>
       <path d="M30 88c5-6 10-6 13 0M77 88c3-6 8-6 13 0" fill="none" stroke="url(#${g('band')})" stroke-width="1.2" opacity="0.8"/>`
    : '';
  // Fissures de magma (mythique)
  const magma = r === 'mythic'
    ? `<g class="ch-magma"><path d="M24 62l8 9-4 7 9 9M98 60l-7 10 5 6-8 10M50 96l6-10 8 4 6-12" fill="none" stroke="#ff5a1f" stroke-width="2.2" stroke-linecap="round"/>
       <path d="M24 62l8 9-4 7 9 9M98 60l-7 10 5 6-8 10M50 96l6-10 8 4 6-12" fill="none" stroke="#ffd27a" stroke-width="0.8" stroke-linecap="round"/></g>`
    : '';
  // Cristaux (épique) qui percent le couvercle
  const crystals = r === 'epic'
    ? `<g class="ch-crystals"><path d="M34 34l5-16 5 16z" fill="url(#${g('gem')})" stroke="#f6d8ff" stroke-width="0.6"/>
       <path d="M80 36l7-20 6 20z" fill="url(#${g('gem')})" stroke="#f6d8ff" stroke-width="0.6"/>
       <path d="M88 38l3-9 3 9z" fill="url(#${g('gem')})"/><path d="M28 38l2-7 3 7z" fill="url(#${g('gem')})"/></g>`
    : '';
  // Couronne (légendaire)
  const crown = r === 'legendary'
    ? `<g class="ch-crown"><path d="M48 22l4 8 8-10 8 10 4-8 2 14H46z" fill="url(#${g('band')})" stroke="#8a5a0c" stroke-width="0.8"/>
       <circle cx="60" cy="19" r="2.4" fill="url(#${g('gem')})"/><circle cx="48" cy="21" r="1.6" fill="url(#${g('gem')})"/><circle cx="72" cy="21" r="1.6" fill="url(#${g('gem')})"/></g>`
    : '';
  // Cornes (mythique)
  const horns = r === 'mythic'
    ? `<path d="M22 44c-10-6-14-18-10-28 2 8 8 14 16 18z" fill="url(#${g('band')})" stroke="#2a0606" stroke-width="0.8"/>
       <path d="M98 44c10-6 14-18 10-28-2 8-8 14-16 18z" fill="url(#${g('band')})" stroke="#2a0606" stroke-width="0.8"/>`
    : '';
  // Runes flottantes
  const runes = lvl >= 2
    ? `<g class="ch-runes" fill="${p.glow}" font-family="serif" font-size="9" font-weight="bold" text-anchor="middle">
       <text x="10" y="70">ᚠ</text><text x="110" y="62">ᛟ</text>${lvl >= 4 ? '<text x="16" y="30">ᛉ</text><text x="104" y="96">ᚱ</text>' : ''}</g>`
    : '';
  const sparks = lvl >= 1
    ? `<g class="ch-sparks" fill="${p.light}">${spark(18, 52, 3.5, 'a')}${spark(102, 40, 4.5, 'b')}${lvl >= 2 ? spark(60, 8, 4, 'c') : ''}${lvl >= 3 ? spark(96, 100, 3, 'd') + spark(14, 92, 3.8, 'e') : ''}</g>`
    : '';
  const rays = lvl >= 3
    ? `<g class="ch-rays" opacity="0.55">${Array.from({ length: 12 }, (_, k) => `<path d="M60 64L${60 + Math.cos((k / 12) * Math.PI * 2) * 70} ${64 + Math.sin((k / 12) * Math.PI * 2) * 70}L${60 + Math.cos((k / 12 + 0.03) * Math.PI * 2) * 70} ${64 + Math.sin((k / 12 + 0.03) * Math.PI * 2) * 70}Z" fill="url(#${g('ray')})"/>`).join('')}</g>`
    : '';
  const flames = r === 'mythic'
    ? `<g class="ch-flames"><path d="M20 96c-6-14 4-18 2-30 8 8 10 18 6 30z" fill="url(#${g('flame')})"/><path d="M100 96c6-14-4-18-2-30-8 8-10 18-6 30z" fill="url(#${g('flame')})"/>
       <path d="M44 100c-4-10 4-12 2-22 6 6 7 14 4 22zM76 100c4-10-4-12-2-22-6 6-7 14-4 22z" fill="url(#${g('flame')})" opacity="0.8"/></g>`
    : '';
  const rivets = (y) => [24, 40, 80, 96].map((x) => `<circle cx="${x}" cy="${y}" r="1.7" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.4)" stroke-width="0.4"/>`).join('');

  return `<svg class="chest-svg r-${r} ${opts.open ? 'open' : ''} ${opts.cls || ''}" viewBox="0 0 120 112" aria-hidden="true">
  <defs>
    <linearGradient id="${g('body')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.body[0]}"/><stop offset="0.55" stop-color="${p.body[1]}"/><stop offset="1" stop-color="${p.body[2]}"/></linearGradient>
    <linearGradient id="${g('side')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(0,0,0,0.35)"/><stop offset="0.18" stop-color="rgba(0,0,0,0)"/><stop offset="0.82" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,0.4)"/></linearGradient>
    <linearGradient id="${g('band')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.band[0]}"/><stop offset="0.5" stop-color="${p.band[1]}"/><stop offset="1" stop-color="${p.band[2]}"/></linearGradient>
    <radialGradient id="${g('gem')}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff"/><stop offset="0.3" stop-color="${p.gem[0]}"/><stop offset="1" stop-color="${p.gem[1]}"/></radialGradient>
    <radialGradient id="${g('glow')}" cx="0.5" cy="0.55" r="0.5"><stop offset="0" stop-color="${p.glow}" stop-opacity="0.75"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${g('ray')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.light}" stop-opacity="0.9"/><stop offset="1" stop-color="${p.light}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${g('light')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${p.light}" stop-opacity="1"/><stop offset="1" stop-color="${p.light}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${g('flame')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff2a1f"/><stop offset="0.5" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></linearGradient>
    <linearGradient id="${g('shine')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.65" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${g('clip')}"><path d="M18 56h84v36q0 6-6 6H24q-6 0-6-6z"/></clipPath>
  </defs>
  ${lvl >= 1 ? `<ellipse class="ch-glow" cx="60" cy="66" rx="58" ry="50" fill="url(#${g('glow')})"/>` : ''}
  ${rays}
  ${flames}
  <ellipse cx="60" cy="103" rx="44" ry="6" fill="rgba(0,0,0,0.45)"/>
  <!-- Lumière qui jaillit à l'ouverture -->
  <path class="ch-light" d="M24 58L4 -10H116L96 58Z" fill="url(#${g('light')})"/>
  <!-- Corps -->
  <g class="ch-body">
    <path d="M18 56h84v36q0 6-6 6H24q-6 0-6-6z" fill="url(#${g('body')})" stroke="rgba(0,0,0,0.6)" stroke-width="1.2"/>
    <g clip-path="url(#${g('clip')})">${planks}${filigree}${magma}<rect x="18" y="56" width="84" height="42" fill="url(#${g('side')})"/>
      <rect class="ch-shine" x="-40" y="50" width="60" height="60" fill="url(#${g('shine')})"/></g>
    <!-- Ferrures -->
    <rect x="18" y="56" width="84" height="5" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.45)" stroke-width="0.6"/>
    <rect x="18" y="90" width="84" height="5" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.45)" stroke-width="0.6"/>
    <rect x="28" y="56" width="7" height="42" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.45)" stroke-width="0.6"/>
    <rect x="85" y="56" width="7" height="42" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.45)" stroke-width="0.6"/>
    ${rivets(58.5)}${rivets(92.5)}
    <!-- Serrure -->
    <path d="M51 58h18v14q0 9-9 12q-9-3-9-12z" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.55)" stroke-width="0.8"/>
    <circle class="ch-gem" cx="60" cy="66" r="4.4" fill="url(#${g('gem')})" stroke="rgba(0,0,0,0.5)" stroke-width="0.6"/>
    <path d="M58.6 73h2.8l0.8 5h-4.4z" fill="rgba(0,0,0,0.75)"/>
  </g>
  <!-- Couvercle -->
  <g class="ch-lid">
    <path d="M16 56V44q0-16 22-18h44q22 2 22 18v12z" fill="url(#${g('body')})" stroke="rgba(0,0,0,0.6)" stroke-width="1.2"/>
    <path d="M16 44q0-16 22-18h44q22 2 22 18" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>
    ${r === 'common' || r === 'rare' ? '<path d="M18 40h84M20 33h80" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>' : ''}
    <path d="M28 27v29h7V26zM85 26v30h7V27z" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.45)" stroke-width="0.6"/>
    <rect x="16" y="51" width="88" height="5" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.45)" stroke-width="0.6"/>
    <path d="M52 51h16v-6q-8-5-16 0z" fill="url(#${g('band')})" stroke="rgba(0,0,0,0.5)" stroke-width="0.6"/>
    ${[31.5, 88.5].map((x) => `<circle cx="${x}" cy="32" r="1.6" fill="url(#${g('band')})"/><circle cx="${x}" cy="44" r="1.6" fill="url(#${g('band')})"/>`).join('')}
    ${crystals}${crown}${horns}
  </g>
  ${runes}
  ${sparks}
</svg>`;
}
