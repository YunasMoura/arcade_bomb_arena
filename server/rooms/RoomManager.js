'use strict';

const crypto = require('crypto');
const gameConfig = require('../config/gameConfig');

const BOT_NAMES = ['Bot Alpha', 'Bot Turbo', 'Bot Cyber', 'Bot Spark'];

class RoomManager {
  constructor({
    maxPlayers = gameConfig.room.maxPlayers,
    minPlayersToStart = gameConfig.room.minPlayersToStart,
    codeLength = gameConfig.room.codeLength,
    codeAlphabet = gameConfig.room.codeAlphabet,
    manualStartCountdownMs = gameConfig.room.manualStartCountdownMs,
    matchmakingCountdownMs = gameConfig.room.matchmakingCountdownMs,
    onRoomUpdated = () => {},
    onGameStarting = () => {},
    onGameStarted = () => {},
  } = {}) {
    this.maxPlayers = maxPlayers;
    this.minPlayersToStart = minPlayersToStart;
    this.codeLength = codeLength;
    this.codeAlphabet = codeAlphabet;
    this.manualStartCountdownMs = manualStartCountdownMs;
    this.matchmakingCountdownMs = matchmakingCountdownMs;

    this.onRoomUpdated = onRoomUpdated;
    this.onGameStarting = onGameStarting;
    this.onGameStarted = onGameStarted;

    this.rooms = new Map();
    this.roomByPlayer = new Map();
  }

  _generateCode() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = '';
      const bytes = crypto.randomBytes(this.codeLength);
      for (let i = 0; i < this.codeLength; i += 1) {
        code += this.codeAlphabet[bytes[i] % this.codeAlphabet.length];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Não foi possível gerar um código de sala único.');
  }

  _pickAvailableCharacter(room, preferred) {
    const taken = new Set(room.players.map((p) => p.character));
    if (preferred && gameConfig.player.characters.includes(preferred) && !taken.has(preferred)) {
      return preferred;
    }
    return gameConfig.player.characters.find((c) => !taken.has(c)) || gameConfig.player.defaultCharacter;
  }

  _pickBotName(room) {
    const used = new Set(room.players.map((p) => p.name));
    return BOT_NAMES.find((n) => !used.has(n)) || `Bot #${room.players.length + 1}`;
  }

  serializeRoom(room) {
    return {
      code: room.code,
      isPublic: room.isPublic,
      status: room.status,
      hostId: room.hostId,
      maxPlayers: this.maxPlayers,
      minPlayersToStart: this.minPlayersToStart,
      countdownEndsAt: room.countdownEndsAt,
      players: room.players.map((p, index) => ({
        playerId: p.playerId,
        name: p.name,
        character: p.character,
        ready: p.ready,
        connected: p.connected,
        isBot: Boolean(p.isBot),
        isHost: p.playerId === room.hostId,
        seat: index,
      })),
    };
  }

  getRoom(code) {
    if (typeof code !== 'string') return null;
    return this.rooms.get(code.trim().toUpperCase()) || null;
  }

  getRoomByPlayer(playerId) {
    const code = this.roomByPlayer.get(playerId);
    return code ? this.rooms.get(code) || null : null;
  }

  findOpenPublicRoom() {
    for (const room of this.rooms.values()) {
      if (room.isPublic && (room.status === 'waiting' || room.status === 'starting') && room.players.length < this.maxPlayers) {
        return room;
      }
    }
    return null;
  }

  createRoom(player, { isPublic = false, character, botCount = 0, autoStart = false } = {}) {
    if (!player || !player.playerId) {
      return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Informe seu nome antes de entrar em uma sala.' };
    }
    if (this.roomByPlayer.has(player.playerId)) {
      return { ok: false, code: 'ALREADY_IN_ROOM', message: 'Você já está em uma sala.' };
    }

    const code = this._generateCode();
    const room = {
      code,
      isPublic: Boolean(isPublic),
      status: 'waiting',
      hostId: player.playerId,
      players: [],
      countdownTimer: null,
      countdownEndsAt: null,
    };

    const chosenCharacter = this._pickAvailableCharacter(room, character || player.character);
    room.players.push({
      playerId: player.playerId,
      name: player.name,
      character: chosenCharacter,
      ready: Boolean(autoStart),
      connected: true,
      isBot: false,
    });

    const botsToAdd = Math.max(0, Math.min(this.maxPlayers - 1, Number(botCount) || 0));
    for (let i = 0; i < botsToAdd; i += 1) {
      room.players.push({
        playerId: `bot-${crypto.randomUUID().slice(0, 8)}`,
        name: this._pickBotName(room),
        character: this._pickAvailableCharacter(room),
        ready: true,
        connected: true,
        isBot: true,
      });
    }

    this.rooms.set(code, room);
    this.roomByPlayer.set(player.playerId, code);

    if (autoStart && room.players.length >= this.minPlayersToStart) {
      this._startCountdown(room, Math.min(1200, this.manualStartCountdownMs));
    }

    return { ok: true, room: this.serializeRoom(room) };
  }

