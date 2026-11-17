// The lobby is a short sequence: shape, color, then room.
const roomForm = document.querySelector('#roomForm');
const roomList = document.querySelector('#roomList');
const standTrialButton = document.querySelector('#standTrialButton');
const newRoomName = document.querySelector('#newRoomName');
const formMessage = document.querySelector('#formMessage');
const createRoomButton = document.querySelector('#createRoomButton');
const stepInstruction = document.querySelector('#stepInstruction');
const pageEyebrow = document.querySelector('#pageEyebrow');
const pageTitle = document.querySelector('#page-title');
const kingShapeButton = document.querySelector('#kingShapeButton');
const backButton = document.querySelector('#backButton');
const shapeStep = document.querySelector('#shapeStep');
const colorStep = document.querySelector('#colorStep');
const roomStep = document.querySelector('#roomStep');
const loginView = document.querySelector('#loginView');
const roomView = document.querySelector('#roomView');
const roomCombinedGlow = document.querySelector('#roomCombinedGlow');
const meetingLabel = document.querySelector('#meetingLabel');
const seriesScore = document.querySelector('#seriesScore');
const playersElement = document.querySelector('#players');
const judgeButton = document.querySelector('#judgeButton');
const strawButton = document.querySelector('#strawButton');
const gestureButton = document.querySelector('#gestureButton');
const cardsButton = document.querySelector('#cardsButton');
const diceButton = document.querySelector('#diceButton');
const resultElement = document.querySelector('#result');
const verdictOverlay = document.querySelector('#verdictOverlay');
const verdictColorField = document.querySelector('#verdictColorField');
const verdictContent = document.querySelector('.verdict-content');
const verdictHeading = document.querySelector('#verdictHeading');
const verdictRulingLabel = document.querySelector('#verdictRulingLabel');
const verdictArgument = document.querySelector('#verdictArgument');
const verdictQuestionMark = document.querySelector('#verdictQuestionMark');
const verdictWinner = document.querySelector('#verdictWinner');
const verdictSubtext = document.querySelector('#verdictSubtext');
const verdictSeriesSubtext = document.querySelector('#verdictSeriesSubtext');
const verdictWinningHand = document.querySelector('#verdictWinningHand');
const rematchPanel = document.querySelector('#rematchPanel');
const rematchPrompt = document.querySelector('#rematchPrompt');
const bestOfThreeButton = document.querySelector('#bestOfThreeButton');
const bestOfFiveButton = document.querySelector('#bestOfFiveButton');
const continueSeriesButton = document.querySelector('#continueSeriesButton');
const acceptRematchButton = document.querySelector('#acceptRematchButton');
const declineRematchButton = document.querySelector('#declineRematchButton');
const transitionOverlay = document.querySelector('#transitionOverlay');
const selectedColorGlow = document.querySelector('#selectedColorGlow');
const strawOverlay = document.querySelector('#strawOverlay');
const strawInstruction = document.querySelector('#strawInstruction');
const strawChoices = document.querySelector('#strawChoices');
const strawTallies = document.querySelector('#strawTallies');
const gestureOverlay = document.querySelector('#gestureOverlay');
const gestureInstruction = document.querySelector('#gestureInstruction');
const gestureRound = document.querySelector('#gestureRound');
const gestureChoices = document.querySelector('#gestureChoices');
const gestureReveal = document.querySelector('#gestureReveal');
const cardsOverlay = document.querySelector('#cardsOverlay');
const cardsTurnGlow = document.querySelector('#cardsTurnGlow');
const cardsInstruction = document.querySelector('#cardsInstruction');
const cardCollections = document.querySelector('#cardCollections');
const cardDeck = document.querySelector('#cardDeck');
const diceOverlay = document.querySelector('#diceOverlay');
const diceInstruction = document.querySelector('#diceInstruction');
const diceHand = document.querySelector('#diceHand');
const diceCalledHand = document.querySelector('#diceCalledHand');
document.querySelector('.dice-actions').after(diceCalledHand);
const rerollDiceButton = document.querySelector('#rerollDiceButton');
const callDiceButton = document.querySelector('#callDiceButton');
const BLACKOUT_DURATION = 440;
const socketState = { socket: null, player: null, hostId: null, shape: null, color: null };
let selectedRoomName = '';
let renderedCardCount = 0;
let selectedDice = new Set();
let knownDrawnStraws = new Set();
let currentRoomState = null;
let nextMeetingNumber = 1;
let currentGameMode = 'judge';
const kingIconPath = './Element/Royal%20Rat%20Insignia.png';
const shapeGlyphs = { square: '■', diamond: '◆', spade: '♠', club: '♣', heart: '♥' };

function fadeBetween(update, reveal = true) {
  backButton.classList.add('is-fading');
  transitionOverlay.classList.add('is-active');
  window.setTimeout(() => {
    update();
    window.requestAnimationFrame(positionBackButton);
    if (reveal) {
      window.setTimeout(() => {
        transitionOverlay.classList.remove('is-active');
        backButton.classList.remove('is-fading');
      }, 260);
    }
  }, 420);
}

function send(type, data = {}) { if (socketState.socket?.readyState === WebSocket.OPEN) socketState.socket.send(JSON.stringify({ type, ...data })); }
function fadeToGame(type, data = {}) {
  transitionOverlay.classList.add('is-active');
  window.setTimeout(() => send(type, data), BLACKOUT_DURATION);
}
function revealAfterBlack(render) {
  transitionOverlay.classList.add('is-active');
  window.setTimeout(() => {
    render();
    window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 520);
  }, BLACKOUT_DURATION);
}
function hideGameSurfaces() {
  [strawOverlay, gestureOverlay, cardsOverlay, diceOverlay].forEach((overlay) => {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
  });
  roomView.classList.add('is-hidden');
}
function colorClass(color) { return `player-swatch player-swatch--${color}`; }
function shapeGlyph(shape) { return shapeGlyphs[shape] || '•'; }
function shapeMarkup(shape) { return shape === 'king' ? `<img class="king-icon" src="${kingIconPath}" alt="King" />` : shapeGlyph(shape); }
const gestureAssets = { rock: './Element/Rock.png', paper: './Element/Paper.png', scissors: './Element/Scissors.png' };
const cardSuitBases = { spades: 0x1f0a1, hearts: 0x1f0b1, diamonds: 0x1f0c1, clubs: 0x1f0d1 };
const cardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const sameColorShifts = { red: '#a84d6b', blue: '#7770bd', yellow: '#b9aa62', green: '#4f9b87' };

