// server.js - Servidor de Fichas de Poker em Tempo Real com Banco de Dados e Timer
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const cors = require('cors');
const PokerRoom = require('./poker-engine');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializa banco de dados
db.initDb().catch(err => console.error('Erro na inicialização do banco:', err));

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Map de salas ativas na memória: roomId -> PokerRoom
const rooms = new Map();

async function getOrCreateRoom(roomId = 'MESA-1') {
  roomId = roomId.toUpperCase().trim();
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }
  
  // Tentar restaurar do banco de dados (fundamental para Vercel Serverless)
  try {
    const saved = await db.loadRoomState(roomId);
    if (saved) {
      const restored = PokerRoom.fromJSON(saved);
      rooms.set(roomId, restored);
      return restored;
    }
  } catch (e) {
    console.error('Erro carregando estado salvo:', e);
  }

  const room = new PokerRoom(roomId);
  rooms.set(roomId, room);
  return room;
}

// Loop do Timer de Turno (Auto-check / Auto-fold por inatividade)
setInterval(async () => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.checkTimer()) {
      await db.saveRoomState(roomId, room.toJSON());
      io.to(roomId).emit('gameState', room.getState());
    }
  }
}, 1000);

// Endpoint para obter dados de rede e QR Code para a TV
app.get('/api/info', async (req, res) => {
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host;
  const isVercel = reqHost && reqHost.includes('vercel.app');
  const protocol = req.headers['x-forwarded-proto'] || (req.secure || isVercel ? 'https' : 'http');
  const roomId = (req.query.room || 'MESA-1').toUpperCase();

  let clientUrl = '';
  let hostDisplay = '';

  if (isVercel || (reqHost && !reqHost.includes('localhost') && !reqHost.startsWith('127.') && !reqHost.startsWith('169.254.'))) {
    clientUrl = `${protocol}://${reqHost}/play.html?room=${roomId}`;
    hostDisplay = reqHost;
  } else {
    const localIp = getLocalIpAddress();
    hostDisplay = localIp;
    clientUrl = `http://${localIp}:${PORT}/play.html?room=${roomId}`;
  }
  
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(clientUrl, {
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      localIp: hostDisplay,
      port: PORT,
      roomId,
      clientUrl,
      qrCode: qrCodeDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro gerando QR Code', details: err.message });
  }
});

// Endpoint para buscar estatísticas e ranking do banco de dados
app.get('/api/stats', async (req, res) => {
  const roomId = (req.query.room || 'MESA-1').toUpperCase();
  try {
    const stats = await db.getRoomStats(roomId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar estatísticas' });
  }
});

// REST Fallback: Obter estado atual da mesa
app.get('/api/state', async (req, res) => {
  const roomId = (req.query.room || 'MESA-1').toUpperCase();
  const room = await getOrCreateRoom(roomId);
  res.json(room.getState());
});

// REST Fallback: Entrar na mesa
app.post('/api/join', async (req, res) => {
  const { roomId = 'MESA-1', name, playerId, isHost = false } = req.body;
  const room = await getOrCreateRoom(roomId);
  const player = room.addPlayer(playerId, name, null, isHost);
  await db.savePlayer(room.roomId, player);
  await db.saveRoomState(room.roomId, room.toJSON());
  io.to(room.roomId).emit('gameState', room.getState());
  res.json({ success: true, player, state: room.getState() });
});

// REST Fallback: Executar Ação (Fold, Check, Call, Raise)
app.post('/api/action', async (req, res) => {
  const { roomId = 'MESA-1', playerId, action, amount = 0 } = req.body;
  const room = await getOrCreateRoom(roomId);

  const player = room.players.find(p => p.id === playerId);
  const beforeChips = player ? player.chips : 0;

  const result = room.playerAction(playerId, action, amount);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  if (player) {
    await db.savePlayer(room.roomId, player);
    const spent = beforeChips - player.chips;
    if (spent > 0) {
      await db.recordTransaction(room.roomId, player.id, player.name, action.toUpperCase(), spent, player.chips);
    }
  }

  if (room.state === 'HAND_OVER' && room.winners.length > 0) {
    await db.recordHandHistory(room.roomId, room.handNumber, room.winners.reduce((acc, w) => acc + w.amount, 0), room.winners, 'Vitória na mão');
  }

  await db.saveRoomState(room.roomId, room.toJSON());
  io.to(room.roomId).emit('gameState', room.getState());
  res.json({ success: true, state: room.getState() });
});

// REST Fallback: Iniciar Nova Mão
app.post('/api/start-hand', async (req, res) => {
  const { roomId = 'MESA-1' } = req.body;
  const room = await getOrCreateRoom(roomId);
  const ok = room.startNewHand();
  if (ok) {
    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  }
  res.json({ success: ok, state: room.getState() });
});

// REST Fallback: Forçar / Mudar Street Manualmente (Host)
app.post('/api/set-street', async (req, res) => {
  const { roomId = 'MESA-1', street } = req.body;
  const room = await getOrCreateRoom(roomId);
  const ok = room.setStreet(street);
  if (ok) {
    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  }
  res.json({ success: ok, state: room.getState() });
});

// REST Fallback: Resolver Showdown / Declarar Vencedor Manual a Qualquer Momento
app.post('/api/showdown', async (req, res) => {
  const { roomId = 'MESA-1', winnerIds } = req.body;
  const room = await getOrCreateRoom(roomId);

  const potTotal = room.pot + room.players.reduce((sum, p) => sum + p.currentBet, 0);
  const ok = room.resolveShowdown(winnerIds);
  if (ok) {
    await db.recordHandHistory(room.roomId, room.handNumber, potTotal, room.winners, 'Showdown de cartas físicas');
    for (const w of room.winners) {
      const wp = room.players.find(p => p.id === w.id);
      if (wp) await db.savePlayer(room.roomId, wp);
    }
    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  }
  res.json({ success: ok, state: room.getState() });
});

// REST Fallback: Rebuy
app.post('/api/rebuy', async (req, res) => {
  const { roomId = 'MESA-1', playerId, amount = 100 } = req.body;
  const room = await getOrCreateRoom(roomId);

  const ok = room.rebuy(playerId, amount);
  if (ok) {
    const p = room.players.find(pl => pl.id === playerId);
    if (p) await db.savePlayer(room.roomId, p);
    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  }
  res.json({ success: ok, state: room.getState() });
});

// REST Fallback: Forçar Avanço
app.post('/api/advance', async (req, res) => {
  const { roomId = 'MESA-1' } = req.body;
  const room = await getOrCreateRoom(roomId);

  const ok = room.forceAdvance();
  if (ok) {
    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  }
  res.json({ success: ok, state: room.getState() });
});

// REST Fallback: Resetar Mão
app.post('/api/reset-hand', async (req, res) => {
  const { roomId = 'MESA-1' } = req.body;
  const room = await getOrCreateRoom(roomId);

  room.resetHand();
  await db.saveRoomState(room.roomId, room.toJSON());
  io.to(room.roomId).emit('gameState', room.getState());
  res.json({ success: true, state: room.getState() });
});

// Socket.io - Comunicação em Tempo Real
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentPlayerId = null;

  socket.on('joinRoom', async ({ roomId = 'MESA-1', name, playerId, isTv = false, isHost = false }) => {
    roomId = roomId.toUpperCase().trim();
    currentRoomId = roomId;
    const room = await getOrCreateRoom(roomId);

    socket.join(roomId);

    if (isTv) {
      socket.emit('gameState', room.getState());
      return;
    }

    const player = room.addPlayer(playerId, name, socket.id, isHost);
    currentPlayerId = player.id;

    await db.savePlayer(roomId, player);
    await db.saveRoomState(roomId, room.toJSON());

    socket.emit('playerJoined', {
      playerId: player.id,
      player: player,
      state: room.getState()
    });

    io.to(roomId).emit('gameState', room.getState());
  });

  socket.on('playerAction', async ({ roomId, action, amount }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === currentPlayerId);
    const beforeChips = player ? player.chips : 0;

    const result = room.playerAction(currentPlayerId, action, amount);
    if (!result.success) {
      socket.emit('actionError', { message: result.message });
      return;
    }

    if (player) {
      await db.savePlayer(room.roomId, player);
      const spent = beforeChips - player.chips;
      if (spent > 0) {
        await db.recordTransaction(room.roomId, player.id, player.name, action.toUpperCase(), spent, player.chips);
      }
    }

    if (room.state === 'HAND_OVER' && room.winners.length > 0) {
      await db.recordHandHistory(room.roomId, room.handNumber, room.winners.reduce((acc, w) => acc + w.amount, 0), room.winners, 'Vitória na mão');
    }

    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  });

  socket.on('startHand', async ({ roomId }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    if (room.startNewHand()) {
      await db.saveRoomState(room.roomId, room.toJSON());
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('setStreet', async ({ roomId, street }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    if (room.setStreet(street)) {
      await db.saveRoomState(room.roomId, room.toJSON());
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('resolveShowdown', async ({ roomId, winnerIds }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    const potTotal = room.pot + room.players.reduce((sum, p) => sum + p.currentBet, 0);

    if (room.resolveShowdown(winnerIds)) {
      await db.recordHandHistory(room.roomId, room.handNumber, potTotal, room.winners, 'Showdown de cartas físicas');
      for (const w of room.winners) {
        const wp = room.players.find(p => p.id === w.id);
        if (wp) await db.savePlayer(room.roomId, wp);
      }
      await db.saveRoomState(room.roomId, room.toJSON());
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('rebuy', async ({ roomId, playerId, amount }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    const targetId = playerId || currentPlayerId;
    if (room.rebuy(targetId, amount)) {
      const p = room.players.find(pl => pl.id === targetId);
      if (p) await db.savePlayer(room.roomId, p);
      await db.saveRoomState(room.roomId, room.toJSON());
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('forceAdvance', async ({ roomId }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    if (room.forceAdvance()) {
      await db.saveRoomState(room.roomId, room.toJSON());
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('resetHand', async ({ roomId }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    room.resetHand();
    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  });

  socket.on('updateSettings', async ({ roomId, settings }) => {
    const room = await getOrCreateRoom(roomId);
    if (!room) return;

    room.updateSettings(settings);
    await db.saveRoomState(room.roomId, room.toJSON());
    io.to(room.roomId).emit('gameState', room.getState());
  });

  socket.on('disconnect', () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      io.to(currentRoomId).emit('gameState', room.getState());
    }
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`====================================================`);
    console.log(`♠️♥️ FICHAS DE POKER - BANCO, TIMER E SERVIDOR PRONTOS ♦️♣️`);
    console.log(`----------------------------------------------------`);
    console.log(`🖥️  TELA DA TV / COMPUTADOR: http://localhost:${PORT}/tv.html`);
    console.log(`📱 CELULAR DOS AMIGOS:       http://${localIp}:${PORT}/play.html`);
    console.log(`====================================================`);
  });
}

module.exports = app;
