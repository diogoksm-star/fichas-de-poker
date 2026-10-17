// test-simulation.js - Simulação End-to-End da Partida Heads-Up (2 Jogadores)
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

async function runTest() {
  console.log('--- INICIANDO TESTE END-TO-END DE 2 JOGADORES (HEADS-UP) ---');
  const roomId = 'SALA-TESTE-' + Math.floor(Math.random() * 1000);

  // 1. Diogo entra
  console.log('1. Diogo entrando na sala...');
  const join1 = await request('/api/join', 'POST', {
    roomId,
    name: 'Diogo',
    playerId: 'p_diogo'
  });
  console.log(`✓ Diogo entrou. Jogadores na mesa: ${join1.state.players.length}`);

  // 2. Lucas entra
  console.log('2. Lucas entrando na sala...');
  const join2 = await request('/api/join', 'POST', {
    roomId,
    name: 'Lucas',
    playerId: 'p_lucas'
  });
  console.log(`✓ Lucas entrou. Jogadores na mesa: ${join2.state.players.length}`);
  console.log(`Status da Mesa: ${join2.state.state} (Pronto para iniciar com 2 jogadores)`);

  if (join2.state.players.length !== 2) throw new Error('Falha ao adicionar 2 jogadores');

  // 3. Iniciar a primeira mão (via celular de qualquer um)
  console.log('3. Disparando início da mão pelo celular...');
  const start1 = await request('/api/start-hand', 'POST', { roomId });
  const s1 = start1.state;
  console.log(`✓ Mão #${s1.handNumber} iniciada! Fase: ${s1.state}, Pote: ${s1.pot}`);
  
  const pDiogo = s1.players.find(p => p.id === 'p_diogo');
  const pLucas = s1.players.find(p => p.id === 'p_lucas');
  console.log(`Diogo (Dealer/SB): ${pDiogo.chips} fichas, Aposta: ${pDiogo.currentBet}`);
  console.log(`Lucas (BB): ${pLucas.chips} fichas, Aposta: ${pLucas.currentBet}`);
  console.log(`Vez de falar: ${s1.players[s1.currentTurnIndex].name}`);

  if (s1.currentTurnPlayerId !== 'p_diogo') {
    throw new Error('No Heads-Up, o Dealer (Small Blind) deve falar primeiro no pré-flop!');
  }

  // 4. Diogo paga o Big Blind (Call de 1 ficha adicional para totalizar 2)
  console.log('4. Diogo (SB) dá Call de 2...');
  const action1 = await request('/api/action', 'POST', {
    roomId,
    playerId: 'p_diogo',
    action: 'call'
  });
  console.log(`✓ Ação executada. Vez de: ${action1.state.players[action1.state.currentTurnIndex].name}`);

  // 5. Lucas dá Check na opção do Big Blind
  console.log('5. Lucas (BB) dá Check no pré-flop...');
  const action2 = await request('/api/action', 'POST', {
    roomId,
    playerId: 'p_lucas',
    action: 'check'
  });
  console.log(`✓ Fase avançada para: ${action2.state.state}! Pote: ${action2.state.pot}`);

  if (action2.state.state !== 'FLOP') {
    throw new Error(`Esperava FLOP após igualar apostas no pré-flop, mas obteve: ${action2.state.state}`);
  }

  // 6. No Flop: Lucas (BB) fala primeiro
  console.log(`6. No FLOP, a vez é de: ${action2.state.players[action2.state.currentTurnIndex].name}`);
  const turnPlayerFlop = action2.state.players[action2.state.currentTurnIndex].id;

  // Ambos dão check no Flop
  console.log('7. Ambos dão Check no Flop...');
  const aFlop1 = await request('/api/action', 'POST', { roomId, playerId: turnPlayerFlop, action: 'check' });
  const nextPlayerFlop = aFlop1.state.players[aFlop1.state.currentTurnIndex].id;
  const aFlop2 = await request('/api/action', 'POST', { roomId, playerId: nextPlayerFlop, action: 'check' });
  console.log(`✓ Fase após Flop: ${aFlop2.state.state}! Pote: ${aFlop2.state.pot}`);

  if (aFlop2.state.state !== 'TURN') {
    throw new Error(`Esperava TURN após checks no Flop, mas obteve: ${aFlop2.state.state}`);
  }

  // 8. No Turn: Aposta e Aumento
  console.log('8. Testando Bet e Raise no Turn...');
  const turnPlayerTurn = aFlop2.state.players[aFlop2.state.currentTurnIndex].id;
  const aTurn1 = await request('/api/action', 'POST', { roomId, playerId: turnPlayerTurn, action: 'bet', amount: 4 });
  console.log(`✓ Aposta de 4 realizada por ${turnPlayerTurn}. Pote: ${aTurn1.state.pot}`);

  const otherPlayerTurn = aTurn1.state.players[aTurn1.state.currentTurnIndex].id;
  const aTurn2 = await request('/api/action', 'POST', { roomId, playerId: otherPlayerTurn, action: 'raise', amount: 10 });
  console.log(`✓ Raise para 10 realizado por ${otherPlayerTurn}.`);

  const aTurn3 = await request('/api/action', 'POST', { roomId, playerId: turnPlayerTurn, action: 'call' });
  console.log(`✓ Call de 10 realizado. Fase avançou para: ${aTurn3.state.state}! Pote: ${aTurn3.state.pot}`);

  if (aTurn3.state.state !== 'RIVER') {
    throw new Error(`Esperava RIVER, mas obteve: ${aTurn3.state.state}`);
  }

  // 9. River: Checks até o Showdown
  console.log('9. Checks no River até o Showdown...');
  const riverP1 = aTurn3.state.players[aTurn3.state.currentTurnIndex].id;
  const aRiv1 = await request('/api/action', 'POST', { roomId, playerId: riverP1, action: 'check' });
  const riverP2 = aRiv1.state.players[aRiv1.state.currentTurnIndex].id;
  const aRiv2 = await request('/api/action', 'POST', { roomId, playerId: riverP2, action: 'check' });
  console.log(`✓ Fase após River: ${aRiv2.state.state}! Pote Acumulado: ${aRiv2.state.pot}`);

  if (aRiv2.state.state !== 'SHOWDOWN') {
    throw new Error(`Esperava SHOWDOWN, mas obteve: ${aRiv2.state.state}`);
  }

  // 10. Decidir Vencedor pelo Celular
  console.log('10. Declarando Diogo como vencedor do Showdown físico...');
  const showdownRes = await request('/api/showdown', 'POST', {
    roomId,
    winnerIds: ['p_diogo']
  });
  console.log(`✓ Showdown resolvido! Estado: ${showdownRes.state.state}`);
  console.log(`Vencedores:`, showdownRes.state.winners);
  const diogoFinal = showdownRes.state.players.find(p => p.id === 'p_diogo');
  console.log(`Fichas de Diogo após receber o pote: ${diogoFinal.chips}`);

  // 11. Iniciar Próxima Mão (Mão #2)
  console.log('11. Iniciando Mão #2 para testar rotação de Dealer...');
  const hand2 = await request('/api/start-hand', 'POST', { roomId });
  const s2 = hand2.state;
  console.log(`✓ Mão #${s2.handNumber} iniciada! Dealer index: ${s2.dealerIndex} (${s2.players[s2.dealerIndex].name})`);

  if (s2.players[s2.dealerIndex].id !== 'p_lucas') {
    throw new Error('Dealer não rotacionou para Lucas na mão #2!');
  }

  console.log('\n======================================================');
  console.log('🎉 SUCESSO ABSOLUTO! TODAS AS JOGADAS E REGRAS TESTADAS COM 2 JOGADORES!');
  console.log('======================================================');
}

runTest().catch(err => {
  console.error('❌ ERRO NO TESTE:', err);
  process.exit(1);
});