function gestureMarkup(gesture) { return `<img src="${gestureAssets[gesture]}" alt="${gesture}" />`; }
function cardSymbol(card) {
  const rankOffset = card.rank === 1 ? 0 : card.rank <= 10 ? card.rank - 1 : card.rank === 11 ? 10 : card.rank === 12 ? 12 : 13;
  return String.fromCodePoint(cardSuitBases[card.suit] + rankOffset);
}
function diceSymbol(value) { return String.fromCodePoint(0x2680 + value - 1); }

function animateDie(die, finalValue) {
  let frame = 0;
  const totalFrames = 11;
  const settle = () => {
    if (frame >= totalFrames) {
      die.textContent = diceSymbol(finalValue);
      die.classList.remove('is-rolling');
      return;
    }
    die.textContent = diceSymbol(Math.floor(Math.random() * 6) + 1);
    die.classList.add('is-rolling');
    frame += 1;
    window.setTimeout(settle, 35 + (frame * 22));
  };
  settle();
}

function renderDiceState(message) {
  const myTurn = message.currentPlayerId === socketState.player;
  const turnActive = myTurn && !message.called;
  const rerollsRemaining = message.rerollsRemaining ?? 0;
  const canAct = turnActive && rerollsRemaining > 0;
  diceInstruction.textContent = turnActive ? (rerollsRemaining > 0 ? `Select die to reroll. ${rerollsRemaining} reroll${rerollsRemaining === 1 ? '' : 's'} left.` : 'No rerolls left. Call to pass.') : 'Waiting for the other player.';
  const animatedIndices = message.rerolledIndices ? new Set(message.rerolledIndices) : null;
  diceHand.innerHTML = (message.dice || []).map((value, index) => `<button class="die${selectedDice.has(index) ? ' is-selected' : ''}" type="button" data-index="${index}" ${canAct ? '' : 'disabled'} aria-label="Die showing ${value}">${diceSymbol(value)}</button>`).join('');
  diceHand.querySelectorAll('.die').forEach((die) => die.addEventListener('click', () => {
    const index = Number(die.dataset.index);
    if (selectedDice.has(index)) selectedDice.delete(index); else if (selectedDice.size < 5) selectedDice.add(index);
    die.classList.toggle('is-selected', selectedDice.has(index));
    rerollDiceButton.disabled = !canAct || selectedDice.size === 0;
  }));
  diceHand.querySelectorAll('.die').forEach((die, index) => {
    if (!animatedIndices || animatedIndices.has(index)) animateDie(die, message.dice[index]);
  });
  if (message.calledDice) {
    const calledByMe = message.calledPlayerId === socketState.player;
    diceCalledHand.innerHTML = `<small>${calledByMe ? 'Your called hand' : "Opponent's called hand"}</small><div class="dice-called-values">${message.calledDice.map((value) => `<span>${diceSymbol(value)}</span>`).join('')}</div>`;
    diceCalledHand.classList.remove('is-hidden');
  }
  rerollDiceButton.disabled = !canAct || selectedDice.size === 0;
  callDiceButton.disabled = !turnActive;
  diceOverlay.className = `dice-overlay dice-overlay--${message.currentPlayerColor || 'white'} is-visible`;
  diceOverlay.setAttribute('aria-hidden', 'false');
}

function renderCardCollections(collections) {
  const playerCollection = (collections || []).find((collection) => collection.id === socketState.player);
  if (!playerCollection) { cardCollections.innerHTML = ''; return; }
  const cards = playerCollection.cards || [];
  const availableWidth = Math.max(280, window.innerWidth - 48);
  const fittedSize = Math.min(192, Math.max(18, Math.floor((availableWidth / Math.max(cards.length, 1)) * 0.82)));
  cardCollections.style.setProperty('--revealed-card-size', `${fittedSize}px`);
  cardCollections.innerHTML = `<div class="card-collection"><div class="collected-cards">${cards.map((card, index) => `<span class="collected-card${index >= renderedCardCount ? ' is-new-card' : ''}" title="${cardRanks[card.rank - 1]} of ${card.suit}">${cardSymbol(card)}</span>`).join('')}</div></div>`;
  renderedCardCount = cards.length;
}

function renderCardGame(message) {
  const picked = new Set(message.picked || []);
  if (!message.picked || message.picked.length === 0) renderedCardCount = 0;
  const turnPlayer = (message.collections || []).find((collection) => collection.id === message.currentPlayerId);
  const turnColor = message.currentPlayerColor || turnPlayer?.color || socketState.color || 'white';
  const ownCollection = (message.collections || []).find((collection) => collection.id === socketState.player);
  const ownTotal = ownCollection?.total || 0;
  cardsInstruction.textContent = message.currentPlayerId === socketState.player
    ? `Your turn. Pick one card. Your total: ${ownTotal} points.`
    : `Waiting for the other player. Your total: ${ownTotal} points.`;
  renderCardCollections(message.collections || []);
  cardDeck.innerHTML = '';
  (message.cards || []).forEach((card) => {
    const cardButton = document.createElement('button');
    cardButton.className = `card-pick${picked.has(card.id) ? ' is-picked' : ''}`;
    cardButton.type = 'button';
    cardButton.textContent = '\u{1F0A0}';
    cardButton.disabled = picked.has(card.id) || message.currentPlayerId !== socketState.player;
    cardButton.setAttribute('aria-label', picked.has(card.id) ? 'Card already drawn' : 'Pick a face-down card');
    if (!picked.has(card.id)) cardButton.addEventListener('click', () => {
      cardDeck.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      send('cardPick', { cardId: card.id });
    });
    cardDeck.appendChild(cardButton);
  });
  cardsOverlay.className = `cards-overlay cards-overlay--${turnColor} is-visible`;
  cardsTurnGlow.className = `cards-turn-glow cards-turn-glow--${turnColor}`;
  cardsOverlay.setAttribute('aria-hidden', 'false');
}

