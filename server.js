'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const gameConfig = require('./server/config/gameConfig');
const SessionManager = require('./server/socket/SessionManager');
const RoomManager = require('./server/rooms/RoomManager');
const Matchmaking = require('./server/rooms/Matchmaking');
const MatchManager = require('./server/game/MatchManager');
const { registerSocketHandlers } = require('./server/socket/socketHandlers');

function createGameServer({
  port = gameConfig.server.port,
  sessionGraceMs = gameConfig.session.reconnectGraceMs,
  manualStartCountdownMs = gameConfig.room.manualStartCountdownMs,
  matchmakingCountdownMs = gameConfig.room.matchmakingCountdownMs,
} = {}) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    serveClient: true,
    pingInterval: 10000,
    pingTimeout: 8000,
    maxHttpBufferSize: 1e5,
  });

  const rooms = new RoomManager({
    manualStartCountdownMs,
    matchmakingCountdownMs,
  });
  const matchmaking = new Matchmaking(rooms);
  const matches = new MatchManager();
  const sessions = new SessionManager({
    graceMs: sessionGraceMs,
    onExpire(expiredSession) {
      matchmaking.leave(expiredSession.playerId);
      const room = rooms.getRoomByPlayer(expiredSession.playerId);
      if (room) {
        const match = matches.getMatch(room.code);
        if (match) {
          const pl = match.players.get(expiredSession.playerId);
          if (pl) pl.alive = false;
        }
      }
      const res = rooms.leaveRoom(expiredSession.playerId);
      if (res.closed && res.leftCode) {
        matches.removeMatch(res.leftCode);
      }
    },
  });

  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      sessions: sessions.size,
      rooms: rooms.rooms.size,
      activeMatches: matches.matches.size,
      queue: matchmaking.size,
      uptime: process.uptime(),
    });
  });
  app.use(express.static(path.join(__dirname, 'client')));

  registerSocketHandlers(io, sessions, rooms, matchmaking, matches);

  return {
    app,
    httpServer,
    io,
    sessions,
    rooms,
    matchmaking,
    matches,
    start() {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          httpServer.off('error', reject);
          resolve(httpServer.address().port);
        });
      });
    },
    stop() {
      sessions.dispose();
      rooms.dispose();
      matches.dispose();
      return new Promise((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}

module.exports = { createGameServer };

if (require.main === module) {
  const server = createGameServer();
  server.start().then((port) => {
    console.log(`[Arcade Bomb Arena] servidor rodando em http://localhost:${port}`);
  });
  const shutdown = () => server.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
