import { ArenaRenderer } from '../render/arenaRenderer.js';
import { soundEngine } from '../audio/soundEngine.js';

export function createGameScreen({ onQuitMatch }) {
  const $ = (id) => document.getElementById(id);
  const screen = $('screen-game');
  const canvas = $('game-canvas');
  const hudPlayers = $('hud-players');
  const hudTimer = $('hud-timer');
  const hudSudden = $('hud-sudden');
  const btnMute = $('btn-mute');
  const btnQuit = $('btn-quit-match');
  const gameoverOverlay = $('gameover-overlay');
  const gameoverTitle = $('gameover-title');
  const gameoverRanking = $('gameover-ranking');

  const renderer = new ArenaRenderer(canvas);
  let latestState = null;
  let myPlayerId = null;
  let rafId = null;
  let lastFrameTime = performance.now();
  let knownExplosionIds = new Set();
  let lastMyStats = null;

  function toggleMute() {
    const muted = soundEngine.toggleMute();
    btnMute.textContent = muted ? '🔇 Mudo' : '🔊 Som';
  }
  btnMute.addEventListener('click', toggleMute);

  btnQuit.addEventListener('click', () => onQuitMatch());

  function formatTimer(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const sec = String(totalSec % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }

  function updateHud(state) {
    hudTimer.textContent = formatTimer(state.remainingMs);
    hudTimer.classList.toggle('urgent', state.remainingMs <= 60000);
    hudSudden.classList.toggle('hidden', !state.suddenDeathActive);

    hudPlayers.innerHTML = '';
    for (const p of state.players) {
      const pill = document.createElement('div');
      pill.className = `hud-pill ${p.playerId === myPlayerId ? 'me' : ''} ${!p.alive ? 'dead' : ''}`;
      pill.innerHTML = `
        <strong>${p.name}</strong>
        <span class="hud-stats">
          <span>💣${p.maxBombs}</span>
          <span>🔥${p.bombRange}</span>
          <span>⭐${p.score}</span>
        </span>
      `;
      hudPlayers.appendChild(pill);
    }
  }

  function detectAudioEvents(state) {
    // Novas explosões
    for (const exp of state.explosions) {
      if (!knownExplosionIds.has(exp.id)) {
        knownExplosionIds.add(exp.id);
        soundEngine.playExplosion();
        const center = exp.cells[0];
        if (center) renderer.spawnBurst(center.col, center.row, '#ff8a1f');
      }
    }

    // Coleta de powerup ou morte do jogador local
    const me = state.players.find((p) => p.playerId === myPlayerId);
    if (me && lastMyStats) {
      if (
        me.maxBombs > lastMyStats.maxBombs ||
        me.bombRange > lastMyStats.bombRange ||
        me.speed > lastMyStats.speed ||
        (me.canKick && !lastMyStats.canKick) ||
        (me.pierceBombs && !lastMyStats.pierceBombs)
      ) {
        soundEngine.playPowerup();
      }
      if (!me.alive && lastMyStats.alive) {
        soundEngine.playElimination();
      }
    }
    if (me) {
      lastMyStats = {
        alive: me.alive,
        maxBombs: me.maxBombs,
        bombRange: me.bombRange,
        speed: me.speed,
        canKick: me.canKick,
        pierceBombs: me.pierceBombs,
      };
    }
  }

  function loop(now) {
    const dtSec = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    if (latestState) {
      renderer.render(latestState, now, dtSec);
    }
    rafId = requestAnimationFrame(loop);
  }

  return {
    toggleMute,
    start(matchInit, playerId) {
      myPlayerId = playerId;
      latestState = matchInit.state;
      knownExplosionIds = new Set();
      lastMyStats = null;
      gameoverOverlay.classList.add('hidden');
      renderer.configure(matchInit.arena);
      updateHud(latestState);
      screen.classList.remove('hidden');

      if (rafId) cancelAnimationFrame(rafId);
      lastFrameTime = performance.now();
      rafId = requestAnimationFrame(loop);
    },
    onState(state) {
      latestState = state;
      detectAudioEvents(state);
      updateHud(state);
    },
    showGameOver(result) {
      const won = result.winnerId === myPlayerId;
      gameoverTitle.textContent = !result.winnerId
        ? 'EMPATE!'
        : won
          ? 'VOCÊ VENCEU!'
          : 'FIM DE PARTIDA';
      if (won) soundEngine.playVictory();

      gameoverRanking.innerHTML = '';
      result.ranking.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = `rank-row ${idx === 0 && result.winnerId ? 'winner' : ''}`;
        row.innerHTML = `
          <span>#${idx + 1} ${entry.name}</span>
          <span>${entry.kills} abates · ${entry.score} pts</span>
        `;
        gameoverRanking.appendChild(row);
      });
      gameoverOverlay.classList.remove('hidden');
    },
    hide() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      screen.classList.add('hidden');
    },
  };
}
