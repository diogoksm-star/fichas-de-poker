// test-fold-allin.js - Teste de Fold e All-in Heads-Up
const http = require('http');

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(chunks));
        } catch (e) {
          resolve(chunks);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('--- TESTANDO FOLD E ALL-IN HEADS-UP ---');
  const roomId = 'SALA-FOLD-' + Math.floor(Math.random() * 1000);

  await request('/api/join', 'POST', { roomId, name: 'Alice', playerId: 'p_alice' });
  await request('/api/join', 'POST', { roomId, name: 'Bob', playerId: 'p_bob' });

  // Cenário 1: Fold no Pré-flop
  console.log('1. Iniciando mão e testando Fold pré-flop...');
  const h1 = await request('/api/start-hand', 'POST', { roomId });
  const turnPlayer = h1.state.players[h1.state.currentTurnIndex].id;
  console.log(`Vez no pré-flop: ${turnPlayer}. Executando Fold...`);
  
  const foldRes = await request('/api/action', 'POST', { roomId, playerId: turnPlayer, action: 'fold' });
  console.log(`Estado após Fold: ${foldRes.state.state}`);
  console.log(`Vencedores:`, foldRes.state.winners);

  if (foldRes.state.state !== 'HAND_OVER') {
    throw new Error('Após Fold, a mão deveria encerrar imediatamente (HAND_OVER)!');
  }

  // Cenário 2: All-in e Call
  console.log('2. Iniciando Mão #2 para testar All-In...');
  const h2 = await request('/api/start-hand', 'POST', { roomId });
  const pAllIn = h2.state.players[h2.state.currentTurnIndex];
  console.log(`${pAllIn.name} indo All-In com ${pAllIn.chips + pAllIn.currentBet}...`);
  
  const allInRes = await request('/api/action', 'POST', {
    roomId,
    playerId: pAllIn.id,
    action: 'raise',
    amount: pAllIn.chips + pAllIn.currentBet
  });
  console.log(`Pote após All-In: ${allInRes.state.pot}`);
  
  const pCall = allInRes.state.players[allInRes.state.currentTurnIndex];
  console.log(`${pCall.name} pagando o All-In...`);
  const callRes = await request('/api/action', 'POST', {
    roomId,
    playerId: pCall.id,
    action: 'call'
  });
  console.log(`Estado após ambos All-In: ${callRes.state.state}`);

  console.log('✅ TESTE DE FOLD E ALL-IN CONCLUÍDO COM SUCESSO!');
}

run().catch(err => {
  console.error('❌ ERRO:', err);
  process.exit(1);
});
