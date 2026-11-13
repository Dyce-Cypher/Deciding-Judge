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
const shapeStep = document.querySelector('#shapeStep');
const colorStep = document.querySelector('#colorStep');
const roomStep = document.querySelector('#roomStep');
const selectedShapeElement = document.querySelector('#selectedShape');
const loginView = document.querySelector('#loginView');
const roomView = document.querySelector('#roomView');
const playersElement = document.querySelector('#players');
const judgeButton = document.querySelector('#judgeButton');
const strawButton = document.querySelector('#strawButton');
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
const socketState = { socket: null, player: null, shape: null, color: null };
let selectedRoomName = '';
const kingIconPath = '/Element/Royal%20Rat%20Insignia.png';
const shapeGlyphs = { square: '■', diamond: '◆', spade: '♠', club: '♣', heart: '♥' };

function fadeBetween(update, reveal = true) {
  transitionOverlay.classList.add('is-active');
  window.setTimeout(() => {
    update();
    if (reveal) window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 260);
  }, 420);
}

function send(type, data = {}) { if (socketState.socket?.readyState === WebSocket.OPEN) socketState.socket.send(JSON.stringify({ type, ...data })); }
function colorClass(color) { return `player-swatch player-swatch--${color}`; }
function shapeGlyph(shape) { return shapeGlyphs[shape] || '•'; }
function shapeMarkup(shape) { return shape === 'king' ? `<img class="king-icon" src="${kingIconPath}" alt="King" />` : shapeGlyph(shape); }

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
  judgeButton.disabled = !ready;
  strawButton.disabled = !ready;
}

function showVerdict(color, shape, result) {
  verdictColorField.className = `verdict-color-field verdict-color-field--${color}`;
  verdictWinner.className = `verdict-winner--${color}`;
  verdictWinner.innerHTML = shapeMarkup(shape);
  verdictWinner.setAttribute('aria-label', `${shape} wins`);
  const isStrawLoss = result?.method === 'straws' && result.loser?.id === socketState.player;
  verdictSubtext.textContent = result?.method === 'straws'
    ? (isStrawLoss ? 'You drew the short straw. Meeting adjourned' : 'You drew the long straw. Meeting adjourned')
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
      renderRoom(message.room);
      window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 420);
    }
    if (message.type === 'room') renderRoom(message.room);
    if (message.type === 'strawStart') renderStrawDraw(message);
    if (message.type === 'strawUpdate') renderStrawDraw(message);
    if (message.type === 'result') {
      strawOverlay.classList.remove('is-visible');
      strawOverlay.setAttribute('aria-hidden', 'true');
      showVerdict(message.winner.color, message.winner.shape, message);
    }
    if (message.type === 'error') { formMessage.textContent = message.message; formMessage.className = 'form-message is-error'; transitionOverlay.classList.remove('is-active'); }
  });
  socket.addEventListener('error', () => { formMessage.textContent = 'Could not connect to the room server. Try again.'; formMessage.className = 'form-message is-error'; });
}

function chooseShape(shape) {
  fadeBetween(() => {
    socketState.shape = shape;
    const chosenShape = socketState.shape[0].toUpperCase() + socketState.shape.slice(1);
    pageEyebrow.textContent = 'You are the';
    kingShapeButton.classList.add('is-hidden');
    pageTitle.textContent = chosenShape;
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
    stepInstruction.textContent = 'Prepare your arguments.';
  });
}));

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
document.querySelector('#leaveButton').addEventListener('click', () => {
  socketState.socket?.close();
  fadeBetween(() => {
    loginView.classList.remove('is-hidden');
    roomView.classList.add('is-hidden');
    roomStep.classList.remove('is-hidden');
    roomList.classList.add('is-hidden');
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
