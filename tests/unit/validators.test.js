'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeName, isValidToken } = require('../../server/utils/validators');

test('sanitizeName: mantém nomes válidos', () => {
  assert.equal(sanitizeName('Rex'), 'Rex');
  assert.equal(sanitizeName('João_99'), 'João_99');
});

test('sanitizeName: remove HTML e símbolos', () => {
  assert.equal(sanitizeName('<b>Rex</b>'), 'bRexb');
  assert.equal(sanitizeName('a<script>x</script>'), 'ascriptxscript'.slice(0, 12));
});

test('sanitizeName: limita a 12 caracteres e colapsa espaços', () => {
  assert.equal(sanitizeName('abcdefghijklmnopqrstuvwxyz').length, 12);
  assert.equal(sanitizeName('  a   b  '), 'a b');
});

test('sanitizeName: entradas não-string ou vazias viram string vazia', () => {
  for (const v of [undefined, null, 42, {}, [], '', '   ', '!!!']) {
    assert.equal(sanitizeName(v), '');
  }
});

test('isValidToken', () => {
  assert.equal(isValidToken('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(isValidToken('curto'), false);
  assert.equal(isValidToken('x'.repeat(65)), false);
  assert.equal(isValidToken('abc def ghi jkl mno pqr'), false);
  assert.equal(isValidToken(12345678901234567), false);
});
