'use strict';

const gameConfig = require('../config/gameConfig');
const { TILE } = require('./ArenaGenerator');

const DIRS = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

function computeExplosionCells(grid, originCol, originRow, range, pierce = false) {
  const rows = grid.length;
  const cols = grid[0].length;
  const cells = [{ col: originCol, row: originRow, dir: 'center', isTip: false }];
  const destroyedBlocks = [];

  for (const { dc, dr } of DIRS) {
    const dirName = dc === 1 ? 'right' : dc === -1 ? 'left' : dr === 1 ? 'down' : 'up';
    for (let step = 1; step <= range; step += 1) {
      const c = originCol + dc * step;
      const r = originRow + dr * step;
      if (r < 0 || r >= rows || c < 0 || c >= cols) break;

      const tile = grid[r][c];
      if (tile === TILE.HARD) break;

      if (tile === TILE.SOFT) {
        destroyedBlocks.push({ col: c, row: r });
        cells.push({ col: c, row: r, dir: dirName, isTip: true });
        if (!pierce) break;
      } else {
        cells.push({ col: c, row: r, dir: dirName, isTip: step === range });
      }
    }
  }

  return { cells, destroyedBlocks };
}

function updateMovingBombs(match, dtSec) {
  const speed = 9.5; // tiles/seg quando chutada
  for (const bomb of match.bombs.values()) {
    if (!bomb.vx && !bomb.vy) continue;
    const nextX = bomb.x + bomb.vx * speed * dtSec;
    const nextY = bomb.y + bomb.vy * speed * dtSec;
    const targetCol = Math.floor(nextX + Math.sign(bomb.vx) * 0.45);
    const targetRow = Math.floor(nextY + Math.sign(bomb.vy) * 0.45);

    const blockedTile =
      targetRow < 0 ||
      targetRow >= match.arena.rows ||
      targetCol < 0 ||
      targetCol >= match.arena.cols ||
      match.arena.grid[targetRow][targetCol] !== TILE.EMPTY;

    const blockedBomb = Array.from(match.bombs.values()).some(
      (other) => other.id !== bomb.id && other.col === targetCol && other.row === targetRow
    );

    const blockedPlayer = Array.from(match.players.values()).some(
      (p) => p.alive && Math.floor(p.x) === targetCol && Math.floor(p.y) === targetRow
    );

    if (blockedTile || blockedBomb || blockedPlayer) {
      bomb.vx = 0;
      bomb.vy = 0;
      bomb.col = Math.floor(bomb.x);
      bomb.row = Math.floor(bomb.y);
      bomb.x = bomb.col + 0.5;
      bomb.y = bomb.row + 0.5;
    } else {
      bomb.x = nextX;
      bomb.y = nextY;
      bomb.col = Math.floor(bomb.x);
      bomb.row = Math.floor(bomb.y);
    }
  }
}

module.exports = { computeExplosionCells, updateMovingBombs };
