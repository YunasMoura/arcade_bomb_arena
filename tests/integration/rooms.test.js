'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createGameServer } = require('../../server');

function once(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

async function setup(opts) {
  const server = createGameServer({
    port: 0,
    manualStartCountdownMs: 80,
    matchmakingCountdownMs: 120,
    ...opts,
  });
  const port = await server.start();
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  const connectPlayer = async (name, token, character = 'rex') => {
    const c = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(c);
    await once(c, 'connect');
    const joined = once(c, 'player:joined');
    c.emit('player:join', { name, token, character });
    await joined;
    return c;
  };
  const teardown = async () => {
    clients.forEach((c) => c.close());
    await server.stop();
  };
  return { server, connectPlayer, teardown };
}

test('criação simultânea de salas gera códigos distintos', async () => {
  const { connectPlayer, teardown } = await setup();
  try {
    const c1 = await connectPlayer('Rex', 'room-token-000000000001');
    const c2 = await connectPlayer('Luna', 'room-token-000000000002');

    const p1 = once(c1, 'room:created');
    const p2 = once(c2, 'room:created');
    c1.emit('room:create', { character: 'rex' });
    c2.emit('room:create', { character: 'luna' });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.notEqual(r1.code, r2.code);
    assert.equal(r1.players.length, 1);
  } finally { await teardown(); }
});

test('entrada de 4 jogadores na mesma sala e bloqueio do 5º', async () => {
  const { connectPlayer, teardown } = await setup();
  try {
    const p1 = await connectPlayer('P1', 'room-token-000000000011');
    const p2 = await connectPlayer('P2', 'room-token-000000000012');
    const p3 = await connectPlayer('P3', 'room-token-000000000013');
    const p4 = await connectPlayer('P4', 'room-token-000000000014');
    const p5 = await connectPlayer('P5', 'room-token-000000000015');

    const createdP = once(p1, 'room:created');
    p1.emit('room:create', {});
    const { code } = await createdP;

    for (const px of [p2, p3, p4]) {
      const jp = once(px, 'room:joined');
      px.emit('room:join', { code });
      await jp;
    }

    const errP = once(p5, 'room:error');
    p5.emit('room:join', { code });
    const err = await errP;
    assert.equal(err.code, 'ROOM_FULL');
  } finally { await teardown(); }
});

test('código inválido retorna room:error e saída atualiza o lobby', async () => {
  const { connectPlayer, teardown } = await setup();
  try {
    const p1 = await connectPlayer('Rex', 'room-token-000000000021');
    const p2 = await connectPlayer('Luna', 'room-token-000000000022');

    const invalidP = once(p1, 'room:error');
    p1.emit('room:join', { code: 'XXXX99' });
    assert.equal((await invalidP).code, 'ROOM_NOT_FOUND');

    const createdP = once(p1, 'room:created');
    p1.emit('room:create', {});
    const { code } = await createdP;

    const joinedP = once(p2, 'room:joined');
    p2.emit('room:join', { code });
    await joinedP;

    const updatedP = once(p1, 'room:updated');
    const leftP = once(p2, 'room:left');
    p2.emit('room:leave');
    await leftP;
    const updated = await updatedP;
    assert.equal(updated.players.length, 1);
  } finally { await teardown(); }
});

test('prontidão e início da partida disparam game:started para a sala', async () => {
  const { connectPlayer, teardown } = await setup();
  try {
    const p1 = await connectPlayer('Rex', 'room-token-000000000031');
    const p2 = await connectPlayer('Luna', 'room-token-000000000032');

    const createdP = once(p1, 'room:created');
    p1.emit('room:create', {});
    const { code } = await createdP;

    const joinedP = once(p2, 'room:joined');
    p2.emit('room:join', { code });
    await joinedP;

    const started1 = once(p1, 'game:started');
    const started2 = once(p2, 'game:started');
    p1.emit('player:ready', { ready: true });
    p2.emit('player:ready', { ready: true });

    const [s1, s2] = await Promise.all([started1, started2]);
    assert.equal(s1.code, code);
    assert.equal(s2.players.length, 2);
  } finally { await teardown(); }
});

test('matchmaking pareia jogadores e inicia automaticamente', async () => {
  const { connectPlayer, teardown } = await setup();
  try {
    const p1 = await connectPlayer('Rex', 'room-token-000000000041');
    const p2 = await connectPlayer('Luna', 'room-token-000000000042');
    const p3 = await connectPlayer('Byte', 'room-token-000000000043');

    const wait1 = once(p1, 'matchmaking:waiting');
    p1.emit('matchmaking:join', { character: 'rex' });
    assert.equal((await wait1).queueSize, 1);

    const found1 = once(p1, 'matchmaking:found');
    const found2 = once(p2, 'matchmaking:found');
    p2.emit('matchmaking:join', { character: 'luna' });
    const [r1, r2] = await Promise.all([found1, found2]);
    assert.equal(r1.code, r2.code);
    assert.equal(r1.players.length, 2);

    const found3 = once(p3, 'matchmaking:found');
    p3.emit('matchmaking:join', { character: 'byte' });
    const r3 = await found3;
    assert.equal(r3.code, r1.code);
    assert.equal(r3.players.length, 3);
  } finally { await teardown(); }
});
