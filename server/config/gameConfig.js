'use strict';

const gameConfig = Object.freeze({
  server: Object.freeze({
    port: Number(process.env.PORT) || 3000,
    tickRate: 60,
    broadcastRate: 30,
  }),

  session: Object.freeze({
    reconnectGraceMs: 30000,
    tokenPattern: /^[A-Za-z0-9-]{16,64}$/,
  }),

  player: Object.freeze({
    nameMinLength: 1,
    nameMaxLength: 12,
    defaultName: 'Jogador',
    characters: Object.freeze(['rex', 'luna', 'byte', 'niko']),
    defaultCharacter: 'rex',
    baseSpeed: 4.4, // tiles por segundo
    maxSpeed: 7.2,
    speedStep: 0.55,
    radius: 0.34, // raio de colisão em tiles
    invulnerableSpawnMs: 1500,
  }),

  rateLimit: Object.freeze({
    windowMs: 1000,
    maxEventsPerWindow: 60,
    maxViolations: 10,
  }),

  clockSync: Object.freeze({
    samples: 5,
  }),

  room: Object.freeze({
    maxPlayers: 4,
    minPlayersToStart: 2,
    codeLength: 6,
    codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    matchmakingCountdownMs: 8000,
    manualStartCountdownMs: 3000,
  }),

  arena: Object.freeze({
    cols: 17,
    rows: 15,
    tileSize: 44,
    destructibleChance: 0.72,
    themes: Object.freeze(['neon_city', 'cyber_ruins', 'volcanic_core']),
  }),

  match: Object.freeze({
    durationMs: 4 * 60 * 1000, // 4 minutos
    suddenDeathAtRemainingMs: 60 * 1000,
    suddenDeathIntervalMs: 700,
  }),

  bomb: Object.freeze({
    fuseMs: 3000,
    explosionDurationMs: 550,
    startRange: 2,
    maxRange: 7,
    placeCooldownMs: 220,
    startMaxSimultaneous: 1,
    maxSimultaneous: 5,
  }),

  powerups: Object.freeze({
    dropChance: 0.42,
    types: Object.freeze(['bomb_up', 'fire_up', 'speed_up', 'kick', 'pierce']),
    weights: Object.freeze({
      bomb_up: 30,
      fire_up: 30,
      speed_up: 24,
      kick: 10,
      pierce: 6,
    }),
  }),
});

module.exports = gameConfig;
