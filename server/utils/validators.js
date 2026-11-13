'use strict';

const gameConfig = require('../config/gameConfig');

function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  const { nameMaxLength } = gameConfig.player;
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, nameMaxLength)
    .trim();
}

function isValidToken(token) {
  return typeof token === 'string' && gameConfig.session.tokenPattern.test(token);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

module.exports = { sanitizeName, isValidToken, isPlainObject };
