'use strict';

const gameConfig = require('../config/gameConfig');

const TILE = Object.freeze({
  EMPTY: 0,
  HARD: 1,
  SOFT: 2,
});

// Mantido para compatibilidade de exportação
const SPAWN_CORNERS = Object.freeze([
  { col: 1, row: 1 },
  { col: 15, row: 13 },
  { col: 15, row: 1 },
  { col: 1, row: 13 },
]);

function shuffle(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSafeZone(col, row, spawns = SPAWN_CORNERS) {
  for (const s of spawns) {
    if (Math.abs(col - s.col) + Math.abs(row - s.row) <= 2) {
      return true;
    }
  }
  return false;
}

function isAreaConnected(grid, spawns) {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const start = spawns[0];
  const queue = [[start.col, start.row]];
  visited[start.row][start.col] = true;

  let walkableCount = 0;
  for (let r = 1; r < rows - 1; r += 1) {
    for (let c = 1; c < cols - 1; c += 1) {
      if (grid[r][c] !== TILE.HARD) walkableCount += 1;
    }
  }

  let reachedWalkable = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length > 0) {
    const [c, r] = queue.shift();
    reachedWalkable += 1;
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && !visited[nr][nc] && grid[nr][nc] !== TILE.HARD) {
        visited[nr][nc] = true;
        queue.push([nc, nr]);
      }
    }
  }

  if (reachedWalkable !== walkableCount) return false;
  return spawns.every((s) => visited[s.row][s.col]);
}

function pickRandomSpawns(grid, count, rng) {
  const rows = grid.length;
  const cols = grid[0].length;
  const candidates = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let r = 1; r < rows - 1; r += 1) {
    for (let c = 1; c < cols - 1; c += 1) {
      if (grid[r][c] !== TILE.EMPTY) continue;
      // Garante pelo menos 2 saídas ortogonais ou corredor em L para poder escapar da própria bomba
      const openNeighbors = dirs.filter(([dc, dr]) => grid[r + dr][c + dc] === TILE.EMPTY);
      if (openNeighbors.length >= 2) {
        candidates.push({ col: c, row: r });
      }
    }
  }

  const shuffled = shuffle(candidates, rng);
  const chosen = [];
  for (const minDist of [5, 3, 2, 1]) {
    for (const cand of shuffled) {
      if (chosen.length >= count) break;
      if (chosen.some((s) => s.col === cand.col && s.row === cand.row)) continue;
      const farEnough = chosen.every(
        (s) => Math.abs(s.col - cand.col) + Math.abs(s.row - cand.row) >= minDist
      );
      if (farEnough) chosen.push(cand);
    }
    if (chosen.length >= count) break;
  }

  return chosen.length >= count ? chosen : SPAWN_CORNERS.slice(0, count);
}

function generateArena({
  cols = gameConfig.arena.cols,
  rows = gameConfig.arena.rows,
  destructibleChance = gameConfig.arena.destructibleChance,
  pillarChance = 0.78,
  theme = null,
  rng = Math.random,
} = {}) {
  const chosenTheme =
    theme && gameConfig.arena.themes.includes(theme)
      ? theme
      : gameConfig.arena.themes[Math.floor(rng() * gameConfig.arena.themes.length)];

  let grid;
  let spawns;

  // Gera layout aleatório de obstáculos duros e spawns até garantir conectividade total
  for (let attempt = 0; attempt < 25; attempt += 1) {
    grid = Array.from({ length: rows }, () => Array(cols).fill(TILE.EMPTY));

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const isBorder = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
        if (isBorder) {
          grid[r][c] = TILE.HARD;
        } else if (r % 2 === 0 && c % 2 === 0 && rng() < pillarChance) {
          grid[r][c] = TILE.HARD;
        }
      }
    }

    // Adiciona alguns obstáculos indestrutíveis extras aleatórios em posições não-adjacentes
    const extraHardTarget = Math.floor(((cols - 2) * (rows - 2)) * 0.05);
    let placedExtra = 0;
    for (let tries = 0; tries < extraHardTarget * 8 && placedExtra < extraHardTarget; tries += 1) {
      const rc = 1 + Math.floor(rng() * (cols - 2));
      const rr = 1 + Math.floor(rng() * (rows - 2));
      if (grid[rr][rc] === TILE.EMPTY) {
        grid[rr][rc] = TILE.HARD;
        placedExtra += 1;
      }
    }

    spawns = pickRandomSpawns(grid, gameConfig.room.maxPlayers, rng);
    if (isAreaConnected(grid, spawns)) break;
  }

  // Preenche blocos destrutíveis aleatórios respeitando zona segura (raio Manhattan <= 2) de cada spawn
  for (let r = 1; r < rows - 1; r += 1) {
    for (let c = 1; c < cols - 1; c += 1) {
      if (grid[r][c] !== TILE.EMPTY) continue;
      if (!isSafeZone(c, r, spawns) && rng() < destructibleChance) {
        grid[r][c] = TILE.SOFT;
      }
    }
  }

  return {
    cols,
    rows,
    theme: chosenTheme,
    grid,
    spawns: spawns.map((s) => ({
      col: s.col,
      row: s.row,
      x: s.col + 0.5,
      y: s.row + 0.5,
    })),
  };
}

module.exports = { TILE, SPAWN_CORNERS, isSafeZone, generateArena };
