'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SessionManager = require('../../server/socket/SessionManager');

const TOKEN = 'token-de-teste-0123456789';

test('attach cria sessão nova', () => {
  const sm = new SessionManager({ graceMs: 1000 });
  const { session, resumed, replacedSocketId } = sm.attach(TOKEN, 'Rex', 's1');
  assert.equal(resumed, false);
  assert.equal(replacedSocketId, null);
  assert.equal(session.connected, true);
  assert.equal(sm.getBySocket('s1').playerId, session.playerId);
  sm.dispose();
});

test('detach + attach com o mesmo token retoma a mesma identidade', () => {
  const sm = new SessionManager({ graceMs: 1000 });
  const first = sm.attach(TOKEN, 'Rex', 's1').session;
  sm.detach('s1');
  assert.equal(first.connected, false);
  const again = sm.attach(TOKEN, 'Rex', 's2');
  assert.equal(again.resumed, true);
  assert.equal(again.session.playerId, first.playerId);
  assert.equal(again.session.connected, true);
  sm.dispose();
});

test('segundo socket com o mesmo token substitui o primeiro', () => {
  const sm = new SessionManager({ graceMs: 1000 });
  sm.attach(TOKEN, 'Rex', 's1');
  const r = sm.attach(TOKEN, 'Rex', 's2');
  assert.equal(r.replacedSocketId, 's1');
  assert.equal(sm.getBySocket('s1'), null);
  sm.detach('s1');
  assert.equal(sm.getBySocket('s2').connected, true);
  sm.dispose();
});

test('sessão expira após o prazo de reconexão', async () => {
  let expired = null;
  const sm = new SessionManager({ graceMs: 30, onExpire: (s) => { expired = s; } });
  sm.attach(TOKEN, 'Rex', 's1');
  sm.detach('s1');
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(expired);
  assert.equal(sm.size, 0);
  assert.equal(sm.attach(TOKEN, 'Rex', 's3').resumed, false);
  sm.dispose();
});

test('mesmo socket trocando de token libera a sessão antiga', () => {
  const sm = new SessionManager({ graceMs: 1000 });
  const a = sm.attach(TOKEN, 'A', 's1').session;
  sm.attach('outro-token-0123456789', 'B', 's1');
  assert.equal(a.connected, false);
  sm.dispose();
});
