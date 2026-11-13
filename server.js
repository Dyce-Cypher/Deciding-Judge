const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const PUBLIC_DIRECTORY = __dirname;
const rooms = new Map();
const MIME_TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

// A room is kept in memory because this project only needs to demonstrate
// two connected browsers sharing state. A database is not needed yet.
function makeRoom(name) { return { name, hostId: null, players: new Map(), result: null, strawSession: null, gestureSession: null, cardSession: null, diceSession: null }; }
function cleanRoomName(name) { return String(name).trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 24) || null; }
function hostId(room) { return [...room.players.keys()][0] || null; }

function publicRoom(room) {
  const players = [...room.players.values()];
  return { name: room.name, hostId: room.hostId || hostId(room), players: players.map(({ id, color, shape, argument }) => ({ id, color, shape, argument })), result: room.result };
}

// The lobby only receives the information needed to show room availability.
function publicRoomDirectory() {
  return [...rooms.values()]
    .filter((room) => room.players.size < 2)
    .map((room) => ({ name: room.name, players: [...room.players.values()].map(({ color, shape }) => ({ color, shape })) }));
}

function publicStrawTallies(room, session) {
  return [...room.players.values()].map((roomPlayer) => ({ id: roomPlayer.id, color: roomPlayer.color, shape: roomPlayer.shape, count: session.tallies.get(roomPlayer.id) || 0 }));
}

function publicCardCollections(room, session) {
  return [...room.players.values()].map((roomPlayer) => ({
    id: roomPlayer.id,
    color: roomPlayer.color,
    shape: roomPlayer.shape,
    cards: session.collections.get(roomPlayer.id) || [],
    total: session.totals.get(roomPlayer.id) || 0,
  }));
}

function rollDice() { return Array.from({ length: 5 }, () => crypto.randomInt(1, 7)); }
function evaluateDiceHand(dice) {
  const counts = new Map();
  dice.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const pattern = groups.map((group) => group[1]).join('-');
  const category = pattern === '5' ? 6 : pattern === '4-1' ? 5 : pattern === '3-2' ? 4 : pattern === '3-1-1' ? 3 : pattern === '2-2-1' ? 2 : pattern === '2-1-1-1' ? 1 : 0;
  return { category, tiebreak: groups.flatMap(([value, count]) => Array(count).fill(value)) };
}
function compareDiceHands(left, right) {
  if (left.category !== right.category) return left.category - right.category;
  for (let index = 0; index < left.tiebreak.length; index += 1) if (left.tiebreak[index] !== right.tiebreak[index]) return left.tiebreak[index] - right.tiebreak[index];
  return 0;
}
function publicDiceState(room, session, playerId) {
  const hand = session.hands.get(playerId);
  const opponent = [...room.players.keys()].find((id) => id !== playerId);
  const currentPlayer = room.players.get(session.currentPlayerId);
  return { type: 'diceUpdate', dice: hand.dice, rolls: hand.rolls, called: hand.called, currentPlayerId: playerId, currentPlayerColor: room.players.get(playerId)?.color || currentPlayer?.color || 'white', opponentCalled: session.hands.get(opponent)?.called || false, opponentRolls: session.hands.get(opponent)?.rolls || 0 };
}
function sendDiceStates(room, session) { room.players.forEach((roomPlayer) => send(roomPlayer.socket, publicDiceState(room, session, roomPlayer.id))); }

function send(socket, message) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function broadcast(room, message) { room.players.forEach((player) => send(player.socket, message)); }
function broadcastRoom(room) { broadcast(room, { type: 'room', room: publicRoom(room) }); }
function broadcastRoomDirectory() { websocketServer.clients.forEach((socket) => send(socket, { type: 'roomList', rooms: publicRoomDirectory() })); }

