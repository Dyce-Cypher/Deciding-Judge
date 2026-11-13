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
const selectedShapeElement = document.querySelector('#selectedShape');
const loginView = document.querySelector('#loginView');
const roomView = document.querySelector('#roomView');
const roomCombinedGlow = document.querySelector('#roomCombinedGlow');
const playersElement = document.querySelector('#players');
const judgeButton = document.querySelector('#judgeButton');
const strawButton = document.querySelector('#strawButton');
const gestureButton = document.querySelector('#gestureButton');
const cardsButton = document.querySelector('#cardsButton');
const resultElement = document.querySelector('#result');
const verdictOverlay = document.querySelector('#verdictOverlay');
const verdictColorField = document.querySelector('#verdictColorField');
const verdictWinner = document.querySelector('#verdictWinner');
const verdictSubtext = document.querySelector('#verdictSubtext');
const transitionOverlay = document.querySelector('#transitionOverlay');
const selectedColorGlow = document.querySelector('#selectedColorGlow');
const strawOverlay = document.querySelector('#strawOverlay');
const strawInstruction = document.querySelector('#strawInstruction');
const strawChoices = document.querySelector('#strawChoices');
const strawTallies = document.querySelector('#strawTallies');
const gestureOverlay = document.querySelector('#gestureOverlay');
const gestureInstruction = document.querySelector('#gestureInstruction');
const gestureChoices = document.querySelector('#gestureChoices');
const gestureReveal = document.querySelector('#gestureReveal');
const cardsOverlay = document.querySelector('#cardsOverlay');
const cardsTurnGlow = document.querySelector('#cardsTurnGlow');
const cardsInstruction = document.querySelector('#cardsInstruction');
const cardCollections = document.querySelector('#cardCollections');
const cardDeck = document.querySelector('#cardDeck');
const socketState = { socket: null, player: null, hostId: null, shape: null, color: null };
let selectedRoomName = '';
let renderedCardCount = 0;
const kingIconPath = '/Element/Royal%20Rat%20Insignia.png';
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
function colorClass(color) { return `player-swatch player-swatch--${color}`; }
function shapeGlyph(shape) { return shapeGlyphs[shape] || '•'; }
function shapeMarkup(shape) { return shape === 'king' ? `<img class="king-icon" src="${kingIconPath}" alt="King" />` : shapeGlyph(shape); }
const gestureAssets = { rock: '/Element/Rock.png', paper: '/Element/Paper.png', scissors: '/Element/Scissors.png' };
const cardSuitBases = { spades: 0x1f0a1, hearts: 0x1f0b1, diamonds: 0x1f0c1, clubs: 0x1f0d1 };
const cardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function gestureMarkup(gesture) { return `<img src="${gestureAssets[gesture]}" alt="${gesture}" />`; }
function cardSymbol(card) {
  const rankOffset = card.rank === 1 ? 0 : card.rank <= 10 ? card.rank - 1 : card.rank === 11 ? 10 : card.rank === 12 ? 12 : 13;
  return String.fromCodePoint(cardSuitBases[card.suit] + rankOffset);
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
  cardsInstruction.textContent = message.currentPlayerId === socketState.player ? 'Your turn. Pick one card.' : 'Waiting for the other player.';
  renderCardCollections(message.collections || []);
  cardDeck.innerHTML = '';
  (message.cards || []).forEach((card) => {
    const cardButton = document.createElement('button');
    cardButton.className = `card-pick${picked.has(card.id) ? ' is-picked' : ''}`;
    cardButton.type = 'button';
    cardButton.textContent = picked.has(card.id) ? '' : '\u{1F0A0}';
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
  const activeStep = [shapeStep, colorStep, roomStep].find((step) => !step.classList.contains('is-hidden'));
  if (!activeStep) return;
  const selectionBox = activeStep === roomStep
    ? roomStep.querySelector('.room-variable')
    : [...activeStep.querySelectorAll('.shape-options, .color-options')]
      .find((element) => !element.classList.contains('is-hidden'));
  const bounds = (selectionBox || activeStep).getBoundingClientRect();
  const arrowGap = 18;
  backButton.style.left = `${Math.max(12, bounds.left - backButton.offsetWidth - arrowGap)}px`;
  backButton.style.top = `${bounds.top + (bounds.height / 2) - 10}px`;
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
  // The first player in the room is the creator and remains the host.
  // Derive this from the ordered player list so older room messages cannot disable the host controls.
  socketState.hostId = room.players[0]?.id || null;
  const argumentsInRoom = room.players.map((player) => player.argument || room.name);
  document.querySelector('#roomHeadingName').textContent = argumentsInRoom.length > 1 ? `${argumentsInRoom[0]} or ${argumentsInRoom[1]}` : argumentsInRoom[0];
  playersElement.innerHTML = '';
  const duelElement = document.createElement('div');
  duelElement.className = 'player-duel';
  room.players.slice(0, 2).forEach((player, index) => {
    const token = document.createElement('span');
    token.className = `player-token player-token--${player.color}`;
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
    const roomColors = room.players.map((player) => player.color);
    roomCombinedGlow.style.background = `linear-gradient(135deg, var(--${roomColors[0]}), var(--${roomColors[1]}))`;
    roomCombinedGlow.classList.add('is-visible');
  } else {
    roomCombinedGlow.classList.remove('is-visible');
  }
  const isHost = socketState.player === socketState.hostId;
  judgeButton.disabled = !ready || !isHost;
  strawButton.disabled = !ready || !isHost;
  gestureButton.disabled = !ready || !isHost;
  cardsButton.disabled = !ready || !isHost;
  [judgeButton, strawButton, gestureButton, cardsButton].forEach((button) => {
    button.title = isHost ? '' : 'Only the host can choose the game.';
  });
}

function renderGestureChoices(selectedPlayerIds = []) {
  const alreadySelected = selectedPlayerIds.includes(socketState.player);
  gestureChoices.innerHTML = '';
  ['rock', 'paper', 'scissors'].forEach((gesture) => {
    const choiceButton = document.createElement('button');
    choiceButton.className = 'gesture-choice';
    choiceButton.type = 'button';
    choiceButton.disabled = alreadySelected;
    choiceButton.setAttribute('aria-label', `Choose ${gesture}`);
    choiceButton.innerHTML = `${gestureMarkup(gesture)}<span>${gesture}</span>`;
    choiceButton.addEventListener('click', () => {
      gestureChoices.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      gestureInstruction.textContent = 'Waiting for the other player.';
      send('gestureChoice', { choice: gesture });
    });
    gestureChoices.appendChild(choiceButton);
  });
}

function renderGestureStart(message) {
  gestureReveal.innerHTML = '';
  gestureInstruction.textContent = 'Choose rock, paper, or scissors.';
  renderGestureChoices(message.selectedPlayerIds || []);
  gestureOverlay.setAttribute('aria-hidden', 'false');
  gestureOverlay.classList.add('is-visible');
}

function showGestureResult(message) {
  gestureChoices.innerHTML = '';
  const players = [...document.querySelectorAll('.player-token')].filter((token) => !token.classList.contains('player-token--empty'));
  const roomPlayers = players.map((token) => token.getAttribute('aria-label') || 'Player');
  const choiceCards = Object.entries(message.choices).map(([playerId, gesture], index) => {
    const winnerClass = message.winner?.id === playerId ? ' is-winner' : '';
    return `<div class="gesture-result-card${winnerClass}"><span>${roomPlayers[index] || 'Player'}</span>${gestureMarkup(gesture)}<strong>${gesture}</strong></div>`;
  }).join('<span class="gesture-versus">V</span>');
  gestureReveal.innerHTML = choiceCards;
  gestureInstruction.textContent = message.winner ? 'The gesture has spoken.' : 'A draw. Choose again.';
  gestureOverlay.classList.add('is-visible');
  gestureOverlay.setAttribute('aria-hidden', 'false');
  if (!message.winner) window.setTimeout(() => renderGestureChoices([]), 800);
}

function showVerdict(color, shape, result) {
  verdictColorField.className = `verdict-color-field verdict-color-field--${color}`;
  verdictWinner.className = `verdict-winner--${color}`;
  verdictWinner.innerHTML = shape ? shapeMarkup(shape) : 'Draw';
  verdictWinner.setAttribute('aria-label', `${shape} wins`);
  const isStrawLoss = result?.method === 'straws' && result.loser?.id === socketState.player;
  const winnerTotal = result?.collections?.find((collection) => collection.id === result.winner?.id)?.total;
  verdictSubtext.textContent = result?.method === 'cards'
    ? (result.winner ? `Ruling in favor of the ${shape}. ${winnerTotal} points. Meeting adjourned` : 'The cards are tied. Meeting adjourned')
    : result?.method === 'straws'
    ? (isStrawLoss ? 'You drew the short straw. Meeting adjourned' : 'Opponent came short. Meeting adjourned')
    : `Ruling in favor of the ${shape}. Meeting adjourned`;
  verdictOverlay.setAttribute('aria-hidden', 'false');
  verdictOverlay.classList.add('is-visible');
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
    if (drawn) return;
    const strawButton = document.createElement('button');
    strawButton.className = `straw-choice${strawData.short ? ' is-short' : ''}${drawn ? ' is-drawn' : ''}`;
    strawButton.type = 'button';
    strawButton.style.setProperty('--straw-height', `${strawData.height}px`);
    strawButton.style.setProperty('--straw-tilt', `${strawData.angle || 0}deg`);
    strawButton.disabled = drawn || !myTurn;
    strawButton.setAttribute('aria-label', drawn ? 'Straw already drawn' : 'Draw this straw');
    strawButton.innerHTML = `<img src="${strawData.short ? '/Element/match_stick_short.png' : '/Element/match_stick.png'}" alt="" />`;
    if (!drawn && myTurn) strawButton.addEventListener('click', () => {
      strawButton.disabled = true;
      strawButton.classList.add('is-flying');
      window.setTimeout(() => send('drawStraw', { strawId: strawData.id }), 620);
    });
    strawChoices.appendChild(strawButton);
  });
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
      backButton.classList.remove('is-fading');
      renderRoom(message.room);
      window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 420);
    }
    if (message.type === 'room') renderRoom(message.room);
    if (message.type === 'strawStart') renderStrawDraw(message);
    if (message.type === 'strawUpdate') renderStrawDraw(message);
    if (message.type === 'gestureStart') renderGestureStart(message);
    if (message.type === 'gestureUpdate') {
      gestureInstruction.textContent = 'Waiting for the other player.';
    }
    if (message.type === 'gestureResult') showGestureResult(message);
    if (message.type === 'cardsStart' || message.type === 'cardUpdate') renderCardGame(message);
    if (message.type === 'cardResult') {
      renderCardCollections(message.collections);
      cardsOverlay.classList.remove('is-visible');
      cardsOverlay.setAttribute('aria-hidden', 'true');
      showVerdict(message.winner?.color || 'white', message.winner?.shape, { ...message, method: 'cards' });
    }
    if (message.type === 'gameDenied') resultElement.textContent = message.message;
    if (message.type === 'result') {
      strawOverlay.classList.remove('is-visible');
      strawOverlay.setAttribute('aria-hidden', 'true');
      showVerdict(message.winner.color, message.winner.shape, message);
    }
    if (message.type === 'error') { formMessage.textContent = message.message; formMessage.className = 'form-message is-error'; transitionOverlay.classList.remove('is-active'); backButton.classList.remove('is-fading'); }
  });
  socket.addEventListener('error', () => { formMessage.textContent = 'Could not connect to the room server. Try again.'; formMessage.className = 'form-message is-error'; });
}

