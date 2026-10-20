// Distribution des récompenses du passe, des coffres, des missions, etc. dans le profil.
// Chaque récompense { t, … } est rendue concrète (fragment d'un personnage précis, skin précis…)
// et renvoyée pour l'affichage (cartes, pièces qui volent).
import { CHAR_BY_ID } from '../game/characters.js';
import {
  PAID, FRAGS_TO_UNLOCK, FRAG_TO_RYO, SKINS, SKIN_BY_ID, TITLES, TITLE_BY_ID, FRAMES, FRAME_BY_ID,
  RARITY_BY_ID, rarityRank, rollChest, passTier, TIER_XP,
} from './liveops.js';

const atLeast = (list, min) => list.filter((x) => rarityRank(x.rarity) >= rarityRank(min || 'common'));

/** Libellé court d'une récompense (déjà concrète). */
export function rewardLabel(r) {
  switch (r.t) {
    case 'ryo': return `${r.n} Ryō`;
    case 'xp': return `${r.n} XP de passe`;
    case 'frag': return `${r.n} fragments${r.id && CHAR_BY_ID[r.id] ? ` · ${CHAR_BY_ID[r.id].name}` : ''}`;
    case 'chest': return `Coffre ${(RARITY_BY_ID[r.r] || RARITY_BY_ID.common).name.toLowerCase()}`;
    case 'skin': return r.id ? `Skin ${SKIN_BY_ID[r.id].name}` : 'Skin surprise';
    case 'title': return r.id ? `Titre « ${TITLE_BY_ID[r.id].name} »` : 'Titre surprise';
    case 'frame': return r.id ? FRAME_BY_ID[r.id].name : 'Cadre surprise';
    case 'char': return CHAR_BY_ID[r.id] ? `${CHAR_BY_ID[r.id].name} (combattant)` : 'Combattant';
    case 'boost': return `Boost ×2 XP ${r.min} min`;
    default: return '';
  }
}

/** Rareté affichée d'une récompense (couleur de la carte). */
export function rewardRarity(r) {
  if (r.t === 'skin' && r.id) return SKIN_BY_ID[r.id].rarity;
  if (r.t === 'title' && r.id) return TITLE_BY_ID[r.id].rarity;
  if (r.t === 'frame' && r.id) return FRAME_BY_ID[r.id].rarity;
  if (r.t === 'chest') return r.r;
  if (r.t === 'char') return 'legendary';
  if (r.t === 'frag') return r.n >= 50 ? 'legendary' : r.n >= 20 ? 'epic' : 'rare';
  if (r.t === 'ryo') return r.n >= 2000 ? 'legendary' : r.n >= 600 ? 'epic' : r.n >= 250 ? 'rare' : 'common';
  if (r.t === 'xp') return r.n >= 1500 ? 'epic' : r.n >= 600 ? 'rare' : 'common';
  return 'common';
}

/** Icône (caractère) d'une récompense. */
export function rewardIcon(r) {
  return { ryo: '両', xp: '★', frag: '◆', chest: '箱', skin: '衣', title: '名', frame: '枠', char: '人', boost: '⚡' }[r.t] || '?';
}

/**
 * Donne une récompense au profil. Renvoie la liste des récompenses concrètes obtenues
 * (un coffre renvoie { t: 'chest', r, cards } avec ses cartes déjà distribuées).
 */
