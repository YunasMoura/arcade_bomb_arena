import { serverNow } from '../state.js';

const CHAR_LABELS = {
  rex: 'Rex',
  luna: 'Luna',
  byte: 'Byte',
  niko: 'Niko',
};

export function createLobby({
  onSelectCharacter,
  onToggleReady,
  onStartGame,
  onLeaveRoom,
  onAddBot,
  onRemoveBot,
}) {
  const $ = (id) => document.getElementById(id);
  const screen = $('screen-lobby');
  const codeEl = $('lobby-code');
  const btnCopy = $('btn-copy-code');
  const typeEl = $('lobby-type');
  const countEl = $('lobby-count');
  const countdownEl = $('lobby-countdown');
  const playersEl = $('lobby-players');
  const btnLeave = $('btn-leave-room');
  const btnReady = $('btn-ready');
  const btnStart = $('btn-start-game');
  const msgEl = $('lobby-msg');
  const charButtons = Array.from(document.querySelectorAll('#lobby-char-grid .char-card'));

  let currentReady = false;
  let countdownTimer = null;

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      btnCopy.textContent = 'Copiado!';
      setTimeout(() => { btnCopy.textContent = 'Copiar'; }, 1500);
    } catch {
      btnCopy.textContent = codeEl.textContent;
    }
  });

  charButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!btn.disabled) onSelectCharacter(btn.dataset.char);
    });
  });

  btnReady.addEventListener('click', () => onToggleReady(!currentReady));
  btnStart.addEventListener('click', () => onStartGame());
  btnLeave.addEventListener('click', () => onLeaveRoom());

  function stopCountdownLoop() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function updateCountdown(endsAt) {
    stopCountdownLoop();
    if (!endsAt) {
      countdownEl.classList.add('hidden');
      return;
    }
    countdownEl.classList.remove('hidden');
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
      countdownEl.textContent = remaining > 0
        ? `A PARTIDA COMEÇA EM ${remaining}s…`
        : 'INICIANDO ARENA…';
    };
    tick();
    countdownTimer = setInterval(tick, 200);
  }

  return {
    show() {
      screen.classList.remove('hidden');
    },
    hide() {
      stopCountdownLoop();
      screen.classList.add('hidden');
    },
    render(room, myPlayerId) {
      if (!room) return;
      codeEl.textContent = room.code;
      typeEl.textContent = room.isPublic ? 'Matchmaking Público' : 'Sala Privada';
      countEl.textContent = `${room.players.length}/${room.maxPlayers} Jogadores`;

      const me = room.players.find((p) => p.playerId === myPlayerId);
      currentReady = Boolean(me?.ready);

      btnReady.textContent = currentReady ? 'CANCELAR PRONTO' : 'ESTOU PRONTO';
      btnReady.classList.toggle('btn-primary', !currentReady);

      const isHost = room.hostId === myPlayerId;
      btnStart.classList.toggle('hidden', !isHost);
      btnStart.disabled = room.players.length < room.minPlayersToStart || room.status !== 'waiting';

      const takenByOthers = new Set(
        room.players.filter((p) => p.playerId !== myPlayerId).map((p) => p.character)
      );
      charButtons.forEach((btn) => {
        const char = btn.dataset.char;
        btn.classList.toggle('selected', me?.character === char);
        btn.disabled = takenByOthers.has(char) || room.status === 'playing';
      });

      playersEl.innerHTML = '';
      for (let i = 0; i < room.maxPlayers; i += 1) {
        const player = room.players[i];
        const card = document.createElement('div');
        if (!player) {
          card.className = 'slot-card empty';
          if (isHost && !room.isPublic && room.status === 'waiting') {
            card.innerHTML = `<span>Vaga ${i + 1}</span><button type="button" class="btn btn-small">+ Bot</button>`;
            card.querySelector('button').addEventListener('click', () => onAddBot?.());
          } else {
            card.textContent = `Vaga ${i + 1} aberta`;
          }
        } else {
          card.className = `slot-card ${player.ready ? 'ready' : ''}`;
          const tags = [CHAR_LABELS[player.character] || player.character];
          if (player.isHost) tags.push('Anfitrião');
          if (player.isBot) tags.push('IA');
          if (!player.connected) tags.push('Reconectando…');

          const removeBtnHtml =
            isHost && player.isBot && room.status === 'waiting'
              ? `<button type="button" class="btn btn-small btn-danger" title="Remover Bot">✕</button>`
              : '';

          card.innerHTML = `
            <div class="slot-info">
              <span class="char-avatar char-${player.character}"></span>
              <div>
                <span class="slot-name">${player.name}${player.playerId === myPlayerId ? ' (Você)' : ''}</span>
                <span class="slot-sub">${tags.join(' · ')}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="${player.ready ? 'pill-ready' : 'pill-wait'}">
                ${player.ready ? 'Pronto' : 'Aguardando'}
              </span>
              ${removeBtnHtml}
            </div>
          `;
          if (removeBtnHtml) {
            card.querySelector('button').addEventListener('click', () => onRemoveBot?.(player.playerId));
          }
        }
        playersEl.appendChild(card);
      }

      updateCountdown(room.countdownEndsAt);
    },
    setMessage(message, isError = false) {
      msgEl.textContent = message;
      msgEl.classList.toggle('error', isError);
    },
  };
}
