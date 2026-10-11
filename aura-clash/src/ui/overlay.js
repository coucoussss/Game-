// Calque « manga » au-dessus du rendu 3D : lignes de vitesse, flashs blancs, bandeaux de
// cinématique et onomatopées qui explosent à l'écran.

export class Overlay {
  constructor(root) {
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'speedlines';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'flash';
    root.appendChild(this.flashEl);
    this.cineEl = document.createElement('div');
    this.cineEl.className = 'cine';
    this.cineEl.innerHTML = '<div class="bar top"></div><div class="bar bottom"></div><div class="cine-text"><span class="cine-name"></span><span class="cine-move"></span></div>';
    root.appendChild(this.cineEl);
    this.mangaLayer = document.createElement('div');
    this.mangaLayer.className = 'manga-layer';
    root.appendChild(this.mangaLayer);
    this.lines = 0;
    this.lineDur = 1;
    this.lineInt = 1;
    this.flashT = 0;
    this.flashDur = 1;
    this.cineT = 0;
    this.reduced = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = Math.floor(window.innerWidth / 2);
    this.canvas.height = Math.floor(window.innerHeight / 2);
  }

  flash(color = '#ffffff', dur = 0.2) {
    if (this.reduced) return;
    this.flashEl.style.background = color;
    this.flashT = dur;
    this.flashDur = dur;
  }

  speedLines(dur = 0.6, intensity = 1) {
    this.lines = Math.max(this.lines, dur);
    this.lineDur = Math.max(dur, 0.01);
    this.lineInt = intensity;
  }

  cinematic(text, color, name, dur) {
    this.cineEl.style.setProperty('--cine-color', color);
    this.cineEl.querySelector('.cine-name').textContent = name;
    this.cineEl.querySelector('.cine-move').textContent = text;
    this.cineEl.classList.remove('on');
    void this.cineEl.offsetWidth; // relance l'animation CSS
    this.cineEl.classList.add('on');
    this.cineT = dur + 0.15;
    this.speedLines(dur + 0.2, 1.3);
    this.flash(color, 0.15);
  }

  /** Onomatopée façon manga à une position de l'écran (en pourcentages). */
  manga(text, xPct, yPct) {
    const el = document.createElement('div');
    el.className = 'manga';
    el.textContent = text;
    const x = Math.max(12, Math.min(88, xPct));
    const y = Math.max(15, Math.min(80, yPct - 8));
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.setProperty('--rot', `${(Math.random() * 16 - 8).toFixed(1)}deg`);
    this.mangaLayer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  clear() {
    this.lines = 0;
    this.flashT = 0;
    this.cineT = 0;
    this.cineEl.classList.remove('on');
    this.mangaLayer.innerHTML = '';
    this.flashEl.style.opacity = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  update(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashEl.style.opacity = Math.max(0, this.flashT / this.flashDur) * 0.85;
    } else if (this.flashEl.style.opacity !== '0') {
      this.flashEl.style.opacity = 0;
    }
    if (this.cineT > 0) {
      this.cineT -= dt;
      if (this.cineT <= 0) this.cineEl.classList.remove('on');
    }
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    if (this.lines > 0 && !this.reduced) {
      this.lines -= dt;
      const k = Math.min(1, this.lines / Math.min(0.3, this.lineDur)) * this.lineInt;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.hypot(w, h) / 2;
      const n = 90;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const inner = R * (0.35 + Math.random() * 0.35);
        const width = (Math.random() * 0.012 + 0.003) * k;
        c.fillStyle = i % 5 === 0 ? `rgba(0,0,0,${0.5 * k})` : `rgba(255,255,255,${0.55 * k})`;
        c.beginPath();
        c.moveTo(cx + Math.cos(a - width) * R, cy + Math.sin(a - width) * R);
        c.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        c.lineTo(cx + Math.cos(a + width) * R, cy + Math.sin(a + width) * R);
        c.fill();
      }
    }
  }
}
