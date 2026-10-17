// db.js - Camada de Persistência Híbrida (PostgreSQL / Supabase / Neon / Arquivo Local)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null;
const isPostgres = Boolean(process.env.DATABASE_URL);

if (isPostgres) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  console.log('📦 [DATABASE] Modo PostgreSQL conectado via DATABASE_URL');
} else {
  console.log('📦 [DATABASE] Modo Local Ativo (JSON em ./data/database.json)');
}

const LOCAL_DB_DIR = path.join(__dirname, 'data');
const LOCAL_DB_PATH = path.join(LOCAL_DB_DIR, 'database.json');

function getLocalData() {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    const initial = { tables: {}, players: {}, hands: [], transactions: [] };
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
  } catch (err) {
    return { tables: {}, players: {}, hands: [], transactions: [] };
  }
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Erro salvando banco local:', e);
  }
}

async function initDb() {
  if (isPostgres) {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS poker_tables (
          room_id VARCHAR(50) PRIMARY KEY,
          starting_chips INT DEFAULT 100,
          small_blind INT DEFAULT 1,
          big_blind INT DEFAULT 2,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS poker_players (
          id VARCHAR(100) PRIMARY KEY,
          room_id VARCHAR(50) NOT NULL,
          name VARCHAR(100) NOT NULL,
          chips INT DEFAULT 100,
          hands_played INT DEFAULT 0,
          hands_won INT DEFAULT 0,
          total_rebuys INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS poker_hands (
          id SERIAL PRIMARY KEY,
          room_id VARCHAR(50) NOT NULL,
          hand_number INT NOT NULL,
          pot_total INT NOT NULL,
          winner_names TEXT NOT NULL,
          summary TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS poker_transactions (
          id SERIAL PRIMARY KEY,
          room_id VARCHAR(50) NOT NULL,
          player_id VARCHAR(100) NOT NULL,
          player_name VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          amount INT NOT NULL,
          balance_after INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ [DATABASE] Tabelas PostgreSQL verificadas/criadas com sucesso.');
    } catch (err) {
      console.error('❌ [DATABASE] Erro criando tabelas SQL:', err);
    } finally {
      client.release();
    }
  } else {
    getLocalData();
    console.log('✅ [DATABASE] Banco local inicializado com sucesso.');
  }
}

async function savePlayer(roomId, player) {
  if (isPostgres) {
    try {
      await pool.query(`
        INSERT INTO poker_players (id, room_id, name, chips, hands_played, hands_won, total_rebuys, updated_at)
        VALUES ($1, $2, $3, $4, 0, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          chips = EXCLUDED.chips,
          updated_at = CURRENT_TIMESTAMP;
      `, [player.id, roomId, player.name, player.chips]);
    } catch (e) {
      console.error('Erro salvando jogador no PostgreSQL:', e);
    }
  } else {
    const data = getLocalData();
    data.players[player.id] = {
      id: player.id,
      roomId,
      name: player.name,
      chips: player.chips,
      updatedAt: new Date().toISOString()
    };
    saveLocalData(data);
  }
}

async function recordHandHistory(roomId, handNumber, potTotal, winners, summary = '') {
  const winnerNames = winners.map(w => `${w.name} (+${w.amount})`).join(', ');

  if (isPostgres) {
    try {
      await pool.query(`
        INSERT INTO poker_hands (room_id, hand_number, pot_total, winner_names, summary)
        VALUES ($1, $2, $3, $4, $5);
      `, [roomId, handNumber, potTotal, winnerNames, summary]);
    } catch (e) {
      console.error('Erro registrando mão no PostgreSQL:', e);
    }
  } else {
    const data = getLocalData();
    data.hands.push({
      roomId,
      handNumber,
      potTotal,
      winnerNames,
      summary,
      createdAt: new Date().toISOString()
    });
    saveLocalData(data);
  }
}

async function recordTransaction(roomId, playerId, playerName, type, amount, balanceAfter) {
  if (isPostgres) {
    try {
      await pool.query(`
        INSERT INTO poker_transactions (room_id, player_id, player_name, type, amount, balance_after)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [roomId, playerId, playerName, type, amount, balanceAfter]);
    } catch (e) {
      console.error('Erro registrando transação no PostgreSQL:', e);
    }
  } else {
    const data = getLocalData();
    data.transactions.push({
      roomId,
      playerId,
      playerName,
      type,
      amount,
      balanceAfter,
      createdAt: new Date().toISOString()
    });
    saveLocalData(data);
  }
}

async function getRoomStats(roomId) {
  if (isPostgres) {
    try {
      const handsRes = await pool.query(
        'SELECT * FROM poker_hands WHERE room_id = $1 ORDER BY id DESC LIMIT 10',
        [roomId]
      );
      const playersRes = await pool.query(
        'SELECT name, chips FROM poker_players WHERE room_id = $1 ORDER BY chips DESC',
        [roomId]
      );
      return {
        recentHands: handsRes.rows,
        ranking: playersRes.rows
      };
    } catch (e) {
      return { recentHands: [], ranking: [] };
    }
  } else {
    const data = getLocalData();
    const hands = data.hands.filter(h => h.roomId === roomId).slice(-10).reverse();
    const ranking = Object.values(data.players)
      .filter(p => p.roomId === roomId)
      .sort((a, b) => b.chips - a.chips);
    return { recentHands: hands, ranking };
  }
}

module.exports = {
  initDb,
  savePlayer,
  recordHandHistory,
  recordTransaction,
  getRoomStats
};
