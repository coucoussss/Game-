import { audio } from '../audio/AudioEngine';
import { musicFor } from '../audio/MusicDirector';
import type { WorldEvent } from '../systems/events';
import type { World } from '../systems/World';

/**
 * Le paysage sonore du jeu : musique d'ambiance qui suit le réseau et la saison, et
 * sons organiques déclenchés par la simulation (pousse, mort d'un filament, gouttes,
 * pluie, feu, trahisons, contagions…).
 */
export class SoundView {
  private lastStep = -1;
  private lastKey = '';
  private active = new Set<number>();
  private dripIn = 3000;
  private weatherIn = 0;

  constructor(private readonly world: World) {}

  update(deltaMs: number, timeMs: number): void {
    const net = this.world.net;
    const danger = this.world.climate !== null && this.world.climate.kind !== 'windfall' || this.world.colonies.length > 0;
    const state = musicFor(net.segments.size, this.world.season.def.id, this.world.forest.biome, timeMs, danger);
    const key = `${state.root}-${state.mood}-${state.tempo}`;
    if (key !== this.lastKey) {
      audio.startMusic(state.root, state.tempo, state.mood);
      this.lastKey = key;
      this.lastStep = -1;
    }
    if (state.step !== this.lastStep) {
      audio.setChord(state.chord);
      this.lastStep = state.step;
    }
    audio.setDensity(state.density);

    // Pousse achevée et mort de filaments.
    const now = new Set<number>();
    let grown = 0;
    for (const seg of net.segments.values()) {
      if (seg.growth < 1) continue;
      now.add(seg.id);
      if (!this.active.has(seg.id)) grown++;
    }
    let died = 0;
    for (const id of this.active) if (!net.segments.has(id)) died++;
    this.active = now;
    if (grown > 0 && grown < 10) audio.sfx('grow');
    if (died > 0) audio.sfx('crack', 0.4);

    // Gouttes qui tombent dans le sol, d'autant plus que la terre est humide.
    this.dripIn -= deltaMs;
    if (this.dripIn <= 0) {
      audio.sfx('drip', 0.25 + this.world.moisture * 0.5);
      this.dripIn = 2500 + Math.random() * 6000 * (1.2 - this.world.moisture);
    }
    // Pluie et feu en continu.
    this.weatherIn -= deltaMs;
    if (this.weatherIn <= 0) {
      if (this.world.data.seasons.weather[this.world.weather.id]?.precipitation === 'rain') audio.sfx('rain', 0.7);
      if (this.world.climate?.kind === 'fire') audio.sfx('burn', 0.6);
      this.weatherIn = 4000;
    }
  }

  onEvent(event: WorldEvent): void {
    switch (event.type) {
      case 'betrayal':
        audio.sfx('betray');
        break;
      case 'infection':
        audio.sfx('pop', 0.5);
        break;
      case 'rival':
        if (event.phase === 'spawn') audio.sfx('hiss', 0.6);
        break;
      case 'sporee':
        audio.sfx('chime', 1.2);
        break;
      case 'climate':
        if (event.phase !== 'start') break;
        if (event.eventId === 'flood') audio.sfx('rumble');
        else if (event.eventId === 'fallen-oak') {
          audio.sfx('crack');
          audio.sfx('rumble', 0.7);
        } else if (event.eventId === 'fire') audio.sfx('burn');
        else audio.sfx('hiss', 0.5);
        break;
      default:
        break;
    }
  }

  stop(): void {
    audio.stopMusic();
  }
}
