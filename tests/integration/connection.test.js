'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: connect } = require('socket.io-client');
const { createGameServer } = require('../../server');

const T1 = 'integration-token-000000000001';
const T2 = 'integration-token-000000000002';

function once(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function setup(opts) {
  const server = createGameServer({ port: 0, ...opts });
  const port = await server.start();
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  const client = () => {
    const c = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(c);
    return c;
  };
  const teardown = async () => {
    clients.forEach((c) => c.close());
    await server.stop();
  };
  return { server, url, client, teardown };
}

test('servidor inicia, responde /health e serve o cliente', async () => {
  const { url, teardown } = await setup();
  try {
    const health = await get(`${url}/health`);
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).status, 'ok');
    const page = await get(`${url}/`);
    assert.equal(page.status, 200);
    assert.match(page.body, /Arcade Bomb Arena/);
  } finally { await teardown(); }
});

test('cliente conecta, entra com nome e recebe player:joined', async () => {
  const { client, teardown } = await setup();
  try {
    const c = client();
    await once(c, 'connect');
    const joined = once(c, 'player:joined');
    c.emit('player:join', { name: 'Rex', token: T1 });
    const data = await joined;
    assert.equal(data.name, 'Rex');
    assert.equal(data.resumed, false);
    assert.equal(typeof data.playerId, 'string');
    assert.equal(typeof data.serverTime, 'number');
  } finally { await teardown(); }
});

test('nome é sanitizado e limitado pelo servidor', async () => {
  const { client, teardown } = await setup();
  try {
    const c = client();
    await once(c, 'connect');
    const joined = once(c, 'player:joined');
    c.emit('player:join', { name: '<img src=x>ABCDEFGHIJKLMNOP', token: T1 });
    const data = await joined;
    assert.ok(data.name.length <= 12);
    assert.doesNotMatch(data.name, /[<>=]/);
  } finally { await teardown(); }
});

test('token inválido e payload inválido geram player:error', async () => {
  const { client, teardown } = await setup();
  try {
    const c = client();
    await once(c, 'connect');
    let err = once(c, 'player:error');
    c.emit('player:join', { name: 'Rex', token: 'x' });
    assert.equal((await err).code, 'INVALID_TOKEN');
    err = once(c, 'player:error');
    c.emit('player:join', 'lixo');
    assert.equal((await err).code, 'INVALID_PAYLOAD');
  } finally { await teardown(); }
});

test('desconexão e reconexão com o mesmo token retomam a sessão', async () => {
  const { client, server, teardown } = await setup();
  try {
    const a = client();
    await once(a, 'connect');
    const j1 = once(a, 'player:joined');
    a.emit('player:join', { name: 'Rex', token: T1 });
    const first = await j1;

    a.close();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(server.sessions.byToken.get(T1).connected, false);

    const b = client();
    await once(b, 'connect');
    const j2 = once(b, 'player:joined');
    b.emit('player:join', { name: 'Rex', token: T1 });
    const second = await j2;
    assert.equal(second.resumed, true);
    assert.equal(second.playerId, first.playerId);
  } finally { await teardown(); }
});

test('sessão expira depois do prazo de reconexão', async () => {
  const { client, server, teardown } = await setup({ sessionGraceMs: 60 });
  try {
    const a = client();
    await once(a, 'connect');
    const j = once(a, 'player:joined');
    a.emit('player:join', { name: 'Rex', token: T1 });
    await j;
    a.close();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(server.sessions.size, 0);
  } finally { await teardown(); }
});

test('mesmo token em duas conexões: a antiga é substituída', async () => {
  const { client, teardown } = await setup();
  try {
    const a = client();
    await once(a, 'connect');
    const j1 = once(a, 'player:joined');
    a.emit('player:join', { name: 'Rex', token: T1 });
    await j1;

    const replaced = once(a, 'session:replaced');
    const closed = once(a, 'disconnect');
    const b = client();
    await once(b, 'connect');
    const j2 = once(b, 'player:joined');
    b.emit('player:join', { name: 'Rex', token: T1 });
    await j2;
    await replaced;
    await closed;
  } finally { await teardown(); }
});

test('tokens diferentes são jogadores diferentes', async () => {
  const { client, teardown } = await setup();
  try {
    const a = client(); const b = client();
    await Promise.all([once(a, 'connect'), once(b, 'connect')]);
    const ja = once(a, 'player:joined'); const jb = once(b, 'player:joined');
    a.emit('player:join', { name: 'Rex', token: T1 });
    b.emit('player:join', { name: 'Luna', token: T2 });
    const [da, db] = await Promise.all([ja, jb]);
    assert.notEqual(da.playerId, db.playerId);
  } finally { await teardown(); }
});

test('time:ping devolve serverTime via ack', async () => {
  const { client, teardown } = await setup();
  try {
    const c = client();
    await once(c, 'connect');
    const res = await new Promise((resolve) => c.emit('time:ping', { clientTime: 123 }, resolve));
    assert.equal(res.clientTime, 123);
    assert.ok(Math.abs(res.serverTime - Date.now()) < 5000);
  } finally { await teardown(); }
});

test('limite de taxa: excesso de eventos gera rate:limited', async () => {
  const { client, teardown } = await setup();
  try {
    const c = client();
    await once(c, 'connect');
    const limited = once(c, 'rate:limited');
    for (let i = 0; i < 75; i++) c.emit('player:join', { name: 'x', token: 'curto' });
    await limited;
  } finally { await teardown(); }
});