// Render serves the same files and WebSocket server from one Web Service.
const server = http.createServer((request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const filePath = path.join(PUBLIC_DIRECTORY, requestedPath === '/' ? 'index.html' : requestedPath);
  if (!filePath.startsWith(PUBLIC_DIRECTORY) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    return response.end('Not found');
  }
  response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

const websocketServer = new WebSocket.Server({ server });
websocketServer.on('connection', (socket) => {
  const player = { id: crypto.randomUUID().slice(0, 8), socket, room: null, color: null, shape: null, argument: null };
  send(socket, { type: 'roomList', rooms: publicRoomDirectory() });

  socket.on('message', (rawMessage) => {
    let message;
    try { message = JSON.parse(rawMessage); } catch { return send(socket, { type: 'error', message: 'Invalid message.' }); }

    if (message.type === 'join') {
      const roomName = cleanRoomName(message.roomName);
      const color = ['red', 'blue', 'yellow', 'green'].includes(message.color) ? message.color : 'red';
      const shape = ['diamond', 'spade', 'club', 'heart', 'king'].includes(message.shape) ? message.shape : 'diamond';
      const argument = String(message.argument || roomName).trim().slice(0, 24) || roomName;
      if (!roomName) return send(socket, { type: 'error', message: 'Enter a room name.' });
      const room = rooms.get(roomName.toLowerCase()) || makeRoom(roomName);
      if (room.players.size >= 2) return send(socket, { type: 'error', message: 'That room already has two players.' });
      rooms.set(roomName.toLowerCase(), room);
      if (!room.hostId) room.hostId = player.id;
      player.room = room;
      player.color = color;
      player.shape = shape;
      player.argument = argument;
      room.players.set(player.id, player);
      send(socket, { type: 'joined', playerId: player.id, room: publicRoom(room) });
      broadcastRoom(room);
      return broadcastRoomDirectory();
    }

    if (['judge', 'straws', 'gestureStart'].includes(message.type) && player.room && player.room.players.size === 2 && player.id !== hostId(player.room)) {
      return send(socket, { type: 'gameDenied', message: 'Only the host can choose the game.' });
    }

    if (message.type === 'judge' && player.room && player.room.players.size === 2 && player.id === hostId(player.room)) {
      const players = [...player.room.players.values()];
      const winner = players[crypto.randomInt(players.length)];
      player.room.result = { winnerId: winner.id, color: winner.color };
      return broadcast(player.room, { type: 'result', winner: { id: winner.id, color: winner.color, shape: winner.shape } });
    }

    if (message.type === 'straws' && player.room && player.room.players.size === 2 && player.id === hostId(player.room)) {
      if (player.room.strawSession) return;
      const argumentLength = [...player.room.players.values()].reduce((total, roomPlayer) => total + roomPlayer.argument.length, 0);
      const strawCount = Math.max(3, Math.min(18, argumentLength));
      const shortIndex = crypto.randomInt(strawCount);
      const straws = Array.from({ length: strawCount }, (_, index) => ({
        id: `straw-${index}`,
        height: 330,
        short: index === shortIndex,
        angle: crypto.randomInt(-4, 5),
      }));
      const tallies = new Map([...player.room.players.values()].map((roomPlayer) => [roomPlayer.id, 0]));
      player.room.strawSession = { shortStrawId: `straw-${shortIndex}`, currentPlayerId: player.id, drawn: [], straws, tallies };
      return broadcast(player.room, { type: 'strawStart', straws, currentPlayerId: player.id, currentPlayerColor: player.color, drawn: [], tallies: publicStrawTallies(player.room, player.room.strawSession) });
    }

    if (message.type === 'drawStraw' && player.room?.strawSession) {
      const session = player.room.strawSession;
      if (session.currentPlayerId !== player.id || !session.straws.some((straw) => straw.id === message.strawId) || session.drawn.some((draw) => draw.strawId === message.strawId)) return;
      session.drawn.push({ playerId: player.id, strawId: message.strawId });
      const drewShortStraw = message.strawId === session.shortStrawId;
      if (!drewShortStraw) session.tallies.set(player.id, (session.tallies.get(player.id) || 0) + 1);
      if (drewShortStraw) {
        const players = [...player.room.players.values()];
        const loser = player;
        const winner = players
          .filter((candidate) => candidate.id !== loser.id)
          .sort((left, right) => (session.tallies.get(right.id) || 0) - (session.tallies.get(left.id) || 0))[0];
        player.room.strawSession = null;
        player.room.result = { winnerId: winner.id, loserId: loser.id, color: winner.color, method: 'straws', tallies: publicStrawTallies(player.room, session) };
        return broadcast(player.room, {
          type: 'result', method: 'straws', tallies: publicStrawTallies(player.room, session),
          winner: { id: winner.id, color: winner.color, shape: winner.shape },
          loser: { id: loser.id, color: loser.color, shape: loser.shape },
        });
      }
      if (session.drawn.length < session.straws.length) {
        const otherPlayer = [...player.room.players.values()].find((candidate) => candidate.id !== player.id);
        session.currentPlayerId = otherPlayer.id;
        return broadcast(player.room, { type: 'strawUpdate', straws: session.straws, drawn: session.drawn, currentPlayerId: session.currentPlayerId, currentPlayerColor: otherPlayer.color, tallies: publicStrawTallies(player.room, session) });
      }
      const loserDraw = session.drawn.find((draw) => draw.strawId === session.shortStrawId) || session.drawn[0];
      const loser = player.room.players.get(loserDraw.playerId);
      const winner = [...player.room.players.values()].find((candidate) => candidate.id !== loser.id);
      player.room.strawSession = null;
      player.room.result = { winnerId: winner.id, loserId: loser.id, color: winner.color, method: 'straws' };
      return broadcast(player.room, {
        type: 'result',
        method: 'straws',
        winner: { id: winner.id, color: winner.color, shape: winner.shape },
        loser: { id: loser.id, color: loser.color, shape: loser.shape },
      });
    }

    if (message.type === 'gestureStart' && player.room && player.room.players.size === 2 && player.id === hostId(player.room)) {
      if (player.room.gestureSession) return;
      player.room.gestureSession = { choices: new Map() };
      return broadcast(player.room, { type: 'gestureStart', selectedPlayerIds: [] });
    }

    if (message.type === 'gestureChoice' && player.room?.gestureSession) {
      const session = player.room.gestureSession;
      const choice = ['rock', 'paper', 'scissors'].includes(message.choice) ? message.choice : null;
      if (!choice || session.choices.has(player.id)) return;
      session.choices.set(player.id, choice);
      const selectedPlayerIds = [...session.choices.keys()];
      if (session.choices.size < player.room.players.size) {
        return broadcast(player.room, { type: 'gestureUpdate', selectedPlayerIds });
      }

      const players = [...player.room.players.values()];
      const [first, second] = players;
      const firstChoice = session.choices.get(first.id);
      const secondChoice = session.choices.get(second.id);
      const winningChoices = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const winner = firstChoice === secondChoice
        ? null
        : (winningChoices[firstChoice] === secondChoice ? first : second);
      const gestureResult = {
        type: 'gestureResult',
        choices: { [first.id]: firstChoice, [second.id]: secondChoice },
        winner: winner ? { id: winner.id, color: winner.color, shape: winner.shape } : null,
      };
      player.room.gestureSession = winner ? null : { choices: new Map() };
      player.room.result = winner ? { winnerId: winner.id, color: winner.color, method: 'gesture' } : null;
      return broadcast(player.room, gestureResult);
    }

    if (message.type === 'cardsStart' && player.room && player.room.players.size === 2 && player.id === hostId(player.room)) {
      if (player.room.cardSession) return;
      const suits = [
        { name: 'spades', offset: 0 },
        { name: 'hearts', offset: 0x10 },
        { name: 'diamonds', offset: 0x20 },
        { name: 'clubs', offset: 0x30 },
      ];
      const cards = suits.flatMap((suit) => Array.from({ length: 13 }, (_, index) => {
        const rank = index + 1;
        return { id: `${suit.name}-${rank}`, suit: suit.name, rank, value: rank === 1 ? 1 : Math.min(rank, 10) };
      }));
      for (let index = cards.length - 1; index > 0; index -= 1) {
        const swapIndex = crypto.randomInt(index + 1);
        [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
      }
      player.room.cardSession = {
        cards,
        currentPlayerId: hostId(player.room),
        picked: [],
        collections: new Map([...player.room.players.keys()].map((id) => [id, []])),
        totals: new Map([...player.room.players.keys()].map((id) => [id, 0])),
      };
      return broadcast(player.room, { type: 'cardsStart', cards, currentPlayerId: hostId(player.room), currentPlayerColor: player.color, collections: publicCardCollections(player.room, player.room.cardSession) });
    }

    if (message.type === 'cardPick' && player.room?.cardSession) {
      const session = player.room.cardSession;
      const card = session.cards.find((candidate) => candidate.id === message.cardId);
      if (session.currentPlayerId !== player.id || !card || session.picked.includes(card.id)) return;
      session.picked.push(card.id);
      session.collections.get(player.id).push(card);
      session.totals.set(player.id, (session.totals.get(player.id) || 0) + card.value);
      const collections = publicCardCollections(player.room, session);
      if (session.picked.length === session.cards.length) {
        const players = [...player.room.players.values()];
        const firstTotal = session.totals.get(players[0].id) || 0;
        const secondTotal = session.totals.get(players[1].id) || 0;
        const winner = firstTotal === secondTotal ? null : (firstTotal > secondTotal ? players[0] : players[1]);
        player.room.cardSession = null;
        player.room.result = winner ? { winnerId: winner.id, color: winner.color, method: 'cards', collections } : null;
        return broadcast(player.room, { type: 'cardResult', method: 'cards', collections, winner: winner ? { id: winner.id, color: winner.color, shape: winner.shape } : null });
      }
      const otherPlayer = [...player.room.players.values()].find((candidate) => candidate.id !== player.id);
      session.currentPlayerId = otherPlayer.id;
      return broadcast(player.room, { type: 'cardUpdate', cards: session.cards, picked: session.picked, currentPlayerId: session.currentPlayerId, currentPlayerColor: otherPlayer.color, collections });
    }

    if (message.type === 'diceStart' && player.room && player.room.players.size === 2 && player.id === hostId(player.room)) {
      if (player.room.diceSession) return;
      const players = [...player.room.players.values()];
      player.room.diceSession = {
        currentPlayerId: hostId(player.room),
        hands: new Map(players.map((roomPlayer) => [roomPlayer.id, { dice: rollDice(), rolls: 0, called: false }])),
      };
      player.room.players.forEach((roomPlayer) => send(roomPlayer.socket, { ...publicDiceState(player.room, player.room.diceSession, roomPlayer.id), type: 'diceStart' }));
      return;
    }

    if (message.type === 'diceRoll' && player.room?.diceSession) {
      const session = player.room.diceSession;
      const hand = session.hands.get(player.id);
      if (hand.called || hand.rolls >= 3) return;
      const selected = Array.isArray(message.indices) ? [...new Set(message.indices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < 5))] : [];
      if (selected.length > 5) return;
      selected.forEach((index) => { hand.dice[index] = crypto.randomInt(1, 7); });
      hand.rolls += 1;
      if (hand.rolls >= 3) hand.called = true;
      const otherPlayer = [...player.room.players.values()].find((candidate) => candidate.id !== player.id);
      if (hand.called && otherPlayer && session.hands.get(otherPlayer.id).called) {
        const players = [...player.room.players.values()];
        const evaluations = players.map((roomPlayer) => ({ id: roomPlayer.id, hand: evaluateDiceHand(session.hands.get(roomPlayer.id).dice) }));
        const comparison = compareDiceHands(evaluations[0].hand, evaluations[1].hand);
        const winner = comparison === 0 ? null : (comparison > 0 ? players[0] : players[1]);
        const diceResult = { type: 'diceResult', hands: players.map((roomPlayer) => ({ id: roomPlayer.id, dice: session.hands.get(roomPlayer.id).dice, category: evaluateDiceHand(session.hands.get(roomPlayer.id).dice).category })), winner: winner ? { id: winner.id, color: winner.color, shape: winner.shape } : null };
        player.room.diceSession = null;
        player.room.result = winner ? { winnerId: winner.id, color: winner.color, method: 'dice' } : null;
        return broadcast(player.room, diceResult);
      }
      sendDiceStates(player.room, session);
      return;
    }

    if (message.type === 'diceCall' && player.room?.diceSession) {
      const session = player.room.diceSession;
      const hand = session.hands.get(player.id);
      if (hand.called) return;
      hand.called = true;
      const otherPlayer = [...player.room.players.values()].find((candidate) => candidate.id !== player.id);
      if (!otherPlayer || session.hands.get(otherPlayer.id).called) {
        const players = [...player.room.players.values()];
        const evaluations = players.map((roomPlayer) => ({ id: roomPlayer.id, hand: evaluateDiceHand(session.hands.get(roomPlayer.id).dice) }));
        const comparison = compareDiceHands(evaluations[0].hand, evaluations[1].hand);
        const winner = comparison === 0 ? null : (comparison > 0 ? players[0] : players[1]);
        const diceResult = { type: 'diceResult', hands: players.map((roomPlayer) => ({ id: roomPlayer.id, dice: session.hands.get(roomPlayer.id).dice, category: evaluateDiceHand(session.hands.get(roomPlayer.id).dice).category })), winner: winner ? { id: winner.id, color: winner.color, shape: winner.shape } : null };
        player.room.diceSession = null;
        player.room.result = winner ? { winnerId: winner.id, color: winner.color, method: 'dice' } : null;
        return broadcast(player.room, diceResult);
      }
      return sendDiceStates(player.room, session);
    }
  });

  socket.on('close', () => {
    if (!player.room) return;
    player.room.strawSession = null;
    player.room.gestureSession = null;
    player.room.cardSession = null;
    player.room.diceSession = null;
    player.room.players.delete(player.id);
    if (player.room.hostId === player.id) player.room.hostId = [...player.room.players.keys()][0] || null;
    if (player.room.players.size === 0) rooms.delete(player.room.name.toLowerCase());
    else broadcastRoom(player.room);
    broadcastRoomDirectory();
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Deciding Judge listening on port ${PORT}`));