function clearRoomSelection() {
  roomList.classList.add('is-hidden');
  standTrialButton.classList.add('is-hidden');
  createRoomButton.classList.add('is-hidden');
  newRoomName.value = '';
  newRoomName.classList.remove('is-set', 'is-focused');
  selectedRoomName = '';
  document.querySelectorAll('.room-entry').forEach((entry) => entry.classList.remove('is-selected'));
}

function positionBackButton() {
  if (backButton.classList.contains('is-hidden')) return;
  backButton.style.position = 'fixed';
  backButton.style.left = 'max(16px, env(safe-area-inset-left))';
  backButton.style.top = 'auto';
  backButton.style.bottom = 'max(16px, env(safe-area-inset-bottom))';
  backButton.style.transform = 'none';
}

function renderRoomDirectory(rooms) {
  roomList.innerHTML = '';
  if (!rooms.length) { roomList.innerHTML = '<p class="directory-empty">No open rooms yet.</p>'; return; }
  rooms.forEach((room) => {
    const roomButton = document.createElement('button');
    roomButton.className = 'room-entry';
    roomButton.type = 'button';
    roomButton.innerHTML = '<span class="room-entry-name"></span><span class="room-entry-meta"><span class="room-symbols"></span><span class="room-entry-count"></span></span>';
    roomButton.querySelector('.room-entry-name').textContent = room.name;
    roomButton.querySelector('.room-entry-count').textContent = `${room.players.length}/2`;
    room.players.forEach((player) => {
      const symbol = document.createElement('span');
      symbol.className = `room-symbol room-symbol--${player.color}`;
      symbol.innerHTML = shapeMarkup(player.shape);
      symbol.title = `${player.shape} / ${player.color}`;
      roomButton.querySelector('.room-symbols').appendChild(symbol);
    });
    roomButton.addEventListener('click', () => {
      document.querySelectorAll('.room-entry').forEach((entry) => entry.classList.remove('is-selected'));
      roomButton.classList.add('is-selected');
      selectedRoomName = room.name;
      window.setTimeout(() => joinRoom(room.name), 180);
    });
    roomList.appendChild(roomButton);
  });
}

function joinRoom(roomName) {
  if (!roomName || !socketState.shape || !socketState.color) return;
  const argument = newRoomName.value.trim() || roomName;
  formMessage.textContent = 'Joining room...';
  formMessage.className = 'form-message';
  fadeBetween(() => send('join', { roomName, color: socketState.color, shape: socketState.shape, argument }), false);
}

function renderRoom(room) {
  currentRoomState = room;
  // The first player in the room is the creator and remains the host.
  // Derive this from the ordered player list so older room messages cannot disable the host controls.
  socketState.hostId = room.players[0]?.id || null;
  const argumentsInRoom = room.players.map((player) => player.argument || room.name);
  document.querySelector('#roomHeadingName').textContent = argumentsInRoom.length > 1 ? `${argumentsInRoom[0]} or ${argumentsInRoom[1]}` : argumentsInRoom[0];
  const meetingWords = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  meetingLabel.textContent = room.series?.target && nextMeetingNumber > 1
    ? `${meetingWords[nextMeetingNumber - 1] || `${nextMeetingNumber}th`} meeting in session`
    : 'Meeting in Session';
  if (room.series?.target) {
    const scores = room.players.map((roomPlayer) => `<span class="series-player"><span class="series-player-symbol">${shapeMarkup(roomPlayer.shape)}</span><strong>${room.series.wins?.[roomPlayer.id] || 0}</strong></span>`).join('<span class="series-divider">—</span>');
    seriesScore.innerHTML = `<small>Best of ${room.series.target}</small><div>${scores}</div>`;
    seriesScore.classList.remove('is-hidden');
  } else {
    seriesScore.classList.add('is-hidden');
    seriesScore.innerHTML = '';
  }
  playersElement.innerHTML = '';
  const duelElement = document.createElement('div');
  duelElement.className = 'player-duel';
  room.players.slice(0, 2).forEach((player, index) => {
    const token = document.createElement('span');
    token.className = `player-token player-token--${player.color}`;
    const hostPlayer = room.players.find((roomPlayer) => roomPlayer.id === socketState.hostId);
    if (hostPlayer && player.id !== hostPlayer.id && player.color === hostPlayer.color) token.style.background = sameColorShifts[player.color];
    token.innerHTML = shapeMarkup(player.shape);
    token.setAttribute('aria-label', `${player.color} ${player.shape}`);
    duelElement.appendChild(token);
    if (index === 0) {
      const versus = document.createElement('span');
      versus.className = 'duel-versus';
      versus.textContent = 'V';
      duelElement.appendChild(versus);
    }
  });
  if (room.players.length < 2) {
    const waitingToken = document.createElement('span');
    waitingToken.className = 'player-token player-token--empty';
    waitingToken.textContent = '?';
    duelElement.appendChild(waitingToken);
  }
  playersElement.appendChild(duelElement);
  const ready = room.players.length === 2;
  if (ready) {
    const hostPlayer = room.players.find((player) => player.id === socketState.hostId) || room.players[0];
    const guestPlayer = room.players.find((player) => player.id !== hostPlayer.id) || room.players[1];
    const guestColor = hostPlayer.color === guestPlayer.color ? sameColorShifts[guestPlayer.color] : `var(--${guestPlayer.color})`;
    roomCombinedGlow.style.background = `linear-gradient(135deg, var(--${hostPlayer.color}), ${guestColor})`;
    roomCombinedGlow.classList.remove('is-same-color');
    roomCombinedGlow.classList.add('is-visible');
  } else {
    roomCombinedGlow.classList.remove('is-visible');
    roomCombinedGlow.classList.remove('is-same-color');
  }
  const isHost = socketState.player === socketState.hostId;
  const chooserId = room.series?.target && room.series.chooserId ? room.series.chooserId : socketState.hostId;
  const canChooseGame = socketState.player === chooserId;
  judgeButton.disabled = !ready || !canChooseGame;
  strawButton.disabled = !ready || !canChooseGame;
  gestureButton.disabled = !ready || !canChooseGame;
  cardsButton.disabled = !ready || !canChooseGame;
  diceButton.disabled = !ready || !canChooseGame;
  [judgeButton, strawButton, gestureButton, cardsButton, diceButton].forEach((button) => {
    button.title = canChooseGame ? '' : (room.series?.target ? 'The previous loser chooses the next game.' : 'Only the host can choose the game.');
  });
}

