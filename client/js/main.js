import { state } from './state.js';
import { createNetwork } from './socket.js';
import { createMenu } from './ui/menu.js';
import { createLobby } from './ui/lobby.js';
import { createGameScreen } from './ui/gameHud.js';
import { createInputController } from './input/inputController.js';
import { renderCharacterPreviews } from './render/pixelSprites.js';
import { soundEngine } from './audio/soundEngine.js';

function showScreen(name) {
  state.screen = name;
  menu.hide();
  lobby.hide();
  gameScreen.hide();
  inputController.disable();

  if (name === 'menu') {
    menu.show();
  } else if (name === 'lobby') {
    lobby.show();
  } else if (name === 'game') {
    inputController.enable();
  }
}

const menu = createMenu({
  onSelectCharacter(character) {
    state.selectedCharacter = character;
  },
  onCreateRoom(name, character) {
    menu.setMessage('');
    network.createRoom(name, character);
  },
  onPlayBots(name, character) {
    menu.setMessage('');
    network.playWithBots(name, character, 3);
  },
  onJoinRoom(name, character, code) {
    menu.setMessage('');
    network.joinRoom(name, character, code);
  },
  onFindMatch(name, character) {
    menu.setMessage('');
    network.joinMatchmaking(name, character);
  },
  onCancelMatchmaking() {
    network.leaveMatchmaking();
  },
});

const lobby = createLobby({
  onSelectCharacter(character) {
    lobby.setMessage('');
    network.selectCharacter(character);
  },
  onToggleReady(ready) {
    lobby.setMessage('');
    network.setReady(ready);
  },
  onStartGame() {
    lobby.setMessage('');
    network.startRoom();
  },
  onLeaveRoom() {
    network.leaveRoom();
  },
  onAddBot() {
    lobby.setMessage('');
    network.addBot();
  },
  onRemoveBot(botId) {
    lobby.setMessage('');
    network.removeBot(botId);
  },
});

const gameScreen = createGameScreen({
  onQuitMatch() {
    network.leaveRoom();
  },
});

const inputController = createInputController({
  onInputChange(keys) {
    network.sendInput(keys);
  },
  onPlaceBomb() {
    soundEngine.playPlaceBomb();
    network.placeBomb();
  },
  onQuit() {
    network.leaveRoom();
  },
  onToggleMute() {
    gameScreen.toggleMute();
  },
});

const network = createNetwork({
  onStatus(status) {
    state.connection = status;
    menu.setConnection(status);
  },
  onJoined(data) {
    state.profile = { playerId: data.playerId, name: data.name, character: data.character };
    if (data.match && data.room) {
      state.room = data.room;
      showScreen('game');
      gameScreen.start(data.match, data.playerId);
    } else if (data.room) {
      state.room = data.room;
      showScreen('lobby');
      lobby.render(data.room, data.playerId);
    }
  },
  onError(data) {
    menu.setMatchmaking(false);
    if (state.screen === 'lobby') lobby.setMessage(data.message, true);
    else menu.setMessage(data.message, true);
  },
  onReplaced() {
    state.profile = null;
    state.room = null;
    showScreen('menu');
    menu.setMessage('Sua sessão foi aberta em outra aba.', true);
  },
  onClock({ offset, rtt }) {
    state.clockOffset = offset;
    state.rtt = rtt;
    menu.setRtt(rtt);
  },
  onRoomState(room) {
    state.inMatchmaking = false;
    state.room = room;
    menu.setMatchmaking(false);
    if (room.status !== 'playing') {
      showScreen('lobby');
      lobby.render(room, state.profile?.playerId);
    }
  },
  onRoomLeft() {
    state.room = null;
    showScreen('menu');
    menu.setMessage('Você saiu da sala.');
  },
  onRoomError(err) {
    menu.setMatchmaking(false);
    if (state.screen === 'lobby') lobby.setMessage(err.message, true);
    else menu.setMessage(err.message, true);
  },
  onMatchmakingWaiting() {
    state.inMatchmaking = true;
    menu.setMatchmaking(true);
    menu.setMessage('');
  },
  onMatchmakingFound(room) {
    state.inMatchmaking = false;
    state.room = room;
    menu.setMatchmaking(false);
    showScreen('lobby');
    lobby.render(room, state.profile?.playerId);
  },
  onMatchmakingLeft() {
    state.inMatchmaking = false;
    menu.setMatchmaking(false);
    menu.setMessage('Busca por partida cancelada.');
  },
  onGameStarting() {
    if (state.room && state.profile && state.screen === 'lobby') {
      lobby.render(state.room, state.profile.playerId);
    }
  },
  onGameStarted(data) {
    if (data.match && state.profile) {
      showScreen('game');
      gameScreen.start(data.match, state.profile.playerId);
    }
  },
  onGameState(matchState) {
    if (state.screen === 'game') {
      gameScreen.onState(matchState);
    }
  },
  onGameFinished(result) {
    if (state.screen === 'game') {
      inputController.disable();
      gameScreen.showGameOver(result);
    }
  },
});

renderCharacterPreviews();
menu.setConnection('connecting');
