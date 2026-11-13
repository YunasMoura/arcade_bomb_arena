'use strict';

const { TILE } = require('./ArenaGenerator');
const { computeExplosionCells } = require('./BombSystem');

const DIRS = [
  { name: 'up', dc: 0, dr: -1 },
  { name: 'down', dc: 0, dr: 1 },
  { name: 'left', dc: -1, dr: 0 },
  { name: 'right', dc: 1, dr: 0 },
];

function keyOf(col, row) {
  return `${col},${row}`;
}

class BotController {
  constructor(engine) {
    this.engine = engine;
    this.decisionCooldown = new Map();
  }

  update(dtMs) {
    if (this.engine.status !== 'playing') return;

    const bots = Array.from(this.engine.players.values()).filter((p) => p.alive && p.isBot);
    if (bots.length === 0) return;

    const dangerMap = this._computeDangerMap();

    for (const bot of bots) {
      const rem = (this.decisionCooldown.get(bot.playerId) || 0) - dtMs;
      const isStepping = bot.targetCol !== null && bot.targetRow !== null;
      const inDanger = dangerMap.has(keyOf(bot.col, bot.row));

      if (!inDanger && (isStepping || rem > 0)) {
        this.decisionCooldown.set(bot.playerId, Math.max(0, rem));
        continue;
      }

      this.decisionCooldown.set(bot.playerId, 110 + Math.floor(Math.random() * 60));
      this._decideForBot(bot, dangerMap);
    }
  }

  _computeDangerMap() {
    const danger = new Map();
    const { grid } = this.engine.arena;

    for (const exp of this.engine.explosions) {
      for (const cell of exp.cells) {
        danger.set(keyOf(cell.col, cell.row), 0);
      }
    }

    for (const bomb of this.engine.bombs.values()) {
      const { cells } = computeExplosionCells(grid, bomb.col, bomb.row, bomb.range, bomb.pierce);
      for (const cell of cells) {
        const k = keyOf(cell.col, cell.row);
        const prev = danger.get(k);
        if (prev === undefined || bomb.fuseRemainingMs < prev) {
          danger.set(k, bomb.fuseRemainingMs);
        }
      }
    }

    return danger;
  }

  _canWalk(bot, col, row) {
    const { grid } = this.engine.arena;
    if (grid[row]?.[col] !== TILE.EMPTY) return false;
    for (const bomb of this.engine.bombs.values()) {
      if (bomb.col === col && bomb.row === row && !bomb.passableBy.has(bot.playerId)) {
        return false;
      }
    }
    return true;
  }

  _findShortestPath(bot, dangerMap, goalFn, { avoidDanger = true, maxSteps = 18 } = {}) {
    const startCol = bot.targetCol !== null ? bot.targetCol : bot.col;
    const startRow = bot.targetRow !== null ? bot.targetRow : bot.row;

    if (goalFn(startCol, startRow)) {
      return { reached: true, firstDir: null, dist: 0 };
    }

    const queue = [{ col: startCol, row: startRow, firstDir: null, dist: 0 }];
    const visited = new Set([keyOf(startCol, startRow)]);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.dist >= maxSteps) continue;

