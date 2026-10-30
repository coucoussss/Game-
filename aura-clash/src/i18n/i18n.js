// Jeu bilingue (français / anglais). Les textes sont écrits en français dans le code ; en anglais,
// chaque texte affiché est traduit à la volée grâce au dictionnaire en.json. Les nombres sont
// remplacés par « # » pour la recherche, et « {} » désigne une partie variable (nom, valeur…).
import EN from './en.json';

const KEY = 'auraclash.lang';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch { /* stockage indisponible */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en';
  return /^fr\b/i.test(nav) ? 'fr' : 'en';
}

export let lang = detect();

/** Change la langue (la page est rechargée pour tout réafficher). */
export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* ignoré */ }
  location.reload();
}

const NUM = /\d+(?:[.,]\d+)?/g;
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
// Modèles à parties variables, du plus long au plus court
const patterns = Object.keys(EN).filter((k) => k.includes('{}')).sort((a, b) => b.length - a.length)
  .map((k) => ({ re: new RegExp('^' + esc(k).replace(/\\\{\\\}|\{\}/g, '(.+?)') + '$'), en: EN[k] }));
const cache = new Map();

function lookup(s) {
  if (EN[s]) return EN[s];
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    let i = 1;
    return p.en.replace(/\{\}/g, () => { const g = m[i++] || ''; return EN[g] || g; });
  }
  return null;
}

/** Traduit un texte français (sans effet en français ou si le texte est inconnu). */
export function tr(text) {
  if (lang === 'fr' || !text) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  const core = text.trim().replace(/\s+/g, ' ');
  let out = text;
  if (core && core.length < 400 && /[A-Za-zÀ-ÿ]/.test(core)) {
    const nums = core.match(NUM) || [];
    const res = lookup(core.replace(NUM, '#'));
    if (res) {
      let i = 0;
      out = lead + res.replace(/#/g, () => (i < nums.length ? nums[i++] : '#')) + trail;
    } else if (typeof window !== 'undefined' && window.__trMiss && !/ · | — | → |: | : |, /.test(core)) {
      window.__trMiss.add(core); // relevé des textes sans traduction (outil de vérification)
    } else if (/ · | — | → |: | : |, /.test(core)) {
      // Texte composé (« A : x · B : y », « A → B », liste de noms) : chaque morceau est traduit séparément
      const parts = core.split(/( · | — | → | ?: |, )/);
      const done = parts.map((x, k) => (k % 2 ? x.replace(' :', ':') : tr(x)));
      if (done.some((x, k) => x !== parts[k] && k % 2 === 0)) out = lead + done.join('') + trail;
    }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(text, out);
  return out;
}

/** Traduit en continu tout le texte affiché dans la page (menus, interface, bulles…). */
export function startDomTranslation(root = document.body) {
  if (lang === 'fr') return;
  document.documentElement.lang = 'en';
  const fixText = (n) => {
    // Jamais le code des balises <script> / <style>, ni les très longs textes
    const tag = n.parentNode && n.parentNode.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || n.data.length > 400) return;
    const t = tr(n.data);
    if (t !== n.data) n.data = t;
  };
  const fixAttrs = (el) => {
    for (const a of ['placeholder', 'title', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
  };
  const walk = (node) => {
    if (node.nodeType === 3) { fixText(node); return; }
    if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    fixAttrs(node);
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) fixText(n); else fixAttrs(n);
    }
  };
  walk(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes') fixAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
}