export function grant(prof, reward, rnd = Math.random) {
  const live = prof.data.live;
  const stats = prof.data.stats || (prof.data.stats = {});
  const out = [];
  const give = (r) => {
    switch (r.t) {
      case 'ryo':
        prof.data.ryo += Math.max(0, Math.floor(r.n));
        out.push({ ...r });
        break;
      case 'xp': {
        const before = passTier(live.passXp);
        live.passXp += Math.max(0, Math.floor(r.n));
        const after = passTier(live.passXp);
        if (after > before) stats.passTiersTotal = (stats.passTiersTotal || 0) + (after - before);
        out.push({ ...r, tierUp: after > before ? after : 0 });
        break;
      }
      case 'frag': {
        let id = r.id;
        if (!id) {
          const locked = PAID.filter((c) => !prof.owns(c));
          id = locked.length ? locked[Math.floor(rnd() * locked.length) % locked.length] : null;
        }
        if (!id || prof.owns(id)) {
          // Personnage déjà possédé : les fragments deviennent des Ryō
          const n = r.n * FRAG_TO_RYO;
          prof.data.ryo += n;
          out.push({ t: 'ryo', n, from: 'frag' });
          break;
        }
        live.frags[id] = (live.frags[id] || 0) + r.n;
        const unlocked = live.frags[id] >= FRAGS_TO_UNLOCK;
        if (unlocked) {
          const extra = live.frags[id] - FRAGS_TO_UNLOCK;
          delete live.frags[id];
          prof.data.owned.push(id);
          if (extra > 0) prof.data.ryo += extra * FRAG_TO_RYO;
        }
        out.push({ t: 'frag', id, n: r.n, unlocked });
        break;
      }
      case 'char':
        if (prof.owns(r.id)) { prof.data.ryo += 2000; out.push({ t: 'ryo', n: 2000, from: 'char' }); } else {
          prof.data.owned.push(r.id);
          delete live.frags[r.id];
          out.push({ ...r });
        }
        break;
      case 'skin': {
        let id = r.id;
        if (!id) {
          const pool = atLeast(SKINS, r.minRarity).filter((s) => !live.skins.includes(s.id));
          const any = SKINS.filter((s) => !live.skins.includes(s.id));
          const list = pool.length ? pool : any;
          id = list.length ? list[Math.floor(rnd() * list.length) % list.length].id : null;
        }
        if (!id || live.skins.includes(id)) { prof.data.ryo += 1500; out.push({ t: 'ryo', n: 1500, from: 'skin' }); break; }
        live.skins.push(id);
        out.push({ t: 'skin', id });
        break;
      }
      case 'title': {
        let id = r.id;
        if (!id) {
          const pool = atLeast(TITLES, r.minRarity).filter((s) => !live.titles.includes(s.id));
          id = pool.length ? pool[Math.floor(rnd() * pool.length) % pool.length].id : null;
        }
        if (!id || live.titles.includes(id)) { prof.data.ryo += 800; out.push({ t: 'ryo', n: 800, from: 'title' }); break; }
        live.titles.push(id);
        out.push({ t: 'title', id });
        break;
      }
      case 'frame': {
        let id = r.id;
        if (!id) {
          const pool = atLeast(FRAMES, r.minRarity).filter((s) => !live.frames.includes(s.id));
          id = pool.length ? pool[Math.floor(rnd() * pool.length) % pool.length].id : null;
        }
        if (!id || live.frames.includes(id)) { prof.data.ryo += 600; out.push({ t: 'ryo', n: 600, from: 'frame' }); break; }
        live.frames.push(id);
        out.push({ t: 'frame', id });
        break;
      }
      case 'boost':
        live.boostUntil = Math.max(live.boostUntil, Date.now()) + r.min * 60000;
        out.push({ ...r });
        break;
      case 'chest': {
        const cards = rollChest(r.r, rnd).flatMap((c) => grant(prof, c, rnd));
        stats.chestsOpened = (stats.chestsOpened || 0) + 1;
        out.push({ t: 'chest', r: r.r, cards });
        break;
      }
      default: break;
    }
  };
  for (const r of Array.isArray(reward) ? reward : [reward]) give(r);
  prof.save();
  return out;
}

/** Toutes les récompenses « à plat » (cartes des coffres incluses), pour le résumé. */
export function flatten(results) {
  return results.flatMap((r) => (r.t === 'chest' ? [r, ...flatten(r.cards)] : [r]));
}

export { TIER_XP };
