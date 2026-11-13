'use strict';

const gameConfig = require('../config/gameConfig');
const MatchEngine = require('./MatchEngine');
const { monotonicNow } = require('../utils/timers');

class MatchManager {
  constructor({
    tickRate = gameConfig.server.tickRate,
    broadcastRate = gameConfig.server.broadcastRate,
    onBroadcast = () => {},
    onFinished = () => {},
  } = {}) {
    this.tickRate = tickRate;
    this.broadcastRate = broadcastRate;
    this.onBroadcast = onBroadcast;
    this.onFinished = onFinished;

    this.matches = new Map();
    this._loop = null;
    this._lastTick = monotonicNow();
    this._broadcastAccMs = 0;
  }

  startMatch(roomData, opts = {}) {
    const engine = new MatchEngine({
      roomCode: roomData.code,
      roomPlayers: roomData.players,
      ...opts,
      onMatchFinished: (result) => {
        this.onBroadcast(roomData.code, engine.serializeTickState());
        this.onFinished(roomData.code, result);
      },
    });
    this.matches.set(roomData.code, engine);
    this._ensureLoop();
    return engine;
  }

  getMatch(roomCode) {
    return this.matches.get(roomCode) || null;
  }

  removeMatch(roomCode) {
    this.matches.delete(roomCode);
    if (this.matches.size === 0) this._stopLoop();
  }

  _ensureLoop() {
    if (this._loop) return;
    const stepMs = Math.round(1000 / this.tickRate);
    const broadcastIntervalMs = 1000 / this.broadcastRate;
    this._lastTick = monotonicNow();

    this._loop = setInterval(() => {
      const now = monotonicNow();
      const dtMs = Math.min(100, now - this._lastTick);
      this._lastTick = now;
      this._broadcastAccMs += dtMs;

      const shouldBroadcast = this._broadcastAccMs >= broadcastIntervalMs;
      if (shouldBroadcast) this._broadcastAccMs = 0;

      for (const [code, engine] of this.matches.entries()) {
        if (engine.status === 'playing') {
          engine.tick(dtMs);
          if (shouldBroadcast && engine.status === 'playing') {
            this.onBroadcast(code, engine.serializeTickState());
          }
        }
      }
    }, stepMs);
    if (this._loop.unref) this._loop.unref();
  }

  _stopLoop() {
    if (this._loop) {
      clearInterval(this._loop);
      this._loop = null;
    }
  }

  dispose() {
    this._stopLoop();
    this.matches.clear();
  }
}

module.exports = MatchManager;