function renderGestureChoices(selectedPlayerIds = [], choices = {}) {
  const alreadySelected = selectedPlayerIds.includes(socketState.player);
  gestureChoices.innerHTML = '';
  ['rock', 'paper', 'scissors'].forEach((gesture) => {
    const choiceButton = document.createElement('button');
    choiceButton.className = 'gesture-choice';
    choiceButton.type = 'button';
    choiceButton.disabled = alreadySelected;
    if (choices[socketState.player] === gesture) choiceButton.classList.add('is-selected');
    else if (alreadySelected) choiceButton.classList.add('is-unavailable');
    choiceButton.setAttribute('aria-label', `Choose ${gesture}`);
    choiceButton.innerHTML = gestureMarkup(gesture);
    choiceButton.addEventListener('click', () => {
      gestureChoices.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      choiceButton.classList.add('is-selected');
      gestureChoices.querySelectorAll('button').forEach((button) => { if (button !== choiceButton) button.classList.add('is-unavailable'); });
      gestureInstruction.textContent = 'Waiting for the other player.';
      send('gestureChoice', { choice: gesture });
    });
    gestureChoices.appendChild(choiceButton);
  });
}

function renderGestureStart(message) {
  gestureReveal.innerHTML = '';
  gestureChoices.classList.remove('is-direction-mode');
  gestureInstruction.classList.remove('is-direction-instruction');
  gestureOverlay.querySelector('.gesture-content h2').innerHTML = 'Choose your<br /><span>gesture.</span>';
  gestureInstruction.textContent = 'Choose rock, paper, or scissors.';
  gestureRound.textContent = `ROUND ${message.gestureSeries?.round || message.round || 1}`;
  renderGestureChoices(message.selectedPlayerIds || [], message.choices || {});
  gestureOverlay.setAttribute('aria-hidden', 'false');
  gestureOverlay.classList.add('is-visible');
}

const directionGlyphs = { up: '↑', down: '↓', left: '←', right: '→' };
function renderDirectionChoices(message) {
  gestureReveal.innerHTML = '';
  gestureChoices.classList.add('is-direction-mode');
  gestureInstruction.classList.remove('is-direction-instruction');
  gestureOverlay.querySelector('.gesture-content h2').innerHTML = 'Choose your<br /><span>direction.</span>';
  gestureReveal.classList.remove('is-resolving', 'is-tie');
  gestureRound.textContent = `ROUND ${message.gestureSeries?.round || 1}`;
  gestureInstruction.textContent = '';
  const selected = new Set(message.selectedPlayerIds || []);
  const choices = document.createElement('div');
  choices.className = 'direction-choices';
  Object.entries(directionGlyphs).forEach(([direction, glyph]) => {
    const button = document.createElement('button');
    button.className = `direction-choice direction-choice--${direction}`;
    button.type = 'button';
    button.textContent = glyph;
    button.setAttribute('aria-label', `Choose ${direction}`);
    button.disabled = selected.has(socketState.player);
    button.addEventListener('click', () => {
      choices.querySelectorAll('button').forEach((choice) => { choice.disabled = true; choice.classList.toggle('is-unavailable', choice !== button); });
      button.classList.add('is-selected');
      gestureInstruction.textContent = 'Waiting for the other player.';
      send('directionChoice', { direction });
    });
    choices.appendChild(button);
  });
  gestureChoices.innerHTML = '';
  gestureChoices.appendChild(choices);
  gestureOverlay.setAttribute('aria-hidden', 'false');
  gestureOverlay.classList.add('is-visible');
}

function showDirectionResult(message) {
  gestureChoices.innerHTML = '';
  gestureReveal.classList.remove('is-resolving', 'is-tie');
  gestureInstruction.textContent = message.correct ? 'Correct guess. Point claimed.' : 'Wrong guess. No point claimed.';
  const players = message.players || [];
  const orderedPlayers = [players.find((player) => player.id !== socketState.player), players.find((player) => player.id === socketState.player)].filter(Boolean);
  gestureReveal.innerHTML = orderedPlayers.map((player) => `<div class="gesture-result-card"><span class="direction-result-glyph">${directionGlyphs[message.selections[player.id]]}</span></div>`).join('');
  gestureOverlay.setAttribute('aria-hidden', 'false');
  gestureOverlay.classList.add('is-visible');
}

