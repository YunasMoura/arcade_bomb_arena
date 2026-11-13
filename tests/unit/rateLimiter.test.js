'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter, validateJoinPayload } = require('../../server/socket/eventValidation');

test('rateLimiter: permite até o máximo por janela', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 3, maxViolations: 3, now: () => t });
  assert.deepEqual([rl.allow(), rl.allow(), rl.allow()], ['ok', 'ok', 'ok']);
  assert.equal(rl.allow(), 'limited');
});

test('rateLimiter: nova janela zera a contagem', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 1, maxViolations: 5, now: () => t });
  assert.equal(rl.allow(), 'ok');
  assert.equal(rl.allow(), 'limited');
  t = 1000;
  assert.equal(rl.allow(), 'ok');
});

test('rateLimiter: violações repetidas resultam em kick', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 1, maxViolations: 3, now: () => t });
  rl.allow();
  assert.equal(rl.allow(), 'limited');
  assert.equal(rl.allow(), 'limited');
  assert.equal(rl.allow(), 'kick');
});

test('validateJoinPayload', () => {
  const token = 'a'.repeat(20);
  assert.equal(validateJoinPayload(null).ok, false);
  assert.equal(validateJoinPayload([]).ok, false);
  assert.equal(validateJoinPayload({ name: 'x', token: 'curto' }).code, 'INVALID_TOKEN');
  const ok = validateJoinPayload({ name: '   ', token });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, 'Jogador');
});
