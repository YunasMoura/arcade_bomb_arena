import { drawCharacter } from './pixelSprites.js';

const THEMES = {
  neon_city: {
    floorA: '#131332',
    floorB: '#17173d',
    hardTop: '#3b427a',
    hardFace: '#232852',
    hardLine: '#5c67b8',
    softTop: '#d97706',
    softFace: '#92400e',
    softTrim: '#fbbf24',
  },
  cyber_ruins: {
    floorA: '#0f232c',
    floorB: '#132c37',
    hardTop: '#2e6f73',
    hardFace: '#1b474a',
    hardLine: '#5eead4',
    softTop: '#7c3aed',
    softFace: '#4c1d95',
    softTrim: '#c4b5fd',
  },
  volcanic_core: {
    floorA: '#241218',
    floorB: '#2d161e',
    hardTop: '#57534e',
    hardFace: '#292524',
    hardLine: '#f97316',
    softTop: '#dc2626',
    softFace: '#7f1d1d',
    softTrim: '#fca5a5',
  },
};

const POWERUP_META = {
  bomb_up: { bg: '#2563eb', label: '+B', border: '#93c5fd' },
  fire_up: { bg: '#ea580c', label: '+F', border: '#fdba74' },
  speed_up: { bg: '#16a34a', label: '+S', border: '#86efac' },
  kick: { bg: '#9333ea', label: 'KT', border: '#d8b4fe' },
  pierce: { bg: '#dc2626', label: 'PR', border: '#fca5a5' },
};

