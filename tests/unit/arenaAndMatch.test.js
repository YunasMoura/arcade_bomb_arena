'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TILE, isSafeZone, generateArena } = require('../../server/game/ArenaGenerator');
const { computeExplosionCells } = require('../../server/game/BombSystem');
const { applyPowerup } = require('../../server/game/PowerupSystem');
const MatchEngine = require('../../server/game/MatchEngine');

test('ArenaGenerator: cria grade 17x15 com bordas duras, spawns válidos e zonas seguras', () => {
  const arena = generateArena({ destructibleChance: 1 });
  assert.equal(arena.cols, 17);
  assert.equal(arena.rows, 15);
  assert.equal(arena.grid.length, 15);
  assert.equal(arena.grid[0].length, 17);
  assert.equal(arena.spawns.length, 4);

  for (const s of arena.spawns) {
    assert.equal(arena.grid[s.row][s.col], TILE.EMPTY);
  }
  for (let r = 0; r < arena.rows; r += 1) {
    for (let c = 0; c < arena.cols; c += 1) {
      if (isSafeZone(c, r, arena.spawns)) {
        assert.notEqual(arena.grid[r][c], TILE.SOFT);
      }
    }
  }
});

test('BombSystem: explosão respeita blocos duros e para no primeiro bloco macio', () => {
  const grid = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 2, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  const { cells, destroyedBlocks } = computeExplosionCells(grid, 1, 1, 4, false);
  assert.equal(destroyedBlocks.length, 1);
  assert.deepEqual(destroyedBlocks[0], { col: 3, row: 1 });
  assert.equal(cells.some((c) => c.col === 4 && c.row === 1), false);
});

test('PowerupSystem: aplica upgrades respeitando limites máximos', () => {
  const player = { maxBombs: 1, bombRange: 2, speed: 4.4, canKick: false, pierceBombs: false, score: 0 };
  applyPowerup(player, 'bomb_up');
  applyPowerup(player, 'fire_up');
  applyPowerup(player, 'speed_up');
  applyPowerup(player, 'kick');
  applyPowerup(player, 'pierce');
  assert.equal(player.maxBombs, 2);
  assert.equal(player.bombRange, 3);
  assert.ok(player.speed > 4.4);
  assert.equal(player.canKick, true);
  assert.equal(player.pierceBombs, true);
  assert.equal(player.score, 250);
});

test('MatchEngine: movimentação por bloco, saída da bomba, explosão e eliminação', () => {
  const engine = new MatchEngine({
    roomCode: 'TEST01',
    roomPlayers: [
      { playerId: 'p1', name: 'Rex', character: 'rex' },
      { playerId: 'p2', name: 'Luna', character: 'luna' },
      { playerId: 'p3', name: 'Byte', character: 'byte' },
    ],
    rng: () => 0.99,
  });

  // Limpa miolo para teste determinístico de passo por bloco
  for (let r = 1; r < engine.arena.rows - 1; r += 1) {
    for (let c = 1; c < engine.arena.cols - 1; c += 1) {
      engine.arena.grid[r][c] = TILE.EMPTY;
    }
  }

  const p1 = engine.players.get('p1');
  const p2 = engine.players.get('p2');
  const p3 = engine.players.get('p3');
  p1.invulnerableMs = 0;
  p2.invulnerableMs = 0;
  p3.invulnerableMs = 0;

  p1.col = 1; p1.row = 1; p1.x = 1.5; p1.y = 1.5;
  p2.col = 2; p2.row = 1; p2.x = 2.5; p2.y = 1.5;
  p3.col = 10; p3.row = 10; p3.x = 10.5; p3.y = 10.5;

  // Planta bomba em (1,1) e sai para (1,4)
  const placed = engine.placeBomb('p1', Date.now());
  assert.equal(placed.ok, true);

  engine.setInput('p1', { down: true });
  engine.tick(700); // ~3.08 blocos -> chega em (1,4)
  engine.setInput('p1', {});
  engine.tick(100); // conclui alinhamento ao centro do bloco
  assert.equal(p1.col, 1);
  assert.equal(p1.row, 4);

  // Detona bomba: p2 morre, p1 e p3 continuam vivos
  engine.tick(2300);
  assert.equal(p2.alive, false);
  assert.equal(p1.alive, true);
  assert.equal(p3.alive, true);
  assert.equal(engine.status, 'playing');

  // Elimina p3 e verifica vitória exclusiva de p1
  p3.alive = false;
  engine.tick(50);
  assert.equal(engine.status, 'finished');
  assert.equal(engine.winnerId, 'p1');
});
