'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createGameServer } = require('../../server');

function once(socket, event, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

async function setup() {
  const server = createGameServer({
    port: 0,
    manualStartCountdownMs: 60,
    matchmakingCountdownMs: 60,
  });
  const port = await server.start();
  const url = `http://127.0.0.1:${port}`;
  const clients = [];
  const connectPlayer = async (name, token, character) => {
    const c = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(c);
    await once(c, 'connect');
    const joined = once(c, 'player:joined');
    c.emit('player:join', { name, token, character });
    const profile = await joined;
    return { socket: c, profile };
  };
  const teardown = async () => {
    clients.forEach((c) => c.close());
    await server.stop();
  };
  return { server, connectPlayer, teardown };
}

test('partida multiplayer completa: lobby -> arena -> movimento/bomba -> estado sincronizado', async () => {
  const { server, connectPlayer, teardown } = await setup();
  try {
    const p1 = await connectPlayer('Rex', 'mp-token-0000000000001', 'rex');
    const p2 = await connectPlayer('Luna', 'mp-token-0000000000002', 'luna');

    const createdP = once(p1.socket, 'room:created');
    p1.socket.emit('room:create', { character: 'rex' });
    const room = await createdP;

    const joinedP = once(p2.socket, 'room:joined');
    p2.socket.emit('room:join', { code: room.code, character: 'luna' });
    await joinedP;

    const started1 = once(p1.socket, 'game:started');
    const started2 = once(p2.socket, 'game:started');
    p1.socket.emit('player:ready', { ready: true });
    p2.socket.emit('player:ready', { ready: true });

    const [s1, s2] = await Promise.all([started1, started2]);
    assert.equal(s1.match.arena.cols, 17);
    assert.equal(s2.match.arena.rows, 15);

    // Envia input de movimento e coloca bomba
    const nextStateP = once(p2.socket, 'game:state');
    p1.socket.emit('game:input', { right: true });
    p1.socket.emit('game:placeBomb');

    const state = await nextStateP;
    assert.equal(state.players.length, 2);
    assert.ok(state.bombs.length >= 1);

    // Testa finalização da partida via eliminação no servidor autoritativo
    const finished1 = once(p1.socket, 'game:finished');
    const match = server.matches.getMatch(room.code);
    const pl2 = match.players.get(p2.profile.playerId);
    pl2.alive = false;
    match.tick(50);

    const result = await finished1;
    assert.equal(result.winnerId, p1.profile.playerId);
    assert.equal(result.ranking.length, 2);
  } finally {
    await teardown();
  }
});
