// server.js - Servidor de Fichas de Poker em Tempo Real com Banco de Dados
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

// Inicializa banco de dados (PostgreSQL se DATABASE_URL existir, senão JSON local)
db.initDb().catch(err => console.error('Erro na inicialização do banco:', err));

// Obter o IP local da máquina para conectar celulares no mesmo Wi-Fi
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

function getOrCreateRoom(roomId = 'MESA-1') {
  roomId = roomId.toUpperCase().trim();
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new PokerRoom(roomId));
  }
  return rooms.get(roomId);
}

// Endpoint para obter dados de rede e QR Code para a TV
app.get('/api/info', async (req, res) => {
  const host = process.env.PUBLIC_URL || getLocalIpAddress();
  const roomId = (req.query.room || 'MESA-1').toUpperCase();
  const isHttps = process.env.NODE_ENV === 'production' || process.env.PUBLIC_URL?.startsWith('https');
  const protocol = isHttps ? 'https' : 'http';
  const portPart = (process.env.PUBLIC_URL || PORT == 80 || PORT == 443) ? '' : `:${PORT}`;
  
  const clientUrl = process.env.PUBLIC_URL 
    ? `${process.env.PUBLIC_URL}/play.html?room=${roomId}`
    : `${protocol}://${host}${portPart}/play.html?room=${roomId}`;
  
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
      localIp: host,
      port: PORT,
      roomId,
      clientUrl,
      qrCode: qrCodeDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro gerando QR Code' });
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

// Socket.io - Comunicação em Tempo Real
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentPlayerId = null;

  socket.on('joinRoom', async ({ roomId = 'MESA-1', name, playerId, isTv = false, isHost = false }) => {
    roomId = roomId.toUpperCase().trim();
    currentRoomId = roomId;
    const room = getOrCreateRoom(roomId);

    socket.join(roomId);

    if (isTv) {
      socket.emit('gameState', room.getState());
      return;
    }

    // Se for um jogador no celular
    const player = room.addPlayer(playerId, name, socket.id, isHost);
    currentPlayerId = player.id;

    // Persistir no Banco de Dados
    await db.savePlayer(roomId, player);
    await db.recordTransaction(roomId, player.id, player.name, 'JOIN', player.chips, player.chips);

    socket.emit('playerJoined', {
      playerId: player.id,
      player: player,
      state: room.getState()
    });

    io.to(roomId).emit('gameState', room.getState());
  });

  socket.on('playerAction', async ({ roomId, action, amount }) => {
    const room = rooms.get(roomId?.toUpperCase());
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

    // Se encerrou a mão por folds automáticos
    if (room.state === 'HAND_OVER' && room.winners.length > 0) {
      await db.recordHandHistory(room.roomId, room.handNumber, room.winners.reduce((acc, w) => acc + w.amount, 0), room.winners, 'Vitória por Fold de todos');
      for (const w of room.winners) {
        const wp = room.players.find(p => p.id === w.id);
        if (wp) {
          await db.savePlayer(room.roomId, wp);
          await db.recordTransaction(room.roomId, wp.id, wp.name, 'WIN_FOLD', w.amount, wp.chips);
        }
      }
    }

    io.to(room.roomId).emit('gameState', room.getState());
  });

  socket.on('startHand', ({ roomId }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) return;

    if (room.startNewHand()) {
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('resolveShowdown', async ({ roomId, winnerIds }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) return;

    const potTotal = room.pot + room.players.reduce((sum, p) => sum + p.currentBet, 0);

    if (room.resolveShowdown(winnerIds)) {
      // Salva histórico da mão no Banco de Dados
      await db.recordHandHistory(room.roomId, room.handNumber, potTotal, room.winners, 'Showdown de cartas físicas');

      // Atualiza fichas dos vencedores no Banco
      for (const w of room.winners) {
        const wp = room.players.find(p => p.id === w.id);
        if (wp) {
          await db.savePlayer(room.roomId, wp);
          await db.recordTransaction(room.roomId, wp.id, wp.name, 'WIN_SHOWDOWN', w.amount, wp.chips);
        }
      }

      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('rebuy', async ({ roomId, playerId, amount }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) return;

    const targetId = playerId || currentPlayerId;
    if (room.rebuy(targetId, amount)) {
      const p = room.players.find(pl => pl.id === targetId);
      if (p) {
        await db.savePlayer(room.roomId, p);
        await db.recordTransaction(room.roomId, p.id, p.name, 'REBUY', amount, p.chips);
      }
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('forceAdvance', ({ roomId }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) return;

    if (room.forceAdvance()) {
      io.to(room.roomId).emit('gameState', room.getState());
    }
  });

  socket.on('resetHand', ({ roomId }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) return;

    room.resetHand();
    io.to(room.roomId).emit('gameState', room.getState());
  });

  socket.on('updateSettings', ({ roomId, settings }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) return;

    room.updateSettings(settings);
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
    console.log(`♠️♥️ FICHAS DE POKER - BANCO E SERVIDOR PRONTOS ♦️♣️`);
    console.log(`----------------------------------------------------`);
    console.log(`🖥️  TELA DA TV / COMPUTADOR: http://localhost:${PORT}/tv.html`);
    console.log(`📱 CELULAR DOS AMIGOS:       http://${localIp}:${PORT}/play.html`);
    console.log(`====================================================`);
  });
}

module.exports = app;
