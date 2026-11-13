'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RoomManager = require('../../server/rooms/RoomManager');
const Matchmaking = require('../../server/rooms/Matchmaking');

const p = (id, name = id) => ({ playerId: id, name, character: 'rex' });

test('RoomManager: cria sala com código único e anfitrião', () => {
  const rm = new RoomManager({ manualStartCountdownMs: 50 });
  const r1 = rm.createRoom(p('p1', 'Rex'));
  const r2 = rm.createRoom(p('p2', 'Luna'));
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.notEqual(r1.room.code, r2.room.code);
  assert.equal(r1.room.hostId, 'p1');
  rm.dispose();
});

test('RoomManager: permite até 4 jogadores e bloqueia o 5º', () => {
  const rm = new RoomManager();
  const created = rm.createRoom(p('p1'));
  const code = created.room.code;

  assert.equal(rm.joinRoom(code, p('p2')).ok, true);
  assert.equal(rm.joinRoom(code, p('p3')).ok, true);
  assert.equal(rm.joinRoom(code, p('p4')).ok, true);

  const fifth = rm.joinRoom(code, p('p5'));
  assert.equal(fifth.ok, false);
  assert.equal(fifth.code, 'ROOM_FULL');
  rm.dispose();
});

test('RoomManager: rejeita código inexistente e entrada duplicada', () => {
  const rm = new RoomManager();
  assert.equal(rm.joinRoom('ZZZZZZ', p('p1')).code, 'ROOM_NOT_FOUND');

  const created = rm.createRoom(p('p1'));
  assert.equal(rm.joinRoom(created.room.code, p('p1')).code, 'ALREADY_IN_THIS_ROOM');
  rm.dispose();
});

test('RoomManager: transfere anfitrião ao sair e fecha sala vazia', () => {
  const rm = new RoomManager();
  const created = rm.createRoom(p('p1'));
  const code = created.room.code;
  rm.joinRoom(code, p('p2'));

  const left1 = rm.leaveRoom('p1');
  assert.equal(left1.closed, false);
  assert.equal(left1.room.hostId, 'p2');

  const left2 = rm.leaveRoom('p2');
  assert.equal(left2.closed, true);
  assert.equal(rm.getRoom(code), null);
  rm.dispose();
});

test('RoomManager: impede escolha de personagem já ocupado na sala', () => {
  const rm = new RoomManager();
  const created = rm.createRoom(p('p1'), { character: 'rex' });
  const code = created.room.code;
  rm.joinRoom(code, p('p2'), { character: 'luna' });

  const conflict = rm.selectCharacter('p2', 'rex');
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'CHARACTER_TAKEN');
  rm.dispose();
});

test('Matchmaking: agrupa jogadores sem duplicar salas', () => {
  const rm = new RoomManager({ matchmakingCountdownMs: 5000, manualStartCountdownMs: 5000 });
  const mm = new Matchmaking(rm);

  const r1 = mm.join(p('p1', 'Rex'), { character: 'rex' });
  assert.equal(r1.status, 'waiting');
  assert.equal(mm.size, 1);

  const r2 = mm.join(p('p2', 'Luna'), { character: 'luna' });
  assert.equal(r2.status, 'found');
  assert.equal(r2.room.players.length, 2);
  assert.equal(mm.size, 0);

  const r3 = mm.join(p('p3', 'Byte'), { character: 'byte' });
  assert.equal(r3.status, 'found');
  assert.equal(r3.room.code, r2.room.code);
  assert.equal(r3.room.players.length, 3);

  rm.dispose();
});
