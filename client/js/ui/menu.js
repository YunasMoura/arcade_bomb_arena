export function createMenu({
  onSelectCharacter,
  onCreateRoom,
  onPlayBots,
  onJoinRoom,
  onFindMatch,
  onCancelMatchmaking,
}) {
  const $ = (id) => document.getElementById(id);
  const screen = $('screen-menu');
  const inputName = $('input-name');
  const inputCode = $('input-room-code');
  const btnCreate = $('btn-create-room');
  const btnBots = $('btn-play-bots');
  const btnJoin = $('btn-join-room');
  const btnMatch = $('btn-matchmaking');
  const btnCancelMm = $('btn-cancel-mm');
  const mmBox = $('mm-box');
  const msg = $('msg');
  const dot = $('conn-dot');
  const text = $('conn-text');
  const rttEl = $('conn-rtt');
  const charButtons = Array.from(document.querySelectorAll('#menu-char-grid .char-card'));

  let selectedChar = 'rex';
  let isConnected = false;

  charButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedChar = btn.dataset.char;
      charButtons.forEach((b) => b.classList.toggle('selected', b === btn));
      onSelectCharacter?.(selectedChar);
    });
  });

  btnCreate.addEventListener('click', () => onCreateRoom(inputName.value, selectedChar));
  btnBots.addEventListener('click', () => onPlayBots(inputName.value, selectedChar));
  btnJoin.addEventListener('click', () => onJoinRoom(inputName.value, selectedChar, inputCode.value));
  inputCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onJoinRoom(inputName.value, selectedChar, inputCode.value);
  });
  btnMatch.addEventListener('click', () => onFindMatch(inputName.value, selectedChar));
  btnCancelMm.addEventListener('click', () => onCancelMatchmaking());

  const labels = {
    connecting: ['dot-wait', 'Conectando…'],
    connected: ['dot-on', 'Conectado'],
    disconnected: ['dot-off', 'Desconectado. Tentando reconectar…'],
  };

  function syncButtons() {
    btnCreate.disabled = !isConnected;
    btnBots.disabled = !isConnected;
    btnJoin.disabled = !isConnected;
    btnMatch.disabled = !isConnected;
  }

  return {
    show() {
      screen.classList.remove('hidden');
    },
    hide() {
      screen.classList.add('hidden');
    },
    setConnection(status) {
      const [cls, label] = labels[status];
      dot.className = `dot ${cls}`;
      text.textContent = label;
      isConnected = status === 'connected';
      syncButtons();
      if (!isConnected) rttEl.textContent = '';
    },
    setRtt(ms) {
      rttEl.textContent = ms == null ? '' : `· ${Math.round(ms)} ms`;
    },
    setMatchmaking(waiting) {
      mmBox.classList.toggle('hidden', !waiting);
      btnMatch.disabled = waiting || !isConnected;
      btnCreate.disabled = waiting || !isConnected;
      btnBots.disabled = waiting || !isConnected;
      btnJoin.disabled = waiting || !isConnected;
    },
    setMessage(message, isError = false) {
      msg.textContent = message;
      msg.classList.toggle('error', isError);
    },
  };
}
