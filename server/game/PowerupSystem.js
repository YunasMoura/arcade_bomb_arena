'use strict';

const gameConfig = require('../config/gameConfig');

function rollPowerup({ rng = Math.random, dropChance = gameConfig.powerups.dropChance } = {}) {
  if (rng() > dropChance) return null;
  const weights = gameConfig.powerups.weights;
  const entries = Object.entries(weights);
  const total = entries.reduce((acc, [, w]) => acc + w, 0);
  let pick = rng() * total;
  for (const [type, weight] of entries) {
    pick -= weight;
    if (pick <= 0) return type;
  }
  return entries[0][0];
}

function applyPowerup(player, type) {
  switch (type) {
    case 'bomb_up':
      player.maxBombs = Math.min(gameConfig.bomb.maxSimultaneous, player.maxBombs + 1);
      break;
    case 'fire_up':
      player.bombRange = Math.min(gameConfig.bomb.maxRange, player.bombRange + 1);
      break;
    case 'speed_up':
      player.speed = Math.min(gameConfig.player.maxSpeed, Number((player.speed + gameConfig.player.speedStep).toFixed(2)));
      break;
    case 'kick':
      player.canKick = true;
      break;
    case 'pierce':
      player.pierceBombs = true;
      break;
    default:
      return false;
  }
  player.score += 50;
  return true;
}

module.exports = { rollPowerup, applyPowerup };
