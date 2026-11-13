'use strict';

const crypto = require('crypto');
const gameConfig = require('../config/gameConfig');
const { TILE, generateArena } = require('./ArenaGenerator');
const { computeExplosionCells, updateMovingBombs } = require('./BombSystem');
const { rollPowerup, applyPowerup } = require('./PowerupSystem');
const BotController = require('./BotController');

const DIR_DELTAS = Object.freeze({
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
});

class MatchEngine {
  constructor({
    roomCode,
    roomPlayers,
    rng = Math.random,
    durationMs = gameConfig.match.durationMs,
    suddenDeathAtRemainingMs = gameConfig.match.suddenDeathAtRemainingMs,
    onMatchFinished = () => {},
  }) {
    this.roomCode = roomCode;
    this.rng = rng;
    this.durationMs = durationMs;
    this.suddenDeathAtRemainingMs = suddenDeathAtRemainingMs;
    this.onMatchFinished = onMatchFinished;

    this.arena = generateArena({ rng });
    this.botController = new BotController(this);
    this.players = new Map();
    this.bombs = new Map();
    this.explosions = [];
    this.powerups = new Map();

    this.startedAt = Date.now();
    this.elapsedMs = 0;
    this.status = 'playing'; // playing | finished
    this.winnerId = null;
    this.finishReason = null;

    this.suddenDeathActive = false;
    this.suddenDeathTimerMs = 0;
    this.suddenDeathRing = 1;
    this.suddenDeathCursor = { col: 1, row: 1, dir: 0 };

    roomPlayers.forEach((rp, idx) => {
      const spawn = this.arena.spawns[idx % this.arena.spawns.length];
      this.players.set(rp.playerId, {
        playerId: rp.playerId,
        name: rp.name,
        character: rp.character,
        seat: idx,
        col: spawn.col,
        row: spawn.row,
        targetCol: null,
        targetRow: null,
        moveProgress: 0,
        x: spawn.col + 0.5,
        y: spawn.row + 0.5,
        dir: 'down',
        moving: false,
        alive: true,
        connected: rp.connected !== false,
        isBot: Boolean(rp.isBot),
        speed: gameConfig.player.baseSpeed,
        maxBombs: gameConfig.bomb.startMaxSimultaneous,
        activeBombs: 0,
        bombRange: gameConfig.bomb.startRange,
        canKick: false,
        pierceBombs: false,
        lastBombAt: 0,
        invulnerableMs: gameConfig.player.invulnerableSpawnMs,
        kills: 0,
        score: 0,
        input: { up: false, down: false, left: false, right: false },
        lastDirPressed: null,
      });
    });
  }

