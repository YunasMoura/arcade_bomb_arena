const TOKEN_KEY = 'aba.token';
const SYNC_SAMPLES = 5;

function generateFallbackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'tok-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 14);
}

function getToken() {
  try {
    let token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = generateFallbackId();
      sessionStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    return generateFallbackId();
  }
}

export function createNetwork(handlers) {
  const token = getToken();
  const socket = window.io({
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });

  let desiredProfile = null;
  let pendingAction = null;

  function sendJoin() {
    if (!desiredProfile) return;
    socket.emit('player:join', {
      name: desiredProfile.name,
      character: desiredProfile.character,
      token,
    });
  }

  function syncClock() {
    let best = null;
    let pending = SYNC_SAMPLES;
    const sample = () => {
      const t0 = performance.now();
      const wall0 = Date.now();
      socket.emit('time:ping', { clientTime: wall0 }, (res) => {
        const rtt = performance.now() - t0;
        if (res && typeof res.serverTime === 'number') {
          const offset = res.serverTime + rtt / 2 - Date.now();
          if (!best || rtt < best.rtt) best = { rtt, offset };
        }
        if (--pending > 0) setTimeout(sample, 100);
        else if (best) handlers.onClock?.(best);
      });
    };
    sample();
  }

  socket.on('connect', () => {
    handlers.onStatus?.('connected');
    if (desiredProfile) sendJoin();
  });
  socket.on('disconnect', () => handlers.onStatus?.('disconnected'));
  socket.on('connect_error', () => handlers.onStatus?.('disconnected'));
  socket.io.on('reconnect_attempt', () => handlers.onStatus?.('connecting'));

  socket.on('player:joined', (data) => {
    handlers.onJoined?.(data);
    syncClock();
    if (pendingAction) {
      const fn = pendingAction;
      pendingAction = null;
      fn();
    }
  });

  socket.on('player:error', (data) => {
    pendingAction = null;
    handlers.onError?.(data);
  });
  socket.on('session:replaced', () => handlers.onReplaced?.());
  socket.on('rate:limited', () => handlers.onError?.({ code: 'RATE_LIMITED', message: 'Muitas ações seguidas. Aguarde um instante.' }));

  socket.on('room:created', (room) => handlers.onRoomState?.(room));
  socket.on('room:joined', (room) => handlers.onRoomState?.(room));
  socket.on('room:updated', (room) => handlers.onRoomState?.(room));
  socket.on('room:left', (data) => handlers.onRoomLeft?.(data));
  socket.on('room:error', (err) => handlers.onRoomError?.(err));

  socket.on('matchmaking:waiting', (data) => handlers.onMatchmakingWaiting?.(data));
  socket.on('matchmaking:found', (room) => handlers.onMatchmakingFound?.(room));
  socket.on('matchmaking:left', () => handlers.onMatchmakingLeft?.());

  socket.on('game:starting', (data) => handlers.onGameStarting?.(data));
  socket.on('game:started', (data) => handlers.onGameStarted?.(data));
  socket.on('game:state', (state) => handlers.onGameState?.(state));
  socket.on('game:finished', (result) => handlers.onGameFinished?.(result));

  function ensureJoinedThen(name, character, action) {
    desiredProfile = { name, character };
    pendingAction = action;
    if (socket.connected) sendJoin();
  }

  return {
    createRoom(name, character) {
      ensureJoinedThen(name, character, () => socket.emit('room:create', { character }));
    },
    playWithBots(name, character, botCount = 3) {
      ensureJoinedThen(name, character, () => socket.emit('room:createBots', { character, botCount, autoStart: true }));
    },
    addBot() {
      socket.emit('room:addBot');
    },
    removeBot(botId) {
      socket.emit('room:removeBot', { botId });
    },
    joinRoom(name, character, code) {
      ensureJoinedThen(name, character, () => socket.emit('room:join', { code, character }));
    },
    leaveRoom() {
      socket.emit('room:leave');
    },
    setReady(ready) {
      socket.emit('player:ready', { ready });
    },
    selectCharacter(character) {
      if (desiredProfile) desiredProfile.character = character;
      socket.emit('player:selectCharacter', { character });
    },
    startRoom() {
      socket.emit('room:start');
    },
    joinMatchmaking(name, character) {
      ensureJoinedThen(name, character, () => socket.emit('matchmaking:join', { character }));
    },
    leaveMatchmaking() {
      socket.emit('matchmaking:leave');
    },
    sendInput(input) {
      socket.emit('game:input', input);
    },
    placeBomb() {
      socket.emit('game:placeBomb');
    },
    get connected() {
      return socket.connected;
    },
  };
}