function showGestureResult(message) {
  gestureChoices.innerHTML = '';
  const roomPlayerList = message.players || currentRoomState?.players || [];
  const opponent = roomPlayerList.find((player) => player.id !== socketState.player);
  const orderedPlayers = [opponent, roomPlayerList.find((player) => player.id === socketState.player)].filter(Boolean);
  const choiceCards = orderedPlayers.map((player, index) => {
    const gesture = message.choices[player.id];
    const winnerClass = message.winner?.id === player.id ? ' is-winner' : '';
    const playerLabel = `${player.color} ${player.shape}`;
    return `<div class="gesture-result-card gesture-result-card--${index === 0 ? 'top' : 'bottom'}${winnerClass}"><span class="gesture-choice-visual">${gestureMarkup(gesture)}<span class="gesture-player-badge gesture-player-badge--${player.color}">${shapeMarkup(player.shape)}</span></span></div>`;
  }).join('<span class="gesture-versus">V</span>');
  gestureReveal.innerHTML = choiceCards;
  gestureInstruction.textContent = message.winner ? 'The gesture has spoken.' : 'A draw.';
  gestureReveal.classList.remove('is-resolving', 'is-tie');
  gestureReveal.classList.remove('is-resolving');
  gestureOverlay.classList.add('is-visible');
  gestureOverlay.setAttribute('aria-hidden', 'false');
}

function showVerdict(color, shape, result) {
  hideGameSurfaces();
  if (result?.method) currentGameMode = result.method;
  if (result?.series) currentRoomState.series = result.series;
  verdictContent.classList.remove('is-refreshing');
  void verdictContent.offsetWidth;
  verdictContent.classList.add('is-refreshing');
  verdictHeading.firstChild.textContent = 'Verdict';
  verdictQuestionMark.classList.remove('is-visible');
  verdictQuestionMark.classList.add('is-hidden');
  verdictRulingLabel.classList.add('is-hidden');
  verdictArgument.classList.add('is-hidden');
  verdictArgument.textContent = '';
  verdictWinningHand.classList.add('is-hidden');
  verdictWinningHand.innerHTML = '';
  continueSeriesButton.classList.add('is-hidden');
  verdictSeriesSubtext.classList.add('is-hidden');
  verdictSeriesSubtext.textContent = '';
  verdictColorField.className = `verdict-color-field verdict-color-field--${color}`;
  verdictWinner.className = `verdict-winner-symbol verdict-winner--${color}`;
  verdictWinner.innerHTML = shape ? shapeMarkup(shape) : 'Draw';
  verdictWinner.setAttribute('aria-label', `${shape} wins`);
  const winnerPlayer = currentRoomState?.players?.find((player) => player.id === result?.winner?.id);
  const isFinalRuling = !result?.series || result.series.complete;
  if (result?.winner && isFinalRuling) {
    verdictArgument.textContent = winnerPlayer?.argument || shape || 'The table';
    verdictArgument.classList.remove('is-hidden');
  }
  const isStrawLoss = result?.method === 'straws' && result.loser?.id === socketState.player;
  const winnerTotal = result?.collections?.find((collection) => collection.id === result.winner?.id)?.total;
  const loserTotal = result?.collections?.find((collection) => collection.id === result.loser?.id)?.total;
  verdictSubtext.textContent = result?.method === 'cards'
    ? (result.winner ? `Ruling in favor of the ${shape || 'winner'}, who had ${winnerTotal || 0} points over ${loserTotal || 0} points. Meeting adjourned` : 'The cards are tied. Meeting adjourned')
    : result?.method === 'dice'
    ? (result.winner
      ? `Ruling in favor of the ${shape || 'table'}, who had ${result.winningHandName || 'the winning hand'} over ${result.losingHandName || 'the opposing hand'}. Meeting adjourned`
      : 'The poker dice are tied. Meeting adjourned')
    : result?.method === 'straws'
    ? (isStrawLoss ? 'You drew the short straw. Meeting adjourned' : 'Opponent came short. Meeting adjourned')
    : `Ruling in favor of the ${shape}. Meeting adjourned`;
  if (result?.series?.target === 3 && result.series.complete && result.winner && result.loser) {
    const winnerLabel = `${result.winner.color} ${result.winner.shape}`;
    const loserLabel = `${result.loser.color} ${result.loser.shape}`;
    verdictSeriesSubtext.textContent = `${winnerLabel} has convinced the court over ${loserLabel}`;
    verdictSeriesSubtext.classList.remove('is-hidden');
  }
  if (result?.method === 'dice' && result.winningDice?.length) {
    verdictWinningHand.innerHTML = `<div><small>Winning hand</small><span class="verdict-dice-values">${result.winningDice.map((value) => `<span>${diceSymbol(value)}</span>`).join('')}</span></div><div><small>Losing hand</small><span class="verdict-dice-values">${(result.losingDice || []).map((value) => `<span>${diceSymbol(value)}</span>`).join('')}</span></div>`;
    verdictWinningHand.classList.remove('is-hidden');
  }
  rematchPanel.classList.add('is-hidden');
  if (result?.series && !result.series.complete) {
    const isSeriesWinner = result.winner?.id === socketState.player;
    if (isSeriesWinner) {
      rematchPanel.classList.remove('is-hidden');
      rematchPrompt.textContent = 'Continue to the next game?';
      continueSeriesButton.classList.remove('is-hidden');
      bestOfThreeButton.classList.add('is-hidden');
      bestOfFiveButton.classList.add('is-hidden');
      acceptRematchButton.classList.add('is-hidden');
      declineRematchButton.classList.add('is-hidden');
    }
  }
  window.setTimeout(() => {
    if (!result?.winner || !result?.loser || result.series?.complete || (result.series && !result.series.complete)) return;
    const loser = result.loser.id === socketState.player;
    const winner = result.winner.id === socketState.player;
    if (!loser) return;
    rematchPanel.classList.remove('is-hidden');
    const loserScore = result.series?.scores?.find((score) => score.id === socketState.player);
    const opponentScore = result.series?.scores?.find((score) => score.id !== socketState.player);
    const seriesIsTied = Boolean(result.series?.target && loserScore && loserScore.wins === loserScore.losses);
    const twoZeroBestOfThree = result.series?.target === 3 && (opponentScore?.wins || 0) >= 2 && (loserScore?.wins || 0) === 0;
    bestOfThreeButton.textContent = seriesIsTied ? 'Break the Tie' : 'Best of 3';
    bestOfThreeButton.classList.toggle('is-hidden', !loser || twoZeroBestOfThree);
    bestOfFiveButton.classList.toggle('is-hidden', !loser || (!seriesIsTied && !twoZeroBestOfThree && (loserScore?.losses || 0) < 2));
    acceptRematchButton.classList.add('is-hidden');
    declineRematchButton.classList.add('is-hidden');
    rematchPrompt.textContent = 'Choose a rematch format.';
  }, 2000);
  transitionOverlay.classList.add('is-active');
  verdictOverlay.setAttribute('aria-hidden', 'false');
  window.requestAnimationFrame(() => verdictOverlay.classList.add('is-visible'));
  window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 480);
}