export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.tileSize = 64; // Alta resolução interna (1088x960 lógico * DPR = nitidez 4K)
    this.dpr = 1;
    this.logicalWidth = 17 * this.tileSize;
    this.logicalHeight = 15 * this.tileSize;
    this.theme = THEMES.neon_city;
    this.particles = [];
    this.floorLayer = null;
    this.visualPlayers = new Map();
    this.visualBombs = new Map();
    this.shakeTime = 0;
  }

  configure(arena) {
    this.theme = THEMES[arena.theme] || THEMES.neon_city;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.logicalWidth = arena.cols * this.tileSize;
    this.logicalHeight = arena.rows * this.tileSize;

    this.canvas.width = Math.round(this.logicalWidth * this.dpr);
    this.canvas.height = Math.round(this.logicalHeight * this.dpr);

    this.particles = [];
    this.visualPlayers.clear();
    this.visualBombs.clear();
    this.shakeTime = 0;
    this._buildFloorCache(arena.cols, arena.rows);
  }

  _buildFloorCache(cols, rows) {
    const off = document.createElement('canvas');
    off.width = Math.round(this.logicalWidth * this.dpr);
    off.height = Math.round(this.logicalHeight * this.dpr);
    const octx = off.getContext('2d', { alpha: false });
    octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const ts = this.tileSize;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = c * ts;
        const y = r * ts;
        octx.fillStyle = (r + c) % 2 === 0 ? this.theme.floorA : this.theme.floorB;
        octx.fillRect(x, y, ts, ts);
      }
    }
    this.floorLayer = off;
  }

  spawnBurst(col, row, color = '#ff8a1f') {
    this.shakeTime = 0.14;
    const cx = (col + 0.5) * this.tileSize;
    const cy = (row + 0.5) * this.tileSize;
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.35;
      const speed = 70 + Math.random() * 110;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.38,
        maxLife: 0.38,
        color,
      });
    }
  }

  render(state, nowMs, dtSec = 0.016) {
    const { ctx, tileSize: ts, theme } = this;
    const grid = state.grid;
    const rows = grid.length;
    const cols = grid[0].length;

    // Atualiza DPR caso o usuário arraste a janela entre monitores Full HD / 4K
    const currentDpr = Math.min(window.devicePixelRatio || 1, 3);
    if (currentDpr !== this.dpr) {
      this.dpr = currentDpr;
      this.canvas.width = Math.round(this.logicalWidth * this.dpr);
      this.canvas.height = Math.round(this.logicalHeight * this.dpr);
      this._buildFloorCache(cols, rows);
    }

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dtSec);
      const mag = (this.shakeTime / 0.14) * 3.5;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // 1. Piso pré-renderizado em camada única (zero custo por quadro)
    if (this.floorLayer) {
      ctx.drawImage(this.floorLayer, 0, 0, this.logicalWidth, this.logicalHeight);
    }

    // 2. Blocos sólidos e destrutíveis
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const tile = grid[r][c];
        if (tile === 0) continue;
        const x = c * ts;
        const y = r * ts;

        if (tile === 1) {
          ctx.fillStyle = theme.hardFace;
          ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
          ctx.fillStyle = theme.hardTop;
          ctx.fillRect(x + 4, y + 4, ts - 8, ts - 13);
          ctx.strokeStyle = theme.hardLine;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x + 5, y + 5, ts - 10, ts - 15);
        } else if (tile === 2) {
          ctx.fillStyle = theme.softFace;
          ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
          ctx.fillStyle = theme.softTop;
          ctx.fillRect(x + 5, y + 5, ts - 10, ts - 13);
          ctx.strokeStyle = theme.softTrim;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x + 8, y + 8, ts - 16, ts - 18);
          ctx.beginPath();
          ctx.moveTo(x + 8, y + 8);
          ctx.lineTo(x + ts - 8, y + ts - 10);
          ctx.stroke();
        }
      }
    }

    // 3. Power-ups
    const bob = Math.sin(nowMs / 170) * 3.5;
    for (const item of state.powerups) {
      const meta = POWERUP_META[item.type] || POWERUP_META.bomb_up;
      const x = item.col * ts + 10;
      const y = item.row * ts + 10 + bob;
      const s = ts - 20;
      ctx.fillStyle = meta.bg;
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = meta.border;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, s, s);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.label, x + s / 2, y + s / 2 + 1);
    }

    // 4. Bombas com interpolação suave (para bombas chutadas deslizarem a 60/120 FPS)
    const activeBombIds = new Set();
    const bombLerp = 1 - Math.exp(-28 * dtSec);
    for (const bomb of state.bombs) {
      activeBombIds.add(bomb.id);
      let vb = this.visualBombs.get(bomb.id);
      if (!vb) {
        vb = { x: bomb.x, y: bomb.y };
        this.visualBombs.set(bomb.id, vb);
      } else {
        vb.x += (bomb.x - vb.x) * bombLerp;
        vb.y += (bomb.y - vb.y) * bombLerp;
      }

      const cx = vb.x * ts;
      const cy = vb.y * ts;
      const pulse = 1 + Math.sin(nowMs / 85) * 0.09;
      const radius = ts * 0.34 * pulse;

      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + ts * 0.3, radius * 0.9, radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = bomb.fuseRemainingMs < 900 && Math.floor(nowMs / 75) % 2 === 0 ? '#ef4444' : '#18182f';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#a45bff';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.32, cy - radius * 0.32, radius * 0.24, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff8a1f';
      ctx.fillRect(cx - 2.5, cy - radius - 8, 5, 8);
    }
    for (const id of this.visualBombs.keys()) {
      if (!activeBombIds.has(id)) this.visualBombs.delete(id);
    }

    // 5. Explosões
    for (const exp of state.explosions) {
      const ratio = Math.max(0.2, exp.remainingMs / 550);
      for (const cell of exp.cells) {
        const x = cell.col * ts;
        const y = cell.row * ts;
        ctx.fillStyle = `rgba(255, 122, 0, ${0.86 * ratio})`;
        ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
        ctx.fillStyle = `rgba(254, 240, 138, ${0.96 * ratio})`;
        ctx.fillRect(x + 11, y + 11, ts - 22, ts - 22);
      }
    }

    // 6. Jogadores com interpolação exponencial suave (elimina 100% os engasgos entre pacotes da rede)
    const walkFrame = Math.floor(nowMs / 115) % 2 === 0 ? 1 : 2;
    const activePlayerIds = new Set();
    const playerLerp = 1 - Math.exp(-32 * dtSec);

    for (const p of state.players) {
      if (!p.alive) continue;
      activePlayerIds.add(p.playerId);

      let vp = this.visualPlayers.get(p.playerId);
      if (!vp || Math.hypot(p.x - vp.x, p.y - vp.y) > 2.5) {
        vp = { x: p.x, y: p.y };
        this.visualPlayers.set(p.playerId, vp);
      } else {
        vp.x += (p.x - vp.x) * playerLerp;
        vp.y += (p.y - vp.y) * playerLerp;
      }

      const cx = vp.x * ts;
      const cy = vp.y * ts;
      const isVisuallyMoving = p.moving || Math.hypot(p.x - vp.x, p.y - vp.y) > 0.02;
      const frame = isVisuallyMoving ? walkFrame : 0;
      const alpha = p.invulnerableMs > 0 && Math.floor(nowMs / 80) % 2 === 0 ? 0.45 : 1;

      drawCharacter(ctx, p.character, cx, cy - 4, ts * 0.92, frame, alpha);

      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(p.name, cx + 1.5, cy - ts * 0.52 + 1.5);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(p.name, cx, cy - ts * 0.52);
    }
    for (const id of this.visualPlayers.keys()) {
      if (!activePlayerIds.has(id)) this.visualPlayers.delete(id);
    }

    // 7. Partículas
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const pt = this.particles[i];
      pt.x += pt.vx * dtSec;
      pt.y += pt.vy * dtSec;
      pt.life -= dtSec;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = pt.life / pt.maxLife;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}