function chooseShape(shape) {
  fadeBetween(() => {
    socketState.shape = shape;
    const chosenShape = socketState.shape[0].toUpperCase() + socketState.shape.slice(1);
    pageEyebrow.textContent = 'You are the';
    kingShapeButton.classList.add('is-hidden');
    backButton.classList.remove('is-hidden');
    pageTitle.innerHTML = shapeMarkup(socketState.shape);
    selectedShapeElement.innerHTML = shapeMarkup(socketState.shape);
    selectedShapeElement.setAttribute('aria-label', `${socketState.shape} selected`);
    shapeStep.classList.add('is-hidden');
    colorStep.classList.remove('is-hidden');
    stepInstruction.textContent = 'Now choose your color.';
  });
}

document.querySelectorAll('.shape-option').forEach((button) => button.addEventListener('click', () => chooseShape(button.dataset.shape)));
kingShapeButton.addEventListener('click', () => chooseShape('king'));

document.querySelectorAll('.color-option').forEach((button) => button.addEventListener('click', () => {
  fadeBetween(() => {
    socketState.color = button.dataset.color;
    selectedColorGlow.className = `selected-color-glow selected-color-glow--${socketState.color} is-visible`;
    pageTitle.innerHTML = `<span class="header-color-symbol header-color-symbol--${socketState.color}" aria-label="${socketState.color} ${socketState.shape}">${shapeMarkup(socketState.shape)}</span>`;
    colorStep.classList.add('is-hidden');
    roomStep.classList.remove('is-hidden');
    stepInstruction.textContent = 'Prepare your argument.';
  });
}));

