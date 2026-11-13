'use strict';

const {
  createRateLimiter,
  validateJoinPayload,
  validateRoomCreatePayload,
  validateRoomJoinPayload,
  validateReadyPayload,
  validateCharacterPayload,
} = require('./eventValidation');
const { isPlainObject } = require('../utils/validators');
const { serverTime } = require('../utils/timers');

function channelName(code) {
  return `room:${code}`;
}

function registerSocketHandlers(io, sessions, rooms, matchmaking, matches) {
  rooms.onRoomUpdated = (roomData) => {
    io.to(channelName(roomData.code)).emit('room:updated', roomData);
  };
  rooms.onGameStarting = (payload) => {
    io.to(channelName(payload.code)).emit('game:starting', payload);
  };
  rooms.onGameStarted = (roomData) => {
    const engine = matches.startMatch(roomData);
    io.to(channelName(roomData.code)).emit('game:started', {
      code: roomData.code,
      players: roomData.players,
      match: engine.serializeInitialState(),
      serverTime: serverTime(),
    });
  };

  matches.onBroadcast = (roomCode, state) => {
    io.to(channelName(roomCode)).emit('game:state', state);
  };

  matches.onFinished = (roomCode, result) => {
    io.to(channelName(roomCode)).emit('game:finished', result);
    setTimeout(() => {
      matches.removeMatch(roomCode);
      rooms.resetRoomToLobby(roomCode);
    }, 5000).unref?.();
  };

  function requireSession(socket) {
    const session = sessions.getBySocket(socket.id);
    if (!session) {
      socket.emit('player:error', { code: 'NOT_AUTHENTICATED', message: 'Sessão não iniciada. Informe seu nome.' });
      return null;
    }
    return session;
  }

  io.on('connection', (socket) => {
    const limiter = createRateLimiter();

    socket.use((_packet, next) => {
      const verdict = limiter.allow();
      if (verdict === 'ok') return next();
      if (verdict === 'kick') {
        socket.disconnect(true);
        return;
      }
      socket.emit('rate:limited', {});
    });

    socket.on('player:join', (payload) => {
      const result = validateJoinPayload(payload);
      if (!result.ok) {
        socket.emit('player:error', { code: result.code, message: result.message });
        return;
      }
      const { name, token, character } = result.value;
      const { session, resumed, replacedSocketId } = sessions.attach(token, name, socket.id);
      session.character = character;

      if (replacedSocketId) {
        const old = io.sockets.sockets.get(replacedSocketId);
        if (old) {
          old.emit('session:replaced', {});
          old.disconnect(true);
        }
      }

      const existingRoom = rooms.getRoomByPlayer(session.playerId);
      let activeMatch = null;
      if (existingRoom) {
        socket.join(channelName(existingRoom.code));
        rooms.setPlayerConnection(session.playerId, true);
        const match = matches.getMatch(existingRoom.code);
        if (match && match.status === 'playing') {
          match.setPlayerConnection(session.playerId, true);
          activeMatch = match.serializeInitialState();
        }
      }

      socket.emit('player:joined', {
        playerId: session.playerId,
        name: session.name,
        character: session.character,
        resumed,
        room: existingRoom ? rooms.serializeRoom(existingRoom) : null,
        match: activeMatch,
        serverTime: serverTime(),
      });
    });

    socket.on('room:create', (payload) => {
      const session = requireSession(socket);
      if (!session) return;

      const valid = validateRoomCreatePayload(payload);
      if (!valid.ok) {
        socket.emit('room:error', { code: valid.code, message: valid.message });
        return;
      }

      matchmaking.leave(session.playerId);
      const res = rooms.createRoom(session, { isPublic: false, character: valid.value.character });
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
        return;
      }

      socket.join(channelName(res.room.code));
      socket.emit('room:created', res.room);
    });

    socket.on('room:createBots', (payload) => {
      const session = requireSession(socket);
      if (!session) return;

      const valid = validateRoomCreatePayload(payload);
      if (!valid.ok) {
        socket.emit('room:error', { code: valid.code, message: valid.message });
        return;
      }

      const botCount = payload && typeof payload.botCount === 'number' ? payload.botCount : 3;
      const autoStart = payload ? Boolean(payload.autoStart) : false;

      matchmaking.leave(session.playerId);
      const res = rooms.createRoom(session, {
        isPublic: false,
        character: valid.value.character,
        botCount,
        autoStart,
      });
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
        return;
      }

      socket.join(channelName(res.room.code));
      socket.emit('room:created', res.room);
    });

    socket.on('room:addBot', () => {
      const session = requireSession(socket);
      if (!session) return;

      const res = rooms.addBot(session.playerId);
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
      }
    });

    socket.on('room:removeBot', (payload) => {
      const session = requireSession(socket);
      if (!session) return;

      const botId = isPlainObject(payload) && typeof payload.botId === 'string' ? payload.botId : undefined;
      const res = rooms.removeBot(session.playerId, botId);
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
      }
    });

    socket.on('room:join', (payload) => {
      const session = requireSession(socket);
      if (!session) return;

      const valid = validateRoomJoinPayload(payload);
      if (!valid.ok) {
        socket.emit('room:error', { code: valid.code, message: valid.message });
        return;
      }

      matchmaking.leave(session.playerId);
      const res = rooms.joinRoom(valid.value.code, session, { character: valid.value.character });
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
        return;
      }

      socket.join(channelName(res.room.code));
      socket.emit('room:joined', res.room);
    });

    socket.on('room:leave', () => {
      const session = requireSession(socket);
      if (!session) return;

      const existingRoom = rooms.getRoomByPlayer(session.playerId);
      if (existingRoom) {
        const match = matches.getMatch(existingRoom.code);
        if (match) {
          const pl = match.players.get(session.playerId);
          if (pl) pl.alive = false;
        }
      }

      const res = rooms.leaveRoom(session.playerId);
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
        return;
      }

      if (res.closed) {
        matches.removeMatch(res.leftCode);
      }

      socket.leave(channelName(res.leftCode));
      socket.emit('room:left', { code: res.leftCode });
    });

    socket.on('player:ready', (payload) => {
      const session = requireSession(socket);
      if (!session) return;

      const valid = validateReadyPayload(payload);
      if (!valid.ok) {
        socket.emit('room:error', { code: valid.code, message: valid.message });
        return;
      }

      const res = rooms.setReady(session.playerId, valid.value.ready);
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
      }
    });

    socket.on('player:selectCharacter', (payload) => {
      const session = requireSession(socket);
      if (!session) return;

      const valid = validateCharacterPayload(payload);
      if (!valid.ok) {
        socket.emit('room:error', { code: valid.code, message: valid.message });
        return;
      }

      const res = rooms.selectCharacter(session.playerId, valid.value.character);
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
        return;
      }
      session.character = valid.value.character;
    });

    socket.on('room:start', () => {
      const session = requireSession(socket);
      if (!session) return;

      const res = rooms.startMatch(session.playerId);
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
      }
    });

    socket.on('matchmaking:join', (payload) => {
      const session = requireSession(socket);
      if (!session) return;

      const valid = validateRoomCreatePayload(payload);
      if (!valid.ok) {
        socket.emit('room:error', { code: valid.code, message: valid.message });
        return;
      }

      const res = matchmaking.join(session, { character: valid.value.character });
      if (!res.ok) {
        socket.emit('room:error', { code: res.code, message: res.message });
        return;
      }

      if (res.status === 'waiting') {
        socket.emit('matchmaking:waiting', { queueSize: res.queueSize });
        return;
      }

      for (const member of res.room.players) {
        for (const s of sessions.byToken.values()) {
          if (s.playerId === member.playerId && s.socketId) {
            const memberSocket = io.sockets.sockets.get(s.socketId);
            if (memberSocket) {
              memberSocket.join(channelName(res.room.code));
              memberSocket.emit('matchmaking:found', res.room);
            }
          }
        }
      }
    });

    socket.on('matchmaking:leave', () => {
      const session = requireSession(socket);
      if (!session) return;

      const res = matchmaking.leave(session.playerId);
      socket.emit('matchmaking:left', { queueSize: res.queueSize });
    });

    socket.on('game:input', (payload) => {
      const session = sessions.getBySocket(socket.id);
      if (!session || !isPlainObject(payload)) return;
      const room = rooms.getRoomByPlayer(session.playerId);
      if (!room) return;
      const match = matches.getMatch(room.code);
      if (!match) return;
      match.setInput(session.playerId, payload);
    });

    socket.on('game:placeBomb', () => {
      const session = sessions.getBySocket(socket.id);
      if (!session) return;
      const room = rooms.getRoomByPlayer(session.playerId);
      if (!room) return;
      const match = matches.getMatch(room.code);
      if (!match) return;
      match.placeBomb(session.playerId);
    });

    socket.on('time:ping', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const clientTime = payload && typeof payload.clientTime === 'number' ? payload.clientTime : null;
      ack({ clientTime, serverTime: serverTime() });
    });

    socket.on('disconnect', () => {
      const session = sessions.getBySocket(socket.id);
      if (session) {
        matchmaking.leave(session.playerId);
        rooms.setPlayerConnection(session.playerId, false);
        const room = rooms.getRoomByPlayer(session.playerId);
        if (room) {
          const match = matches.getMatch(room.code);
          if (match) match.setPlayerConnection(session.playerId, false);
        }
      }
      sessions.detach(socket.id);
    });
  });
}

module.exports = { registerSocketHandlers };
