const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 10000;
const PUBLIC_DIRECTORY = __dirname;
const rooms = new Map();
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };

// A room is kept in memory because this project only needs to demonstrate
// two connected browsers sharing state. A database is not needed yet.
function makeRoom(name) { return { name, players: new Map(), result: null, lastWinnerId: null, series: null, gestureSeries: null, directionSession: null, strawSession: null, pendingRematch: null, gestureSession: null, cardSession: null, diceSession: null }; }
function cleanRoomName(name) { return String(name).trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 24) || null; }

function publicRoom(room) {
  return { name: room.name, players: [...room.players.values()].map(({ id, color, shape, argument }) => ({ id, color, shape, argument })), result: room.result, series: room.series || null };
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

function send(socket, message) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function broadcast(room, message) { room.players.forEach((player) => send(player.socket, message)); }
function broadcastRoom(room) { broadcast(room, { type: 'room', room: publicRoom(room) }); }
function broadcastRoomDirectory() { websocketServer.clients.forEach((socket) => send(socket, { type: 'roomList', rooms: publicRoomDirectory() })); }
function roomPlayers(room) { return [...room.players.values()]; }
function playerSummary(player) { return { id: player.id, color: player.color, shape: player.shape }; }
function shuffleCards(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}
function updateRoomSeries(room, winnerId) {
  if (!winnerId) return room.series;
  room.lastWinnerId = winnerId;
  if (!room.series) return null;
  room.series.wins[winnerId] = (room.series.wins[winnerId] || 0) + 1;
  room.series.lastWinnerId = winnerId;
  room.series.complete = room.series.wins[winnerId] >= 2;
  return { ...room.series, wins: { ...room.series.wins } };
}
function diceHandName(dice) {
  const counts = Object.values(dice.reduce((groups, value) => { groups[value] = (groups[value] || 0) + 1; return groups; }, {})).sort((a, b) => b - a);
  const unique = [...new Set(dice)].sort((a, b) => a - b).join('');
  if (counts[0] === 5) return 'five of a kind';
  if (counts[0] === 4) return 'four of a kind';
  if (counts[0] === 3 && counts[1] === 2) return 'a full house';
  if (unique === '12345' || unique === '23456') return 'a straight';
  if (counts[0] === 3) return 'three of a kind';
  if (counts[0] === 2 && counts[1] === 2) return 'two pair';
  if (counts[0] === 2) return 'a pair';
  return 'high dice';
}
function publicCollections(room, session) { return roomPlayers(room).map((player) => ({ id: player.id, cards: session.collections[player.id] || [], total: (session.collections[player.id] || []).reduce((sum, card) => sum + card.rank, 0) })); }

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
      player.room = room;
      player.color = color;
      player.shape = shape;
      player.argument = argument;
      room.players.set(player.id, player);
      send(socket, { type: 'joined', playerId: player.id, room: publicRoom(room) });
      broadcastRoom(room);
      return broadcastRoomDirectory();
    }

    if (message.type === 'rematchRequest' && player.room) {
      const opponent = [...player.room.players.values()].find((candidate) => candidate.id !== player.id);
      if (!opponent) return;
      const bestOf = Number(message.bestOf) === 5 ? 5 : 3;
      player.room.pendingRematch = { requesterId: player.id, bestOf, mode: message.mode || 'judge' };
      return send(opponent.socket, { type: 'rematchOffer', bestOf });
    }

    if (message.type === 'rematchResponse' && player.room?.pendingRematch) {
      const pending = player.room.pendingRematch;
      if (pending.requesterId === player.id) return;
      const requester = player.room.players.get(pending.requesterId);
      player.room.pendingRematch = null;
      if (!requester) return;
      if (!message.accepted) return broadcast(player.room, { type: 'rematchDeclined' });
      const startingWins = Object.fromEntries(roomPlayers(player.room).map((roomPlayer) => [roomPlayer.id, roomPlayer.id === player.room.lastWinnerId ? 1 : 0]));
      player.room.series = { target: pending.bestOf, mode: pending.mode, wins: startingWins, chooserId: pending.requesterId, lastWinnerId: player.room.lastWinnerId, meetingNumber: 2, complete: false };
      player.room.gestureSeries = null;
      return broadcast(player.room, { type: 'rematchReady', bestOf: pending.bestOf, meetingNumber: 2, chooserId: pending.requesterId, series: player.room.series });
    }

    if (message.type === 'seriesContinue' && player.room?.series && player.room.series.lastWinnerId === player.id && !player.room.series.complete) {
      player.room.series.meetingNumber = (player.room.series.meetingNumber || 1) + 1;
      return broadcast(player.room, { type: 'seriesContinue', meetingNumber: player.room.series.meetingNumber, series: { ...player.room.series, wins: { ...player.room.series.wins } } });
    }

    if (message.type === 'gestureStart' && player.room && player.room.players.size === 2) {
      const gestureSeries = player.room.gestureSeries || { target: 3, round: 1, wins: Object.fromEntries(roomPlayers(player.room).map((roomPlayer) => [roomPlayer.id, 0])) };
      player.room.gestureSeries = gestureSeries;
      player.room.gestureSession = { choices: {}, round: gestureSeries?.round || 1 };
      return broadcast(player.room, { type: 'gestureStart', selectedPlayerIds: [], choices: {}, players: roomPlayers(player.room).map(playerSummary), gestureSeries, roomSeries: player.room.series });
    }

    if (message.type === 'gestureChoice' && player.room?.gestureSession) {
      const choices = player.room.gestureSession.choices;
      if (!['rock', 'paper', 'scissors'].includes(message.choice) || choices[player.id]) return;
      choices[player.id] = message.choice;
      const selectedPlayerIds = Object.keys(choices);
      if (selectedPlayerIds.length < 2) return broadcast(player.room, { type: 'gestureUpdate', selectedPlayerIds, choices, players: roomPlayers(player.room).map(playerSummary) });
      const players = roomPlayers(player.room);
      const [first, second] = players;
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const winnerId = choices[first.id] === choices[second.id] ? null : (beats[choices[first.id]] === choices[second.id] ? first.id : second.id);
      const gestureSeries = player.room.gestureSeries;
      let complete = true;
      let gestureSnapshot = null;
      let roomSnapshot = player.room.series;
      if (gestureSeries && winnerId) {
        player.room.directionSession = { winnerId, loserId: players.find((candidate) => candidate.id !== winnerId).id, selections: {} };
        complete = false;
        gestureSnapshot = { ...gestureSeries, wins: { ...gestureSeries.wins } };
      } else if (gestureSeries) {
        complete = false;
        gestureSeries.round += 1;
        gestureSnapshot = { ...gestureSeries, wins: { ...gestureSeries.wins } };
      }
      const loserId = winnerId ? players.find((candidate) => candidate.id !== winnerId).id : null;
      player.room.gestureSession = !complete && !winnerId ? { choices: {}, round: gestureSeries?.round || 1 } : null;
      return broadcast(player.room, { type: 'gestureResult', choices, players: players.map(playerSummary), winner: winnerId ? playerSummary(player.room.players.get(winnerId)) : null, loser: loserId ? playerSummary(player.room.players.get(loserId)) : null, gestureSeries: gestureSnapshot, roomSeries: roomSnapshot, complete, awaitDirection: Boolean(winnerId) });
    }

    if (message.type === 'directionChoice' && player.room?.directionSession) {
      const session = player.room.directionSession;
      if (!['up', 'down', 'left', 'right'].includes(message.direction) || session.selections[player.id]) return;
      session.selections[player.id] = message.direction;
      const selectedPlayerIds = Object.keys(session.selections);
      if (selectedPlayerIds.length < 2) return broadcast(player.room, { type: 'directionUpdate', selectedPlayerIds });
      const correct = session.selections[session.winnerId] === session.selections[session.loserId];
      const gestureSeries = player.room.gestureSeries;
      let complete = false;
      let roomSnapshot = player.room.series;
      if (correct && gestureSeries) {
        gestureSeries.wins[session.winnerId] = (gestureSeries.wins[session.winnerId] || 0) + 1;
        complete = gestureSeries.wins[session.winnerId] >= 2;
        if (complete) {
          player.room.gestureSeries = null;
          roomSnapshot = updateRoomSeries(player.room, session.winnerId);
        }
      }
      if (!complete && gestureSeries) {
        gestureSeries.round += 1;
        player.room.gestureSession = { choices: {}, round: gestureSeries.round };
      }
      const gestureSnapshot = gestureSeries && !complete ? { ...gestureSeries, wins: { ...gestureSeries.wins } } : null;
      const winner = player.room.players.get(session.winnerId);
      const loser = player.room.players.get(session.loserId);
      player.room.directionSession = null;
      return broadcast(player.room, { type: 'directionResult', selections: session.selections, players: [playerSummary(winner), playerSummary(loser)], winner: playerSummary(winner), loser: playerSummary(loser), correct, gestureSeries: gestureSnapshot, roomSeries: roomSnapshot, complete });
    }

    if (message.type === 'cardsStart' && player.room && player.room.players.size === 2) {
      const cards = [];
      for (const suit of ['spades', 'hearts', 'diamonds', 'clubs']) for (let rank = 1; rank <= 13; rank += 1) cards.push({ id: `${suit}-${rank}`, suit, rank });
      shuffleCards(cards);
      player.room.cardSession = { cards, picked: [], currentPlayerId: player.id, collections: Object.fromEntries(roomPlayers(player.room).map((roomPlayer) => [roomPlayer.id, []])) };
      const session = player.room.cardSession;
      return broadcast(player.room, { type: 'cardsStart', cards: session.cards, picked: [], collections: publicCollections(player.room, session), currentPlayerId: session.currentPlayerId, currentPlayerColor: player.color });
    }

    if (message.type === 'cardPick' && player.room?.cardSession) {
      const session = player.room.cardSession;
      if (session.currentPlayerId !== player.id || session.picked.length >= session.cards.length) return;
      const card = session.cards.find((candidate) => candidate.id === message.cardId && !session.picked.includes(candidate.id));
      if (!card) return;
      session.picked.push(card.id);
      session.collections[player.id].push(card);
      const players = roomPlayers(player.room);
      if (session.picked.length === session.cards.length) {
        const totals = players.map((roomPlayer) => ({ player: roomPlayer, total: (session.collections[roomPlayer.id] || []).reduce((sum, card) => sum + card.rank, 0) }));
        const winner = totals[0].total === totals[1].total ? null : (totals[0].total > totals[1].total ? totals[0].player : totals[1].player);
        const loser = winner ? (winner.id === players[0].id ? players[1] : players[0]) : null;
        const roomSeries = updateRoomSeries(player.room, winner?.id);
        player.room.cardSession = null;
        return broadcast(player.room, { type: 'cardResult', picked: session.picked, collections: publicCollections(player.room, session), winner: winner ? playerSummary(winner) : null, loser: loser ? playerSummary(loser) : null, series: roomSeries });
      }
      session.currentPlayerId = players.find((candidate) => candidate.id !== player.id).id;
      return broadcast(player.room, { type: 'cardUpdate', cards: session.cards, picked: session.picked, collections: publicCollections(player.room, session), currentPlayerId: session.currentPlayerId, currentPlayerColor: player.room.players.get(session.currentPlayerId).color });
    }

    if (message.type === 'diceStart' && player.room && player.room.players.size === 2) {
      const players = roomPlayers(player.room);
      const hands = Object.fromEntries(players.map((roomPlayer) => [roomPlayer.id, Array.from({ length: 5 }, () => crypto.randomInt(1, 7))]));
      player.room.diceSession = { hands, currentPlayerId: player.id, calledBy: null, rerolls: Object.fromEntries(players.map((roomPlayer) => [roomPlayer.id, 2])) };
      return broadcast(player.room, { type: 'diceStart', dice: hands[player.id], currentPlayerId: player.id, currentPlayerColor: player.color, rerollsRemaining: 2 });
    }

    if (message.type === 'diceRoll' && player.room?.diceSession) {
      const session = player.room.diceSession;
      if (session.currentPlayerId !== player.id || session.rerolls[player.id] <= 0) return;
      const indices = Array.isArray(message.indices) ? message.indices : [];
      indices.forEach((index) => { if (Number.isInteger(index) && index >= 0 && index < 5) session.hands[player.id][index] = crypto.randomInt(1, 7); });
      session.rerolls[player.id] -= 1;
      return broadcast(player.room, { type: 'diceUpdate', dice: session.hands[player.id], currentPlayerId: player.id, currentPlayerColor: player.color, rerollsRemaining: session.rerolls[player.id], rerolledIndices: indices });
    }

    if (message.type === 'diceCall' && player.room?.diceSession) {
      const session = player.room.diceSession;
      if (session.currentPlayerId !== player.id) return;
      const players = roomPlayers(player.room);
      if (!session.calledBy) {
        session.calledBy = player.id;
        session.rerolls[player.id] = 0;
        session.currentPlayerId = players.find((candidate) => candidate.id !== player.id).id;
        const nextPlayer = player.room.players.get(session.currentPlayerId);
        return broadcast(player.room, { type: 'diceUpdate', dice: session.hands[nextPlayer.id], currentPlayerId: nextPlayer.id, currentPlayerColor: nextPlayer.color, rerollsRemaining: session.rerolls[nextPlayer.id], rerolledIndices: [], calledDice: session.hands[player.id], calledPlayerId: player.id });
      }
      const opponent = players.find((candidate) => candidate.id !== player.id);
      const score = (session.hands[player.id] || []).reduce((sum, value) => sum + value, 0);
      const opponentScore = (session.hands[opponent.id] || []).reduce((sum, value) => sum + value, 0);
      const winner = score === opponentScore ? null : (score > opponentScore ? player : opponent);
      const loser = winner ? (winner.id === player.id ? opponent : player) : null;
      const roomSeries = updateRoomSeries(player.room, winner?.id);
      player.room.diceSession = null;
      return broadcast(player.room, {
        type: 'diceResult',
        winner: winner ? playerSummary(winner) : null,
        loser: loser ? playerSummary(loser) : null,
        winningDice: winner ? session.hands[winner.id] : null,
        losingDice: loser ? session.hands[loser.id] : null,
        winningHandName: winner ? diceHandName(session.hands[winner.id]) : null,
        losingHandName: winner ? diceHandName(session.hands[opponent.id === winner.id ? player.id : opponent.id]) : null,
        winningPlayerId: winner?.id || null,
        series: roomSeries,
      });
    }

    if (message.type === 'judge' && player.room && player.room.players.size === 2) {
      const players = [...player.room.players.values()];
      const winner = players[crypto.randomInt(players.length)];
      const loser = players.find((candidate) => candidate.id !== winner.id);
      player.room.result = { winnerId: winner.id, color: winner.color };
      const roomSeries = updateRoomSeries(player.room, winner.id);
      return broadcast(player.room, {
        type: 'result',
        winner: { id: winner.id, color: winner.color, shape: winner.shape },
        loser: { id: loser.id, color: loser.color, shape: loser.shape },
        series: roomSeries,
      });
    }

    if (message.type === 'straws' && player.room && player.room.players.size === 2) {
      if (player.room.strawSession) return;
      const argumentLength = [...player.room.players.values()].reduce((total, roomPlayer) => total + roomPlayer.argument.length, 0);
      const strawCount = Math.max(3, Math.min(18, argumentLength));
      const shortIndex = crypto.randomInt(strawCount);
      const straws = Array.from({ length: strawCount }, (_, index) => ({
        id: `straw-${index}`,
        height: 320,
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
        const roomSeries = updateRoomSeries(player.room, winner.id);
        player.room.strawSession = null;
        player.room.result = { winnerId: winner.id, loserId: loser.id, color: winner.color, method: 'straws', tallies: publicStrawTallies(player.room, session) };
        return broadcast(player.room, {
          type: 'result', method: 'straws', tallies: publicStrawTallies(player.room, session),
          winner: { id: winner.id, color: winner.color, shape: winner.shape },
          loser: { id: loser.id, color: loser.color, shape: loser.shape },
          series: roomSeries,
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
  });

  socket.on('close', () => {
    if (!player.room) return;
    player.room.strawSession = null;
    player.room.players.delete(player.id);
    if (player.room.players.size === 0) rooms.delete(player.room.name.toLowerCase());
    else broadcastRoom(player.room);
    broadcastRoomDirectory();
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Deciding Judge listening on port ${PORT}`));