      for (const d of DIRS) {
        const nc = curr.col + d.dc;
        const nr = curr.row + d.dr;
        const k = keyOf(nc, nr);
        if (visited.has(k)) continue;
        if (!this._canWalk(bot, nc, nr)) continue;

        const tileDanger = dangerMap.get(k);
        if (avoidDanger && tileDanger !== undefined && tileDanger < 1600) continue;

        visited.add(k);
        const firstDir = curr.firstDir || d.name;
        if (goalFn(nc, nr)) {
          return { reached: true, firstDir, dist: curr.dist + 1 };
        }
        queue.push({ col: nc, row: nr, firstDir, dist: curr.dist + 1 });
      }
    }

    return { reached: false, firstDir: null, dist: Infinity };
  }

  _canEscapeAfterPlacingBomb(bot, dangerMap) {
    const { grid } = this.engine.arena;
    const simulatedDanger = new Map(dangerMap);
    const { cells } = computeExplosionCells(grid, bot.col, bot.row, bot.bombRange, bot.pierceBombs);
    for (const cell of cells) {
      const k = keyOf(cell.col, cell.row);
      if (!simulatedDanger.has(k)) {
        simulatedDanger.set(k, 2800);
      }
    }

    const queue = [{ col: bot.col, row: bot.row, dist: 0 }];
    const visited = new Set([keyOf(bot.col, bot.row)]);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (!simulatedDanger.has(keyOf(curr.col, curr.row))) {
        return true;
      }
      if (curr.dist >= 8) continue;

      for (const d of DIRS) {
        const nc = curr.col + d.dc;
        const nr = curr.row + d.dr;
        const k = keyOf(nc, nr);
        if (visited.has(k)) continue;
        if (grid[nr]?.[nc] !== TILE.EMPTY) continue;
        const blockedByOtherBomb = Array.from(this.engine.bombs.values()).some(
          (b) => b.col === nc && b.row === nr && !b.passableBy.has(bot.playerId)
        );
        if (blockedByOtherBomb) continue;

        const dTime = simulatedDanger.get(k);
        if (dTime !== undefined && dTime < (curr.dist + 1) * 260) continue;

        visited.add(k);
        queue.push({ col: nc, row: nr, dist: curr.dist + 1 });
      }
    }

    return false;
  }

  _hasUsefulBombTarget(bot) {
    const { grid } = this.engine.arena;
    const { cells } = computeExplosionCells(grid, bot.col, bot.row, bot.bombRange, bot.pierceBombs);

    for (const cell of cells) {
      if (grid[cell.row]?.[cell.col] === TILE.SOFT) return true;
      for (const other of this.engine.players.values()) {
        if (other.alive && other.playerId !== bot.playerId && other.col === cell.col && other.row === cell.row) {
          return true;
        }
      }
    }
    return false;
  }

  _setMoveDir(bot, dirName) {
    this.engine.setInput(bot.playerId, {
      up: dirName === 'up',
      down: dirName === 'down',
      left: dirName === 'left',
      right: dirName === 'right',
    });
  }

  _decideForBot(bot, dangerMap) {
    const currentKey = keyOf(bot.col, bot.row);

    if (dangerMap.has(currentKey)) {
      const escape = this._findShortestPath(
        bot,
        dangerMap,
        (c, r) => !dangerMap.has(keyOf(c, r)),
        { avoidDanger: false, maxSteps: 10 }
      );
      this._setMoveDir(bot, escape.firstDir);
      return;
    }

    if (
      bot.targetCol === null &&
      bot.activeBombs < bot.maxBombs &&
      this._hasUsefulBombTarget(bot) &&
      this._canEscapeAfterPlacingBomb(bot, dangerMap)
    ) {
      const res = this.engine.placeBomb(bot.playerId);
      if (res.ok) {
        const updatedDanger = this._computeDangerMap();
        const escape = this._findShortestPath(
          bot,
          updatedDanger,
          (c, r) => !updatedDanger.has(keyOf(c, r)),
          { avoidDanger: false, maxSteps: 10 }
        );
        this._setMoveDir(bot, escape.firstDir);
        return;
      }
    }

    if (this.engine.powerups.size > 0) {
      const toPowerup = this._findShortestPath(
        bot,
        dangerMap,
        (c, r) => this.engine.powerups.has(keyOf(c, r)),
        { avoidDanger: true, maxSteps: 12 }
      );
      if (toPowerup.reached && toPowerup.firstDir) {
        this._setMoveDir(bot, toPowerup.firstDir);
        return;
      }
    }

    const { grid } = this.engine.arena;
    const enemies = Array.from(this.engine.players.values()).filter(
      (p) => p.alive && p.playerId !== bot.playerId
    );

    const toTarget = this._findShortestPath(
      bot,
      dangerMap,
      (c, r) => {
        if (c === bot.col && r === bot.row) return false;
        const nearSoft = DIRS.some((d) => grid[r + d.dr]?.[c + d.dc] === TILE.SOFT);
        const nearEnemy = enemies.some((e) => Math.abs(e.col - c) + Math.abs(e.row - r) <= 2);
        return nearSoft || nearEnemy;
      },
      { avoidDanger: true, maxSteps: 18 }
    );

    if (toTarget.reached && toTarget.firstDir) {
      this._setMoveDir(bot, toTarget.firstDir);
      return;
    }

    const safeDirs = DIRS.filter((d) => {
      const nc = bot.col + d.dc;
      const nr = bot.row + d.dr;
      return this._canWalk(bot, nc, nr) && !dangerMap.has(keyOf(nc, nr));
    });
    if (safeDirs.length > 0) {
      const pick = safeDirs[Math.floor(Math.random() * safeDirs.length)];
      this._setMoveDir(bot, pick.name);
    } else {
      this._setMoveDir(bot, null);
    }
  }
}

module.exports = BotController;