  addBot(playerId) {
    const room = this.getRoomByPlayer(playerId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Você não está em nenhuma sala.' };
    }
    if (room.hostId !== playerId) {
      return { ok: false, code: 'NOT_HOST', message: 'Apenas o anfitrião da sala pode adicionar bots.' };
    }
    if (room.status === 'playing') {
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'A partida já começou.' };
    }
    if (room.players.length >= this.maxPlayers) {
      return { ok: false, code: 'ROOM_FULL', message: 'A sala já atingiu o limite de 4 jogadores.' };
    }

    room.players.push({
      playerId: `bot-${crypto.randomUUID().slice(0, 8)}`,
      name: this._pickBotName(room),
      character: this._pickAvailableCharacter(room),
      ready: true,
      connected: true,
      isBot: true,
    });

    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return { ok: true, room: serialized };
  }

  removeBot(playerId, botId) {
    const room = this.getRoomByPlayer(playerId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Você não está em nenhuma sala.' };
    }
    if (room.hostId !== playerId) {
      return { ok: false, code: 'NOT_HOST', message: 'Apenas o anfitrião da sala pode remover bots.' };
    }
    if (room.status === 'playing') {
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'A partida já começou.' };
    }

    const idx = botId
      ? room.players.findIndex((p) => p.isBot && p.playerId === botId)
      : [...room.players].map((p, i) => ({ p, i })).reverse().find((x) => x.p.isBot)?.i ?? -1;

    if (idx === -1) {
      return { ok: false, code: 'BOT_NOT_FOUND', message: 'Nenhum bot encontrado na sala.' };
    }

    room.players.splice(idx, 1);

    if (room.status === 'starting' && room.players.length < this.minPlayersToStart) {
      this._clearCountdown(room);
      room.status = 'waiting';
    }

    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return { ok: true, room: serialized };
  }

  joinRoom(codeInput, player, { character } = {}) {
    if (!player || !player.playerId) {
      return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Informe seu nome antes de entrar em uma sala.' };
    }

    const normalized = typeof codeInput === 'string' ? codeInput.trim().toUpperCase() : '';
    const room = this.rooms.get(normalized);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada. Verifique o código.' };
    }

    const existingRoomCode = this.roomByPlayer.get(player.playerId);
    if (existingRoomCode === room.code) {
      return { ok: false, code: 'ALREADY_IN_THIS_ROOM', message: 'Você já está nesta sala.' };
    }
    if (existingRoomCode) {
      return { ok: false, code: 'ALREADY_IN_ANOTHER_ROOM', message: 'Saia da sala atual antes de entrar em outra.' };
    }

    if (room.status === 'playing') {
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'A partida desta sala já começou.' };
    }
    if (room.players.length >= this.maxPlayers) {
      return { ok: false, code: 'ROOM_FULL', message: 'Esta sala já está cheia (4/4 jogadores).' };
    }

    const chosenCharacter = this._pickAvailableCharacter(room, character || player.character);
    room.players.push({
      playerId: player.playerId,
      name: player.name,
      character: chosenCharacter,
      ready: false,
      connected: true,
      isBot: false,
    });

    this.roomByPlayer.set(player.playerId, room.code);

    if (room.isPublic) {
      this._evaluatePublicRoomCountdown(room);
    }

    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return { ok: true, room: serialized };
  }

  leaveRoom(playerId) {
    const code = this.roomByPlayer.get(playerId);
    if (!code) return { ok: false, code: 'NOT_IN_ROOM', message: 'Você não está em nenhuma sala.' };

    const room = this.rooms.get(code);
    this.roomByPlayer.delete(playerId);
    if (!room) return { ok: true, leftCode: code, closed: true };

    room.players = room.players.filter((p) => p.playerId !== playerId);

    const remainingHumans = room.players.filter((p) => !p.isBot);
    if (remainingHumans.length === 0) {
      this._clearCountdown(room);
      this.rooms.delete(code);
      return { ok: true, leftCode: code, closed: true };
    }

    if (room.hostId === playerId) {
      room.hostId = remainingHumans[0].playerId;
    }

    if (room.status === 'starting' && room.players.length < this.minPlayersToStart) {
      this._clearCountdown(room);
      room.status = 'waiting';
    }

    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return { ok: true, leftCode: code, closed: false, room: serialized };
  }

  resetRoomToLobby(code) {
    const room = this.rooms.get(code);
    if (!room) return null;
    this._clearCountdown(room);
    room.status = 'waiting';
    for (const p of room.players) {
      p.ready = Boolean(p.isBot);
    }
    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return serialized;
  }

  setReady(playerId, ready) {
    const room = this.getRoomByPlayer(playerId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Você não está em nenhuma sala.' };
    }
    if (room.status === 'playing') {
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'A partida já começou.' };
    }

    const member = room.players.find((p) => p.playerId === playerId);
    if (!member) return { ok: false, code: 'NOT_IN_ROOM', message: 'Jogador não encontrado na sala.' };

    member.ready = Boolean(ready);

    const allReady = room.players.length >= this.minPlayersToStart && room.players.every((p) => p.ready);
    if (allReady && room.status === 'waiting') {
      this._startCountdown(room, room.isPublic ? Math.min(this.manualStartCountdownMs, this.matchmakingCountdownMs) : this.manualStartCountdownMs);
    } else if (!allReady && !room.isPublic && room.status === 'starting') {
      this._clearCountdown(room);
      room.status = 'waiting';
    }

    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return { ok: true, room: serialized };
  }

  selectCharacter(playerId, character) {
    const room = this.getRoomByPlayer(playerId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Você não está em nenhuma sala.' };
    }
    if (room.status === 'playing') {
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'Não é possível trocar de personagem após o início.' };
    }
    if (!gameConfig.player.characters.includes(character)) {
      return { ok: false, code: 'INVALID_CHARACTER', message: 'Personagem inválido.' };
    }

    const takenByOther = room.players.some((p) => p.playerId !== playerId && p.character === character);
    if (takenByOther) {
      return { ok: false, code: 'CHARACTER_TAKEN', message: 'Este personagem já foi escolhido por outro jogador.' };
    }

    const member = room.players.find((p) => p.playerId === playerId);
    member.character = character;

    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return { ok: true, room: serialized };
  }

  startMatch(playerId) {
    const room = this.getRoomByPlayer(playerId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Você não está em nenhuma sala.' };
    }
    if (room.hostId !== playerId) {
      return { ok: false, code: 'NOT_HOST', message: 'Apenas o criador da sala pode iniciar a partida.' };
    }
    if (room.players.length < this.minPlayersToStart) {
      return { ok: false, code: 'NOT_ENOUGH_PLAYERS', message: 'São necessários pelo menos 2 jogadores para iniciar.' };
    }
    if (room.status === 'playing') {
      return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'A partida já está em andamento.' };
    }

    this._startCountdown(room, this.manualStartCountdownMs);
    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return { ok: true, room: serialized };
  }

  setPlayerConnection(playerId, connected) {
    const room = this.getRoomByPlayer(playerId);
    if (!room) return null;
    const member = room.players.find((p) => p.playerId === playerId);
    if (!member) return null;
    member.connected = Boolean(connected);
    const serialized = this.serializeRoom(room);
    this.onRoomUpdated(serialized);
    return serialized;
  }

  _evaluatePublicRoomCountdown(room) {
    if (room.players.length >= this.maxPlayers) {
      this._startCountdown(room, Math.min(this.manualStartCountdownMs, 2000));
    } else if (room.players.length >= this.minPlayersToStart && room.status === 'waiting') {
      this._startCountdown(room, this.matchmakingCountdownMs);
    }
  }

  _startCountdown(room, delayMs) {
    this._clearCountdown(room);
    room.status = 'starting';
    room.countdownEndsAt = Date.now() + delayMs;

    this.onGameStarting({
      code: room.code,
      startsInMs: delayMs,
      countdownEndsAt: room.countdownEndsAt,
    });

    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      room.countdownEndsAt = null;
      if (room.players.length < this.minPlayersToStart) {
        room.status = 'waiting';
        this.onRoomUpdated(this.serializeRoom(room));
        return;
      }
      room.status = 'playing';
      const serialized = this.serializeRoom(room);
      this.onRoomUpdated(serialized);
      this.onGameStarted(serialized);
    }, delayMs);
    if (room.countdownTimer.unref) room.countdownTimer.unref();
  }

  _clearCountdown(room) {
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
    room.countdownEndsAt = null;
  }

  dispose() {
    for (const room of this.rooms.values()) {
      this._clearCountdown(room);
    }
    this.rooms.clear();
    this.roomByPlayer.clear();
  }
}

module.exports = RoomManager;