  setInput(playerId, input) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.status !== 'playing') return;
    const prev = { ...p.input };
    p.input.up = Boolean(input.up);
    p.input.down = Boolean(input.down);
    p.input.left = Boolean(input.left);
    p.input.right = Boolean(input.right);

    for (const dir of ['up', 'down', 'left', 'right']) {
      if (p.input[dir] && !prev[dir]) {
        p.lastDirPressed = dir;
      }
    }
  }

  setPlayerConnection(playerId, connected) {
    const p = this.players.get(playerId);
    if (p) p.connected = Boolean(connected);
  }

  _getCurrentTile(player) {
    if (player.targetCol !== null && player.targetRow !== null && player.moveProgress >= 0.5) {
      return { col: player.targetCol, row: player.targetRow };
    }
    return { col: player.col, row: player.row };
  }

  placeBomb(playerId, nowMs = Date.now()) {
    if (this.status !== 'playing') return { ok: false, reason: 'MATCH_FINISHED' };
    const p = this.players.get(playerId);
    if (!p || !p.alive) return { ok: false, reason: 'DEAD' };
    if (p.activeBombs >= p.maxBombs) return { ok: false, reason: 'MAX_BOMBS' };
    if (nowMs - p.lastBombAt < gameConfig.bomb.placeCooldownMs) {
      return { ok: false, reason: 'COOLDOWN' };
    }

    const { col, row } = this._getCurrentTile(p);
    if (this.arena.grid[row]?.[col] !== TILE.EMPTY) {
      return { ok: false, reason: 'BLOCKED' };
    }

    for (const b of this.bombs.values()) {
      if (b.col === col && b.row === row) {
        return { ok: false, reason: 'OCCUPIED' };
      }
    }

    const id = crypto.randomUUID().slice(0, 8);
    const bomb = {
      id,
      ownerId: playerId,
      col,
      row,
      x: col + 0.5,
      y: row + 0.5,
      range: p.bombRange,
      pierce: p.pierceBombs,
      fuseRemainingMs: gameConfig.bomb.fuseMs,
      vx: 0,
      vy: 0,
      passableBy: new Set(
        Array.from(this.players.values())
          .filter((pl) => {
            if (!pl.alive) return false;
            const t = this._getCurrentTile(pl);
            return (
              (pl.col === col && pl.row === row) ||
              (pl.targetCol === col && pl.targetRow === row) ||
              (t.col === col && t.row === row)
            );
          })
          .map((pl) => pl.playerId)
      ),
    };

    this.bombs.set(id, bomb);
    p.activeBombs += 1;
    p.lastBombAt = nowMs;
    return { ok: true, bomb };
  }

  tick(dtMs) {
    if (this.status !== 'playing') return;
    const dtSec = dtMs / 1000;
    this.elapsedMs += dtMs;

    // 0. Atualiza decisões dos bots
    this.botController.update(dtMs);

    // 1. Atualiza invulnerabilidade e movimento discreto por bloco (1 tile por passo)
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.invulnerableMs > 0) p.invulnerableMs = Math.max(0, p.invulnerableMs - dtMs);
      this._movePlayerGrid(p, dtSec);
      this._collectPowerup(p);
    }

    // 2. Atualiza bombas chutadas e fusíveis
    updateMovingBombs(this, dtSec);
    const toDetonate = [];
    for (const bomb of this.bombs.values()) {
      bomb.fuseRemainingMs -= dtMs;
      // Libera passableBy assim que o jogador sair completamente do bloco da bomba
      for (const pid of bomb.passableBy) {
        const pl = this.players.get(pid);
        if (!pl || !pl.alive) {
          bomb.passableBy.delete(pid);
          continue;
        }
        const onOrigin = pl.col === bomb.col && pl.row === bomb.row;
        const onTarget = pl.targetCol === bomb.col && pl.targetRow === bomb.row;
        if (!onOrigin && !onTarget) {
          bomb.passableBy.delete(pid);
        }
      }
      if (bomb.fuseRemainingMs <= 0) {
        toDetonate.push(bomb.id);
      }
    }

    for (const bombId of toDetonate) {
      this._detonateBomb(bombId);
    }

    // 3. Atualiza explosões ativas e dano
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      const exp = this.explosions[i];
      exp.remainingMs -= dtMs;
      this._applyExplosionDamage(exp);
      if (exp.remainingMs <= 0) {
        this.explosions.splice(i, 1);
      }
    }

    // 4. Sudden Death nos últimos 60s
    const remainingMs = Math.max(0, this.durationMs - this.elapsedMs);
    if (remainingMs <= this.suddenDeathAtRemainingMs) {
      this.suddenDeathActive = true;
      this.suddenDeathTimerMs += dtMs;
      if (this.suddenDeathTimerMs >= gameConfig.match.suddenDeathIntervalMs) {
        this.suddenDeathTimerMs = 0;
        this._dropSuddenDeathBlock();
      }
    }

    // 5. Checa vitória / empate somente quando restar <= 1 jogador vivo ou acabar o tempo
    this._checkEndConditions(remainingMs);
  }

  _pickDesiredDirection(player) {
    const order = ['up', 'down', 'left', 'right'];
    if (player.lastDirPressed && player.input[player.lastDirPressed]) {
      return player.lastDirPressed;
    }
    for (const dir of order) {
      if (player.input[dir]) return dir;
    }
    return null;
  }

  _canStepInto(player, targetCol, targetRow, dc, dr) {
    const tile = this.arena.grid[targetRow]?.[targetCol];
    if (tile === undefined || tile !== TILE.EMPTY) return false;

    for (const bomb of this.bombs.values()) {
      if (bomb.col === targetCol && bomb.row === targetRow) {
        if (bomb.passableBy.has(player.playerId)) return true;
        if (player.canKick && bomb.vx === 0 && bomb.vy === 0) {
          bomb.vx = dc;
          bomb.vy = dr;
        }
        return false;
      }
    }
    return true;
  }

  _movePlayerGrid(player, dtSec) {
    let budget = player.speed * dtSec;

    while (budget > 0) {
      // Se não está no meio de um passo entre blocos, tenta iniciar o próximo bloco
      if (player.targetCol === null || player.targetRow === null) {
        const dir = this._pickDesiredDirection(player);
        if (!dir) {
          player.moving = false;
          player.moveProgress = 0;
          player.x = player.col + 0.5;
          player.y = player.row + 0.5;
          return;
        }

        player.dir = dir;
        const { dc, dr } = DIR_DELTAS[dir];
        const nextCol = player.col + dc;
        const nextRow = player.row + dr;

        if (!this._canStepInto(player, nextCol, nextRow, dc, dr)) {
          player.moving = false;
          player.moveProgress = 0;
          player.x = player.col + 0.5;
          player.y = player.row + 0.5;
          return;
        }

        player.targetCol = nextCol;
        player.targetRow = nextRow;
        player.moveProgress = 0;
        player.moving = true;
      }

      // Avança exatamente ao longo do passo de 1 bloco até o centro do bloco destino
      const needed = 1 - player.moveProgress;
      if (budget >= needed) {
        budget -= needed;
        player.col = player.targetCol;
        player.row = player.targetRow;
        player.targetCol = null;
        player.targetRow = null;
        player.moveProgress = 0;
        player.x = player.col + 0.5;
        player.y = player.row + 0.5;
        this._collectPowerup(player);
      } else {
        player.moveProgress += budget;
        budget = 0;
        player.x = player.col + 0.5 + (player.targetCol - player.col) * player.moveProgress;
        player.y = player.row + 0.5 + (player.targetRow - player.row) * player.moveProgress;
        player.moving = true;
      }
    }
  }

  _collectPowerup(player) {
    const { col, row } = this._getCurrentTile(player);
    const key = `${col},${row}`;
    const item = this.powerups.get(key);
    if (!item) return;
    if (applyPowerup(player, item.type)) {
      this.powerups.delete(key);
    }
  }

  _detonateBomb(bombId) {
    const bomb = this.bombs.get(bombId);
    if (!bomb) return;
    this.bombs.delete(bombId);

    const owner = this.players.get(bomb.ownerId);
    if (owner) owner.activeBombs = Math.max(0, owner.activeBombs - 1);

    const { cells, destroyedBlocks } = computeExplosionCells(
      this.arena.grid,
      bomb.col,
      bomb.row,
      bomb.range,
      bomb.pierce
    );

    for (const blk of destroyedBlocks) {
      this.arena.grid[blk.row][blk.col] = TILE.EMPTY;
      if (owner) owner.score += 10;
      const drop = rollPowerup({ rng: this.rng });
      if (drop) {
        this.powerups.set(`${blk.col},${blk.row}`, {
          col: blk.col,
          row: blk.row,
          type: drop,
        });
      }
    }

    const exp = {
      id: bomb.id,
      ownerId: bomb.ownerId,
      cells,
      remainingMs: gameConfig.bomb.explosionDurationMs,
    };
    this.explosions.push(exp);
    this._applyExplosionDamage(exp);

    // Reação em cadeia com outras bombas atingidas
    for (const cell of cells) {
      for (const other of this.bombs.values()) {
        if (other.col === cell.col && other.row === cell.row) {
          other.fuseRemainingMs = 0;
        }
      }
      // Queima powerups no chão (exceto os recém-criados neste mesmo tick)
      const isNewDrop = destroyedBlocks.some((b) => b.col === cell.col && b.row === cell.row);
      if (!isNewDrop) {
        this.powerups.delete(`${cell.col},${cell.row}`);
      }
    }
  }

  _applyExplosionDamage(exp) {
    const cellSet = new Set(exp.cells.map((c) => `${c.col},${c.row}`));
    for (const p of this.players.values()) {
      if (!p.alive || p.invulnerableMs > 0) continue;
      const { col, row } = this._getCurrentTile(p);
      const key = `${col},${row}`;
      if (cellSet.has(key)) {
        p.alive = false;
        p.moving = false;
        if (exp.ownerId && exp.ownerId !== p.playerId) {
          const killer = this.players.get(exp.ownerId);
          if (killer) {
            killer.kills += 1;
            killer.score += 200;
          }
        }
      }
    }
  }

  _dropSuddenDeathBlock() {
    const { cols, rows, grid } = this.arena;
    const ring = this.suddenDeathRing;
    if (ring >= Math.floor(Math.min(cols, rows) / 2)) return;

    const { col, row } = this.suddenDeathCursor;
    if (row > 0 && row < rows - 1 && col > 0 && col < cols - 1) {
      grid[row][col] = TILE.HARD;
      this.powerups.delete(`${col},${row}`);
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const t = this._getCurrentTile(p);
        if (t.col === col && t.row === row) {
          p.alive = false;
        }
      }
    }

    // Avança em espiral horária
    const minC = ring;
    const maxC = cols - 1 - ring;
    const minR = ring;
    const maxR = rows - 1 - ring;

    if (row === minR && col < maxC) this.suddenDeathCursor.col += 1;
    else if (col === maxC && row < maxR) this.suddenDeathCursor.row += 1;
    else if (row === maxR && col > minC) this.suddenDeathCursor.col -= 1;
    else if (col === minC && row > minR + 1) this.suddenDeathCursor.row -= 1;
    else {
      this.suddenDeathRing += 1;
      this.suddenDeathCursor = { col: this.suddenDeathRing, row: this.suddenDeathRing, dir: 0 };
    }
  }

  _checkEndConditions(remainingMs) {
    const alivePlayers = Array.from(this.players.values()).filter((p) => p.alive);
    if (alivePlayers.length <= 1) {
      this.status = 'finished';
      this.winnerId = alivePlayers[0]?.playerId || null;
      this.finishReason = alivePlayers.length === 1 ? 'LAST_STANDING' : 'DRAW';
      this.onMatchFinished(this.getResult());
      return;
    }

    if (remainingMs <= 0) {
      this.status = 'finished';
      alivePlayers.sort((a, b) => b.score - a.score || b.kills - a.kills);
      this.winnerId = alivePlayers[0]?.playerId || null;
      this.finishReason = 'TIME_UP';
      this.onMatchFinished(this.getResult());
    }
  }

  getResult() {
    const ranking = Array.from(this.players.values())
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        character: p.character,
        alive: p.alive,
        kills: p.kills,
        score: p.score,
      }))
      .sort((a, b) => (b.alive === a.alive ? 0 : b.alive ? 1 : -1) || b.score - a.score || b.kills - a.kills);

    return {
      roomCode: this.roomCode,
      winnerId: this.winnerId,
      finishReason: this.finishReason,
      ranking,
    };
  }

  serializeInitialState() {
    return {
      roomCode: this.roomCode,
      arena: this.arena,
      durationMs: this.durationMs,
      state: this.serializeTickState(),
    };
  }

  serializeTickState() {
    return {
      status: this.status,
      remainingMs: Math.max(0, this.durationMs - this.elapsedMs),
      suddenDeathActive: this.suddenDeathActive,
      grid: this.arena.grid,
      players: Array.from(this.players.values()).map((p) => ({
        playerId: p.playerId,
        name: p.name,
        character: p.character,
        col: p.col,
        row: p.row,
        x: Number(p.x.toFixed(3)),
        y: Number(p.y.toFixed(3)),
        dir: p.dir,
        moving: p.moving,
        alive: p.alive,
        connected: p.connected,
        isBot: p.isBot,
        invulnerableMs: p.invulnerableMs,
        maxBombs: p.maxBombs,
        activeBombs: p.activeBombs,
        bombRange: p.bombRange,
        speed: p.speed,
        canKick: p.canKick,
        pierceBombs: p.pierceBombs,
        kills: p.kills,
        score: p.score,
      })),
      bombs: Array.from(this.bombs.values()).map((b) => ({
        id: b.id,
        col: b.col,
        row: b.row,
        x: Number(b.x.toFixed(3)),
        y: Number(b.y.toFixed(3)),
        fuseRemainingMs: b.fuseRemainingMs,
      })),
      explosions: this.explosions.map((e) => ({
        id: e.id,
        cells: e.cells,
        remainingMs: e.remainingMs,
      })),
      powerups: Array.from(this.powerups.values()),
    };
  }
}

module.exports = MatchEngine;
