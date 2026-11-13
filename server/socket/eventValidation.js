'use strict';

const gameConfig = require('../config/gameConfig');
const { sanitizeName, isValidToken, isPlainObject } = require('../utils/validators');

function createRateLimiter({
  windowMs = gameConfig.rateLimit.windowMs,
  max = gameConfig.rateLimit.maxEventsPerWindow,
  maxViolations = gameConfig.rateLimit.maxViolations,
  now = Date.now,
} = {}) {
  let windowStart = now();
  let count = 0;
  let violations = 0;

  return {
    allow() {
      const t = now();
      if (t - windowStart >= windowMs) {
        windowStart = t;
        count = 0;
      }
      count += 1;
      if (count <= max) return 'ok';
      violations += 1;
      return violations >= maxViolations ? 'kick' : 'limited';
    },
  };
}

function validateJoinPayload(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Dados de entrada inválidos.' };
  }
  if (!isValidToken(payload.token)) {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Identificador de sessão inválido.' };
  }
  const name = sanitizeName(payload.name) || gameConfig.player.defaultName;
  const character = gameConfig.player.characters.includes(payload.character)
    ? payload.character
    : gameConfig.player.defaultCharacter;
  return { ok: true, value: { name, token: payload.token, character } };
}

function validateRoomCreatePayload(payload) {
  if (payload !== undefined && payload !== null && !isPlainObject(payload)) {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Dados da sala inválidos.' };
  }
  const data = payload || {};
  const character = gameConfig.player.characters.includes(data.character) ? data.character : undefined;
  return { ok: true, value: { character } };
}

function validateRoomJoinPayload(payload) {
  if (!isPlainObject(payload) || typeof payload.code !== 'string') {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Informe o código da sala.' };
  }
  const code = payload.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    return { ok: false, code: 'INVALID_ROOM_CODE', message: 'Código de sala inválido.' };
  }
  const character = gameConfig.player.characters.includes(payload.character) ? payload.character : undefined;
  return { ok: true, value: { code, character } };
}

function validateReadyPayload(payload) {
  if (!isPlainObject(payload) || typeof payload.ready !== 'boolean') {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Estado de prontidão inválido.' };
  }
  return { ok: true, value: { ready: payload.ready } };
}

function validateCharacterPayload(payload) {
  if (!isPlainObject(payload) || typeof payload.character !== 'string') {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Personagem inválido.' };
  }
  if (!gameConfig.player.characters.includes(payload.character)) {
    return { ok: false, code: 'INVALID_CHARACTER', message: 'Personagem desconhecido.' };
  }
  return { ok: true, value: { character: payload.character } };
}

module.exports = {
  createRateLimiter,
  validateJoinPayload,
  validateRoomCreatePayload,
  validateRoomJoinPayload,
  validateReadyPayload,
  validateCharacterPayload,
};
