'use strict';

class Matchmaking {
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.queue = new Map();
  }

  join(player, { character } = {}) {
    if (!player || !player.playerId) {
      return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Informe seu nome antes de procurar partida.' };
    }
    if (this.roomManager.getRoomByPlayer(player.playerId)) {
      return { ok: false, code: 'ALREADY_IN_ROOM', message: 'Você já está em uma sala.' };
    }
    if (this.queue.has(player.playerId)) {
      return { ok: false, code: 'ALREADY_IN_QUEUE', message: 'Você já está na fila de matchmaking.' };
    }

    const openRoom = this.roomManager.findOpenPublicRoom();
    if (openRoom) {
      const joined = this.roomManager.joinRoom(openRoom.code, player, { character });
      if (joined.ok) {
        return { ok: true, status: 'found', room: joined.room };
      }
    }

    const firstWaiting = this.queue.values().next().value;
    if (firstWaiting) {
      this.queue.delete(firstWaiting.playerId);
      const created = this.roomManager.createRoom(firstWaiting, {
        isPublic: true,
        character: firstWaiting.character,
      });
      if (created.ok) {
        const joined = this.roomManager.joinRoom(created.room.code, player, { character });
        if (joined.ok) {
          return { ok: true, status: 'found', room: joined.room };
        }
      }
    }

    this.queue.set(player.playerId, {
      playerId: player.playerId,
      name: player.name,
      character,
    });

    return { ok: true, status: 'waiting', queueSize: this.queue.size };
  }

  leave(playerId) {
    const removed = this.queue.delete(playerId);
    return { ok: true, removed, queueSize: this.queue.size };
  }

  isQueued(playerId) {
    return this.queue.has(playerId);
  }

  get size() {
    return this.queue.size;
  }
}

module.exports = Matchmaking;
