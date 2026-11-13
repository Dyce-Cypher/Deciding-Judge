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
function makeRoom(name) { return { name, players: new Map(), result: null, strawSession: null }; }
function cleanRoomName(name) { return String(name).trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 24) || null; }

function publicRoom(room) {
  return { name: room.name, players: [...room.players.values()].map(({ id, color, shape, argument }) => ({ id, color, shape, argument })), result: room.result };
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
      if ([...room.players.values()].some((existingPlayer) => existingPlayer.color === color && existingPlayer.shape === shape)) {
        return send(socket, { type: 'error', message: 'That shape and color are already in use in this room.' });
      }
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

    if (message.type === 'judge' && player.room && player.room.players.size === 2) {
      const players = [...player.room.players.values()];
      const winner = players[crypto.randomInt(players.length)];
      player.room.result = { winnerId: winner.id, color: winner.color };
      return broadcast(player.room, { type: 'result', winner: { id: winner.id, color: winner.color, shape: winner.shape } });
    }

    if (message.type === 'straws' && player.room && player.room.players.size === 2) {
      if (player.room.strawSession) return;
      const argumentLength = [...player.room.players.values()].reduce((total, roomPlayer) => total + roomPlayer.argument.length, 0);
      const strawCount = Math.max(3, Math.min(18, argumentLength));
      const shortIndex = crypto.randomInt(strawCount);
      const straws = Array.from({ length: strawCount }, (_, index) => ({
        id: `straw-${index}`,
        height: 230,
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