backButton.addEventListener('click', () => {
  if (!roomStep.classList.contains('is-hidden')) {
    fadeBetween(() => {
      roomStep.classList.add('is-hidden');
      colorStep.classList.remove('is-hidden');
      clearRoomSelection();
      selectedColorGlow.className = 'selected-color-glow';
      pageTitle.textContent = socketState.shape[0].toUpperCase() + socketState.shape.slice(1);
      stepInstruction.textContent = 'Now choose your color.';
    });
    return;
  }
  fadeBetween(() => {
    colorStep.classList.add('is-hidden');
    shapeStep.classList.remove('is-hidden');
    socketState.shape = null;
    socketState.color = null;
    selectedShapeElement.innerHTML = '';
    kingShapeButton.classList.remove('is-hidden');
    backButton.classList.add('is-hidden');
    pageEyebrow.textContent = 'King of Nothing Presents';
    pageTitle.innerHTML = 'Deciding<br /><span>Judge</span>';
    stepInstruction.textContent = 'Choose a shape to begin.';
    selectedColorGlow.className = 'selected-color-glow';
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
  const roomName = newRoomName.value.trim() || selectedRoomName;
  if (!roomName) { formMessage.textContent = 'Choose an open room or create a new one.'; formMessage.className = 'form-message is-error'; return; }
  formMessage.textContent = 'Joining room...';
  formMessage.className = 'form-message';
  joinRoom(roomName);
});

judgeButton.addEventListener('click', () => send('judge'));
strawButton.addEventListener('click', () => send('straws'));
gestureButton.addEventListener('click', () => send('gestureStart'));
cardsButton.addEventListener('click', () => send('cardsStart'));
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
