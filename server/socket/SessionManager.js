'use strict';

const crypto = require('crypto');

class SessionManager {
  constructor({ graceMs, onExpire } = {}) {
    this.graceMs = graceMs;
    this.onExpire = onExpire || (() => {});
    this.byToken = new Map();
    this.tokenBySocket = new Map();
  }

  attach(token, name, socketId) {
    let session = this.byToken.get(token);
    let resumed = false;
    let replacedSocketId = null;

    if (session) {
      resumed = true;
      clearTimeout(session.expireTimer);
      session.expireTimer = null;
      if (session.socketId && session.socketId !== socketId) {
        replacedSocketId = session.socketId;
        this.tokenBySocket.delete(replacedSocketId);
      }
      session.name = name;
    } else {
      session = {
        token,
        playerId: crypto.randomUUID(),
        name,
        socketId: null,
        connected: false,
        expireTimer: null,
      };
      this.byToken.set(token, session);
    }

    const previousToken = this.tokenBySocket.get(socketId);
    if (previousToken && previousToken !== token) this._release(previousToken, socketId);

    session.socketId = socketId;
    session.connected = true;
    this.tokenBySocket.set(socketId, token);
    return { session, resumed, replacedSocketId };
  }

  getBySocket(socketId) {
    const token = this.tokenBySocket.get(socketId);
    return token ? this.byToken.get(token) || null : null;
  }

  detach(socketId) {
    const token = this.tokenBySocket.get(socketId);
    if (!token) return null;
    this.tokenBySocket.delete(socketId);
    const session = this.byToken.get(token);
    if (!session || session.socketId !== socketId) return null;
    return this._startGrace(session);
  }

  _release(token, socketId) {
    const session = this.byToken.get(token);
    this.tokenBySocket.delete(socketId);
    if (session && session.socketId === socketId) this._startGrace(session);
  }

  _startGrace(session) {
    session.connected = false;
    session.socketId = null;
    clearTimeout(session.expireTimer);
    session.expireTimer = setTimeout(() => {
      this.byToken.delete(session.token);
      this.onExpire(session);
    }, this.graceMs);
    if (session.expireTimer.unref) session.expireTimer.unref();
    return session;
  }

  dispose() {
    for (const s of this.byToken.values()) clearTimeout(s.expireTimer);
    this.byToken.clear();
    this.tokenBySocket.clear();
  }

  get size() {
    return this.byToken.size;
  }
}

module.exports = SessionManager;