function renderStrawDraw(message) {
  strawOverlay.setAttribute('aria-hidden', 'false');
  strawOverlay.className = `straw-overlay straw-overlay--${message.currentPlayerColor} is-visible`;
  strawChoices.innerHTML = '';
  const drawnIds = new Set(message.drawn.map((draw) => draw.strawId));
  const myTurn = message.currentPlayerId === socketState.player;
  strawInstruction.textContent = myTurn ? 'Your turn. Choose one.' : 'Waiting for the other player to draw.';
  strawTallies.innerHTML = '';
  (message.tallies || []).forEach((tally) => {
    const tallyElement = document.createElement('div');
    tallyElement.className = 'straw-tally';
    tallyElement.innerHTML = `<span class="straw-tally-symbol straw-symbol--${tally.color}">${shapeMarkup(tally.shape)}</span><strong>${tally.count}</strong>`;
    tallyElement.setAttribute('aria-label', `${tally.color} player has ${tally.count} safe straws`);
    strawTallies.appendChild(tallyElement);
  });
  (message.straws || []).forEach((strawData, index) => {
    const drawn = drawnIds.has(strawData.id);
    const strawButton = document.createElement('button');
    const newlyDrawn = drawn && !knownDrawnStraws.has(strawData.id);
    strawButton.className = `straw-choice${strawData.short ? ' is-short' : ''}${drawn ? ` is-drawn ${newlyDrawn ? 'is-sinking' : 'is-sunk'}` : ''}`;
    strawButton.type = 'button';
    strawButton.style.setProperty('--straw-height', `${strawData.height}px`);
    strawButton.style.setProperty('--straw-tilt', `${strawData.angle || 0}deg`);
    strawButton.disabled = drawn || !myTurn;
    strawButton.setAttribute('aria-label', drawn ? 'Straw already drawn' : 'Draw this straw');
    strawButton.innerHTML = `<img src="${strawData.short ? './Element/match_stick_short.png' : './Element/match_stick.png'}" alt="" />`;
    if (!drawn && myTurn) strawButton.addEventListener('click', () => {
      strawButton.disabled = true;
      strawButton.classList.add('is-flying');
      window.setTimeout(() => send('drawStraw', { strawId: strawData.id }), 620);
    });
    strawChoices.appendChild(strawButton);
  });
  knownDrawnStraws = drawnIds;
}

function connectSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${window.location.host}`);
  socketState.socket = socket;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'roomList') renderRoomDirectory(message.rooms);
    if (message.type === 'joined') {
      socketState.player = message.playerId;
      loginView.classList.add('is-hidden');
      roomView.classList.remove('is-hidden');
      selectedColorGlow.className = 'selected-color-glow';
      backButton.classList.add('is-hidden');
      backButton.classList.remove('is-fading');
      renderRoom(message.room);
      window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 420);
    }
    if (message.type === 'room') renderRoom(message.room);
    if (message.type === 'strawStart') { knownDrawnStraws = new Set(); revealAfterBlack(() => renderStrawDraw(message)); }
    if (message.type === 'strawUpdate') renderStrawDraw(message);
    if (message.type === 'gestureStart') revealAfterBlack(() => renderGestureStart(message));
    if (message.type === 'gestureUpdate') {
      gestureInstruction.textContent = 'Waiting for the other player.';
      renderGestureChoices(message.selectedPlayerIds || [], message.choices || {});
    }
    if (message.type === 'gestureResult') {
      showGestureResult(message);
      if (message.awaitDirection) {
        window.setTimeout(() => gestureReveal.classList.add('is-resolving'), 720);
        window.setTimeout(() => revealAfterBlack(() => renderDirectionChoices(message)), 1500);
      } else if (message.winner) {
        window.setTimeout(() => {
          gestureReveal.querySelectorAll('.gesture-result-card:not(.is-winner)').forEach((card) => card.classList.add('is-loser'));
          gestureReveal.classList.add('is-resolving');
        }, 720);
        window.setTimeout(() => {
          if (message.complete) revealAfterBlack(() => {
            gestureOverlay.classList.remove('is-visible');
            gestureOverlay.setAttribute('aria-hidden', 'true');
            showVerdict(message.winner.color, message.winner.shape, { ...message, method: 'gesture', series: message.roomSeries });
          });
          else revealAfterBlack(() => renderGestureStart({ selectedPlayerIds: [], choices: {}, gestureSeries: message.gestureSeries, roomSeries: message.roomSeries }));
        }, 1500);
      } else {
        window.setTimeout(() => {
          gestureReveal.classList.add('is-tie');
          gestureReveal.classList.add('is-resolving');
        }, 720);
        window.setTimeout(() => revealAfterBlack(() => renderGestureStart({ selectedPlayerIds: [], choices: {}, gestureSeries: message.gestureSeries, roomSeries: message.roomSeries })), 1500);
      }
    }
    if (message.type === 'directionUpdate') {
      gestureInstruction.textContent = 'Waiting for the other player.';
    }
    if (message.type === 'directionResult') {
      showDirectionResult(message);
      window.setTimeout(() => revealAfterBlack(() => {
        if (message.complete) {
          gestureOverlay.classList.remove('is-visible');
          gestureOverlay.setAttribute('aria-hidden', 'true');
          showVerdict(message.winner.color, message.winner.shape, { ...message, method: 'gesture', series: message.roomSeries });
        } else renderGestureStart({ selectedPlayerIds: [], choices: {}, gestureSeries: message.gestureSeries, roomSeries: message.roomSeries });
      }), 1200);
    }
    if (message.type === 'cardsStart') revealAfterBlack(() => renderCardGame(message));
    if (message.type === 'cardUpdate') renderCardGame(message);
    if (message.type === 'cardResult') {
      revealAfterBlack(() => {
        renderCardCollections(message.collections);
        cardsOverlay.classList.remove('is-visible');
        cardsOverlay.setAttribute('aria-hidden', 'true');
        showVerdict(message.winner?.color || 'white', message.winner?.shape, { ...message, method: 'cards' });
      });
    }
    if (message.type === 'diceStart') {
      selectedDice = new Set();
      diceCalledHand.classList.add('is-hidden');
      diceCalledHand.innerHTML = '';
      revealAfterBlack(() => renderDiceState(message));
    }
    if (message.type === 'diceUpdate') {
      selectedDice = new Set();
      renderDiceState(message);
    }
    if (message.type === 'diceResult') {
      revealAfterBlack(() => {
        diceOverlay.classList.remove('is-visible');
        diceOverlay.setAttribute('aria-hidden', 'true');
        showVerdict(message.winner?.color || 'white', message.winner?.shape, { ...message, method: 'dice' });
      });
    }
    if (message.type === 'rematchOffer') {
      verdictQuestionMark.classList.remove('is-hidden');
      verdictQuestionMark.classList.add('is-visible');
      rematchPanel.classList.remove('is-hidden');
      bestOfThreeButton.classList.add('is-hidden');
      bestOfFiveButton.classList.add('is-hidden');
      acceptRematchButton.classList.remove('is-hidden');
      declineRematchButton.classList.remove('is-hidden');
      rematchPrompt.textContent = 'A member of the Court has requested a retrial';
    }
    if (message.type === 'rematchReady') {
      nextMeetingNumber = message.meetingNumber || 2;
      currentRoomState.series = message.series || { target: message.bestOf, round: 1, wins: {}, chooserId: message.chooserId };
      verdictOverlay.classList.remove('is-visible');
      verdictOverlay.setAttribute('aria-hidden', 'true');
      rematchPanel.classList.add('is-hidden');
      roomView.classList.remove('is-hidden');
      renderRoom(currentRoomState);
    }
    if (message.type === 'seriesContinue') {
      nextMeetingNumber = message.meetingNumber || (nextMeetingNumber + 1);
      currentRoomState.series = message.series || currentRoomState.series;
      verdictOverlay.classList.remove('is-visible');
      verdictOverlay.setAttribute('aria-hidden', 'true');
      rematchPanel.classList.add('is-hidden');
      roomView.classList.remove('is-hidden');
      renderRoom(currentRoomState);
    }
    if (message.type === 'rematchDeclined') {
      rematchPanel.classList.add('is-hidden');
      verdictQuestionMark.classList.remove('is-visible');
      verdictQuestionMark.classList.add('is-hidden');
      rematchPrompt.textContent = 'Choose a rematch format.';
    }
    if (message.type === 'gameDenied') resultElement.textContent = message.message;
    if (message.type === 'result') {
      revealAfterBlack(() => {
        strawOverlay.classList.remove('is-visible');
        strawOverlay.setAttribute('aria-hidden', 'true');
        showVerdict(message.winner.color, message.winner.shape, message);
      });
    }
    if (message.type === 'error') { formMessage.textContent = message.message; formMessage.className = 'form-message is-error'; transitionOverlay.classList.remove('is-active'); backButton.classList.remove('is-fading'); }
  });
  socket.addEventListener('error', () => { formMessage.textContent = 'Could not connect to the room server. Try again.'; formMessage.className = 'form-message is-error'; });
}

function updateSetupState() {
  document.querySelectorAll('.shape-option').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.shape === socketState.shape);
    button.setAttribute('aria-pressed', button.dataset.shape === socketState.shape ? 'true' : 'false');
  });
  document.querySelectorAll('.color-option').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.color === socketState.color);
    button.setAttribute('aria-pressed', button.dataset.color === socketState.color ? 'true' : 'false');
  });
  if (socketState.color) selectedColorGlow.className = `selected-color-glow selected-color-glow--${socketState.color} is-visible`;
  else selectedColorGlow.className = 'selected-color-glow';

  if (socketState.shape && socketState.color) pageTitle.innerHTML = `<span class="header-color-symbol header-color-symbol--${socketState.color}" aria-label="${socketState.color} ${socketState.shape}">${shapeMarkup(socketState.shape)}</span>`;
}

function showFormError(message) {
  formMessage.classList.remove('is-error');
  formMessage.textContent = message;
  void formMessage.offsetWidth;
  formMessage.className = 'form-message is-error';
}

function chooseShape(shape) {
  socketState.shape = shape;
  kingShapeButton.classList.toggle('is-selected', shape === 'king');
  updateSetupState();
  colorStep.classList.remove('is-hidden');
    backButton.classList.add('is-hidden');
  stepInstruction.textContent = 'Now choose your color.';
}

document.querySelectorAll('.shape-option').forEach((button) => button.addEventListener('click', () => chooseShape(button.dataset.shape)));
kingShapeButton.addEventListener('click', () => chooseShape('king'));

document.querySelectorAll('.color-option').forEach((button) => button.addEventListener('click', () => {
  if (!socketState.shape) {
    showFormError('Choose a symbol before choosing a color.');
    stepInstruction.textContent = 'Choose a symbol first.';
    return;
  }
  fadeBetween(() => {
    socketState.color = button.dataset.color;
    updateSetupState();
    shapeStep.classList.add('is-hidden');
    colorStep.classList.add('is-hidden');
    roomStep.classList.remove('is-hidden');
    roomStep.classList.add('room-step-ready');
    pageEyebrow.classList.add('is-hidden');
    kingShapeButton.classList.add('is-hidden');
    backButton.classList.remove('is-hidden');
    stepInstruction.textContent = 'Prepare your argument.';
  });
}));

backButton.addEventListener('click', () => {
  if (!roomStep.classList.contains('is-hidden')) {
    fadeBetween(() => {
      roomStep.classList.add('is-hidden');
      roomStep.classList.remove('room-step-ready');
      shapeStep.classList.remove('is-hidden');
      colorStep.classList.remove('is-hidden');
      pageEyebrow.classList.remove('is-hidden');
      pageEyebrow.classList.remove('prepare-heading');
      pageEyebrow.textContent = 'King of Nothing Presents';
      kingShapeButton.classList.remove('is-hidden');
      kingShapeButton.classList.remove('is-selected');
      socketState.shape = null;
      socketState.color = null;
      backButton.classList.add('is-hidden');
      pageTitle.innerHTML = 'Deciding<br /><span>Judge</span>';
      selectedColorGlow.className = 'selected-color-glow';
      updateSetupState();
      clearRoomSelection();
      stepInstruction.textContent = 'Choose your symbol to start.';
    });
    return;
  }
  fadeBetween(() => {
    colorStep.classList.add('is-hidden');
    socketState.shape = null;
    socketState.color = null;
    backButton.classList.add('is-hidden');
    pageTitle.innerHTML = 'Deciding<br /><span>Judge</span>';
    stepInstruction.textContent = 'Choose one symbol and one color to begin.';
    selectedColorGlow.className = 'selected-color-glow';
    updateSetupState();
  });
});

standTrialButton.addEventListener('click', () => {
  roomList.classList.remove('is-hidden');
  standTrialButton.classList.add('is-hidden');
  stepInstruction.textContent = 'Choose a hearing.';
});

newRoomName.addEventListener('input', () => {
  const hasValue = newRoomName.value.trim().length > 0;
  newRoomName.classList.toggle('is-set', hasValue);
  createRoomButton.classList.toggle('is-hidden', !hasValue);
  standTrialButton.classList.toggle('is-hidden', !hasValue);
  selectedRoomName = '';
  document.querySelectorAll('.room-entry').forEach((entry) => entry.classList.remove('is-selected'));
});
newRoomName.addEventListener('focus', () => newRoomName.classList.add('is-focused'));
newRoomName.addEventListener('blur', () => newRoomName.classList.remove('is-focused'));

roomForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!socketState.shape || !socketState.color) {
    formMessage.textContent = 'Choose both a symbol and a color first.';
    formMessage.className = 'form-message is-error';
    return;
  }
  const roomName = newRoomName.value.trim() || selectedRoomName;
  if (!roomName) { formMessage.textContent = 'Choose an open room or create a new one.'; formMessage.className = 'form-message is-error'; return; }
  formMessage.textContent = 'Joining room...';
  formMessage.className = 'form-message';
  joinRoom(roomName);
});

judgeButton.addEventListener('click', () => fadeToGame('judge'));
strawButton.addEventListener('click', () => fadeToGame('straws'));
gestureButton.addEventListener('click', () => fadeToGame('gestureStart'));
cardsButton.addEventListener('click', () => fadeToGame('cardsStart'));
diceButton.addEventListener('click', () => fadeToGame('diceStart'));
bestOfThreeButton.addEventListener('click', () => send('rematchRequest', { bestOf: 3, mode: currentGameMode }));
bestOfFiveButton.addEventListener('click', () => send('rematchRequest', { bestOf: 5, mode: currentGameMode }));
continueSeriesButton.addEventListener('click', () => send('seriesContinue'));
acceptRematchButton.addEventListener('click', () => send('rematchResponse', { accepted: true }));
declineRematchButton.addEventListener('click', () => send('rematchResponse', { accepted: false }));
rerollDiceButton.addEventListener('click', () => {
  send('diceRoll', { indices: [...selectedDice] });
  selectedDice = new Set();
});
callDiceButton.addEventListener('click', () => {
  send('diceCall');
  selectedDice = new Set();
});
document.querySelector('#leaveButton').addEventListener('click', () => {
  socketState.socket?.close();
  fadeBetween(() => {
    loginView.classList.remove('is-hidden');
    roomView.classList.add('is-hidden');
    roomStep.classList.remove('is-hidden');
    roomList.classList.add('is-hidden');
    backButton.classList.remove('is-hidden');
    standTrialButton.classList.add('is-hidden');
    createRoomButton.classList.add('is-hidden');
    newRoomName.value = '';
    newRoomName.classList.remove('is-set', 'is-focused');
    selectedRoomName = '';
    document.querySelectorAll('.room-entry').forEach((entry) => entry.classList.remove('is-selected'));
    formMessage.textContent = '';
    resultElement.textContent = '';
    strawOverlay.classList.remove('is-visible');
    strawOverlay.setAttribute('aria-hidden', 'true');
    verdictOverlay.classList.remove('is-visible');
    verdictOverlay.setAttribute('aria-hidden', 'true');
    stepInstruction.textContent = 'Prepare your arguments.';
    connectSocket();
  });
});
connectSocket();
window.addEventListener('resize', positionBackButton);
