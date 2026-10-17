// poker-engine.js - Mecânica de Fichas e Apostas de Poker Texas Hold'em
class PokerRoom {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.startingChips = options.startingChips || 100;
    this.smallBlind = options.smallBlind || 1;
    this.bigBlind = options.bigBlind || 2;
    this.turnTimeLimit = options.turnTimeLimit || 30; // Segundos por turno
    
    this.players = []; // { id, name, socketId, chips, currentBet, totalHandBet, folded, isAllIn, isSittingOut, hasActed, isHost }
    this.state = 'LOBBY'; // LOBBY, PREFLOP, FLOP, TURN, RIVER, SHOWDOWN, HAND_OVER
    
    this.pot = 0; // Pote principal acumulado
    this.currentMaxBet = 0; // Maior aposta na street atual
    this.minRaise = this.bigBlind; // Aumento mínimo permitido
    
    this.dealerIndex = 0;
    this.sbIndex = -1;
    this.bbIndex = -1;
    this.currentTurnIndex = -1;
    this.turnStartTime = Date.now();
    
    this.actionLog = [];
    this.lastAction = null;
    this.handNumber = 0;
    this.winners = [];
  }

  log(msg) {
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.actionLog.unshift({ time: timestamp, text: msg });
    if (this.actionLog.length > 50) this.actionLog.pop();
  }

  addPlayer(id, name, socketId, isHost = false) {
    let player = this.players.find(p => p.id === id);
    if (player) {
      player.socketId = socketId;
      player.name = name || player.name;
      this.log(`${player.name} reconectou à mesa.`);
      return player;
    }

    player = {
      id: id || 'p_' + Math.random().toString(36).substring(2, 9),
      name: name.trim() || `Jogador ${this.players.length + 1}`,
      socketId,
      chips: this.startingChips,
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      isAllIn: false,
      isSittingOut: false,
      hasActed: false,
      isHost: isHost || this.players.length === 0,
      avatarColor: this.getRandomColor()
    };

    this.players.push(player);
    this.log(`${player.name} entrou na mesa com ${player.chips} fichas.`);
    return player;
  }

  removePlayer(socketId) {
    const index = this.players.findIndex(p => p.socketId === socketId);
    if (index === -1) return null;

    const player = this.players[index];
    if (this.state !== 'LOBBY' && this.state !== 'HAND_OVER' && !player.folded) {
      this.playerAction(player.id, 'fold');
    }

    this.players.splice(index, 1);
    this.log(`${player.name} saiu da mesa.`);

    if (player.isHost && this.players.length > 0) {
      this.players[0].isHost = true;
    }

    if (this.players.length < 2 && this.state !== 'LOBBY') {
      this.state = 'LOBBY';
      this.currentTurnIndex = -1;
      this.log('Mesa em espera: aguardando pelo menos 2 jogadores.');
    }

    return player;
  }

  rebuy(playerId, amount = this.startingChips) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    player.chips += amount;
    player.isAllIn = false;
    this.log(`${player.name} fez rebuy de +${amount} fichas (Total: ${player.chips}).`);
    return true;
  }

  updateSettings(settings) {
    if (settings.startingChips) this.startingChips = Number(settings.startingChips);
    if (settings.smallBlind) this.smallBlind = Number(settings.smallBlind);
    if (settings.bigBlind) this.bigBlind = Number(settings.bigBlind);
    if (settings.turnTimeLimit !== undefined) this.turnTimeLimit = Number(settings.turnTimeLimit);
    this.minRaise = this.bigBlind;
    this.log(`Configurações: Blinds ${this.smallBlind}/${this.bigBlind}, Timer ${this.turnTimeLimit}s, Stack ${this.startingChips}.`);
  }

  getActivePlayers() {
    return this.players.filter(p => !p.isSittingOut && p.chips > 0);
  }

  getInHandPlayers() {
    return this.players.filter(p => !p.folded && !p.isSittingOut);
  }

  getNextActiveIndex(fromIndex) {
    const count = this.players.length;
    for (let i = 1; i <= count; i++) {
      const idx = (fromIndex + i) % count;
      const p = this.players[idx];
      if (!p.isSittingOut && p.chips > 0) {
        return idx;
      }
    }
    return fromIndex;
  }

  getNextInHandIndex(fromIndex) {
    const count = this.players.length;
    for (let i = 1; i <= count; i++) {
      const idx = (fromIndex + i) % count;
      const p = this.players[idx];
      if (!p.folded && !p.isSittingOut && !p.isAllIn) {
        return idx;
      }
    }
    return -1;
  }

  startNewHand() {
    const active = this.getActivePlayers();
    if (active.length < 2) {
      this.log('Não há jogadores suficientes com fichas para iniciar uma mão.');
      return false;
    }

    this.handNumber++;
    this.state = 'PREFLOP';
    this.pot = 0;
    this.currentMaxBet = 0;
    this.minRaise = this.bigBlind;
    this.winners = [];

    // Reset estado dos jogadores
    this.players.forEach(p => {
      p.currentBet = 0;
      p.totalHandBet = 0;
      p.folded = p.chips <= 0 || p.isSittingOut;
      p.isAllIn = false;
      p.hasActed = false;
    });

    // Avança dealer
    if (this.handNumber > 1) {
      this.dealerIndex = this.getNextActiveIndex(this.dealerIndex);
    } else {
      this.dealerIndex = 0;
    }

    // Calcula Small Blind e Big Blind
    if (this.players.length === 2) {
      this.sbIndex = this.dealerIndex;
      this.bbIndex = this.getNextActiveIndex(this.sbIndex);
    } else {
      this.sbIndex = this.getNextActiveIndex(this.dealerIndex);
      this.bbIndex = this.getNextActiveIndex(this.sbIndex);
    }

    // Debitar Small Blind
    const sbPlayer = this.players[this.sbIndex];
    const sbAmount = Math.min(sbPlayer.chips, this.smallBlind);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    sbPlayer.totalHandBet = sbAmount;
    if (sbPlayer.chips === 0) sbPlayer.isAllIn = true;
    this.log(`${sbPlayer.name} postou o Small Blind (${sbAmount} fichas).`);

    // Debitar Big Blind
    const bbPlayer = this.players[this.bbIndex];
    const bbAmount = Math.min(bbPlayer.chips, this.bigBlind);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    bbPlayer.totalHandBet = bbAmount;
    if (bbPlayer.chips === 0) bbPlayer.isAllIn = true;
    this.log(`${bbPlayer.name} postou o Big Blind (${bbAmount} fichas).`);

    this.currentMaxBet = Math.max(sbAmount, bbAmount);

    // Primeiro a agir no pré-flop é quem está à esquerda do BB (UTG)
    this.currentTurnIndex = this.getNextInHandIndex(this.bbIndex);
    this.turnStartTime = Date.now();

    if (this.currentTurnIndex === -1) {
      this.advanceStreet();
    }

    this.log(`--- MÃO #${this.handNumber} INICIADA (PRÉ-FLOP) ---`);
    return true;
  }

  // Verifica timer do turno atual e toma ação se expirou
  checkTimer() {
    if (this.state === 'LOBBY' || this.state === 'SHOWDOWN' || this.state === 'HAND_OVER') return false;
    if (this.currentTurnIndex === -1 || this.turnTimeLimit <= 0) return false;

    const elapsedSeconds = (Date.now() - this.turnStartTime) / 1000;
    if (elapsedSeconds >= this.turnTimeLimit) {
      const player = this.players[this.currentTurnIndex];
      if (!player) return false;

      const callCost = this.currentMaxBet - player.currentBet;
      const autoAction = callCost <= 0 ? 'check' : 'fold';

      this.log(`⏱️ Tempo esgotado para ${player.name} (${this.turnTimeLimit}s)! Ação automática: ${autoAction.toUpperCase()}`);
      return this.playerAction(player.id, autoAction);
    }
    return false;
  }

  playerAction(playerId, action, amount = 0) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, message: 'Jogador não encontrado' };

    const playerIndex = this.players.indexOf(player);
    if (this.currentTurnIndex !== playerIndex) {
      return { success: false, message: 'Não é a sua vez!' };
    }

    amount = Number(amount) || 0;
    const callCost = this.currentMaxBet - player.currentBet;

    if (action === 'fold') {
      player.folded = true;
      player.hasActed = true;
      this.log(`${player.name} deu FOLD (desistiu da mão).`);
      this.lastAction = { player: player.name, action: 'FOLD', amount: 0 };
    } 
    else if (action === 'check') {
      if (callCost > 0) {
        return { success: false, message: `Não pode dar mesa/check. Aposta pendente de ${callCost} fichas.` };
      }
      player.hasActed = true;
      this.log(`${player.name} deu CHECK (mesa).`);
      this.lastAction = { player: player.name, action: 'CHECK', amount: 0 };
    } 
    else if (action === 'call') {
      if (callCost <= 0) {
        player.hasActed = true;
        this.log(`${player.name} deu CHECK.`);
        this.lastAction = { player: player.name, action: 'CHECK', amount: 0 };
      } else {
        const payAmount = Math.min(player.chips, callCost);
        player.chips -= payAmount;
        player.currentBet += payAmount;
        player.totalHandBet += payAmount;
        player.hasActed = true;

        if (player.chips === 0) {
          player.isAllIn = true;
          this.log(`${player.name} pagou ${payAmount} fichas e está ALL-IN!`);
          this.lastAction = { player: player.name, action: 'ALL-IN (CALL)', amount: payAmount };
        } else {
          this.log(`${player.name} pagou (CALL) ${payAmount} fichas.`);
          this.lastAction = { player: player.name, action: 'CALL', amount: payAmount };
        }
      }
    } 
    else if (action === 'bet' || action === 'raise') {
      if (amount <= this.currentMaxBet && amount < player.chips + player.currentBet) {
        return { success: false, message: `A aposta deve ser maior que a aposta atual (${this.currentMaxBet}).` };
      }

      const additionalChips = amount - player.currentBet;
      if (additionalChips > player.chips) {
        return { success: false, message: 'Fichas insuficientes.' };
      }

      const raiseDiff = amount - this.currentMaxBet;
      if (raiseDiff > this.minRaise) {
        this.minRaise = raiseDiff;
      }

      player.chips -= additionalChips;
      player.currentBet = amount;
      player.totalHandBet += additionalChips;
      player.hasActed = true;

      const isRaise = this.currentMaxBet > 0;
      this.currentMaxBet = amount;

      if (player.chips === 0) {
        player.isAllIn = true;
        this.log(`${player.name} foi ALL-IN de ${amount} fichas!`);
        this.lastAction = { player: player.name, action: 'ALL-IN', amount };
      } else {
        const actionLabel = isRaise ? 'RAISE' : 'BET';
        this.log(`${player.name} deu ${actionLabel} para ${amount} fichas.`);
        this.lastAction = { player: player.name, action: actionLabel, amount };
      }

      // Quando alguém aumenta, todos os outros que ainda estão na mão precisam agir novamente
      this.players.forEach(p => {
        if (p.id !== player.id && !p.folded && !p.isAllIn) {
          p.hasActed = false;
        }
      });
    }

    // Verificar se sobrou apenas 1 jogador na mão (todos os outros deram fold)
    const inHand = this.getInHandPlayers();
    if (inHand.length === 1) {
      this.awardSingleWinner(inHand[0]);
      return { success: true };
    }

    // Verifica se a rodada de apostas (street) terminou
    if (this.isStreetComplete()) {
      this.advanceStreet();
    } else {
      this.currentTurnIndex = this.getNextInHandIndex(this.currentTurnIndex);
      this.turnStartTime = Date.now();
      if (this.currentTurnIndex === -1) {
        this.advanceStreet();
      }
    }

    return { success: true };
  }

  isStreetComplete() {
    const inHand = this.getInHandPlayers();
    const eligibleToAct = inHand.filter(p => !p.isAllIn);

    if (eligibleToAct.length === 0) {
      return true; // Todos que sobraram estão all-in
    }

    for (const p of eligibleToAct) {
      if (!p.hasActed) return false;
      if (p.currentBet !== this.currentMaxBet) return false;
    }

    return true;
  }

  collectBetsIntoPot() {
    let streetPot = 0;
    this.players.forEach(p => {
      streetPot += p.currentBet;
      p.currentBet = 0;
      p.hasActed = false;
    });
    this.pot += streetPot;
    this.currentMaxBet = 0;
    this.minRaise = this.bigBlind;
  }

  advanceStreet() {
    this.collectBetsIntoPot();

    const inHand = this.getInHandPlayers();
    const canAct = inHand.filter(p => !p.isAllIn);

    if (this.state === 'PREFLOP') {
      this.state = 'FLOP';
      this.log('--- ABRINDO O FLOP (3 CARTAS NA MESA REAL) ---');
    } else if (this.state === 'FLOP') {
      this.state = 'TURN';
      this.log('--- ABRINDO O TURN (4ª CARTA NA MESA REAL) ---');
    } else if (this.state === 'TURN') {
      this.state = 'RIVER';
      this.log('--- ABRINDO O RIVER (5ª CARTA NA MESA REAL) ---');
    } else if (this.state === 'RIVER') {
      this.state = 'SHOWDOWN';
      this.log('--- SHOWDOWN: MOSTREM AS CARTAS FÍSICAS NA MESA! ---');
      this.currentTurnIndex = -1;
      return;
    }

    // Se todos ou quase todos estão all-in
    if (canAct.length < 2) {
      this.log('Jogadores em All-In! Revelem as cartas físicas até o Showdown.');
      // Permite avançar até o Showdown sem travar
      this.currentTurnIndex = -1;
      return;
    }

    // A ação pós-flop sempre começa à esquerda do Dealer
    this.currentTurnIndex = this.getNextInHandIndex(this.dealerIndex);
    this.turnStartTime = Date.now();
  }

  // Controle manual de street pelo Host (Pré-Flop, Flop, Turn, River, Showdown)
  setStreet(streetName) {
    streetName = streetName.toUpperCase();
    const validStreets = ['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];
    if (!validStreets.includes(streetName)) return false;

    this.collectBetsIntoPot();
    this.state = streetName;
    this.log(`Host alterou a fase da mesa manualmente para: ${streetName}`);

    if (streetName === 'SHOWDOWN') {
      this.currentTurnIndex = -1;
    } else {
      const inHand = this.getInHandPlayers();
      const canAct = inHand.filter(p => !p.isAllIn);
      if (canAct.length >= 2) {
        this.currentTurnIndex = streetName === 'PREFLOP' 
          ? this.getNextInHandIndex(this.bbIndex)
          : this.getNextInHandIndex(this.dealerIndex);
        this.turnStartTime = Date.now();
      } else {
        this.currentTurnIndex = -1;
      }
    }
    return true;
  }

  awardSingleWinner(winner) {
    this.collectBetsIntoPot();
    winner.chips += this.pot;
    this.winners = [{ id: winner.id, name: winner.name, amount: this.pot }];
    this.log(`🏆 ${winner.name} venceu o pote de ${this.pot} fichas (todos os outros deram fold)!`);
    this.pot = 0;
    this.state = 'HAND_OVER';
    this.currentTurnIndex = -1;
  }

  // Pode ser chamado a qualquer momento pelo Host para decidir o vencedor do pote!
  resolveShowdown(winnerIds) {
    if (!winnerIds || winnerIds.length === 0) return false;
    this.collectBetsIntoPot();

    if (this.pot <= 0) return false;

    const winningPlayers = this.players.filter(p => winnerIds.includes(p.id));
    if (winningPlayers.length === 0) return false;

    const splitAmount = Math.floor(this.pot / winningPlayers.length);
    let remainder = this.pot % winningPlayers.length;

    this.winners = [];
    winningPlayers.forEach((p, idx) => {
      let winTotal = splitAmount;
      if (remainder > 0) {
        winTotal += 1;
        remainder--;
      }
      p.chips += winTotal;
      this.winners.push({ id: p.id, name: p.name, amount: winTotal });
      this.log(`🏆 ${p.name} levou ${winTotal} fichas do pote!`);
    });

    this.pot = 0;
    this.state = 'HAND_OVER';
    this.currentTurnIndex = -1;
    return true;
  }

  forceAdvance() {
    if (this.state === 'LOBBY' || this.state === 'HAND_OVER') {
      return this.startNewHand();
    }
    this.advanceStreet();
    return true;
  }

  resetHand() {
    this.players.forEach(p => {
      p.chips += p.totalHandBet;
      p.currentBet = 0;
      p.totalHandBet = 0;
      p.folded = false;
      p.isAllIn = false;
      p.hasActed = false;
    });
    this.pot = 0;
    this.state = 'LOBBY';
    this.currentTurnIndex = -1;
    this.log('A mão foi cancelada pelo Host e todas as fichas foram devolvidas.');
  }

  getState() {
    const totalPot = this.pot + this.players.reduce((sum, p) => sum + p.currentBet, 0);

    let remainingSeconds = 0;
    if (this.currentTurnIndex >= 0 && this.state !== 'LOBBY' && this.state !== 'SHOWDOWN' && this.state !== 'HAND_OVER') {
      const elapsed = (Date.now() - this.turnStartTime) / 1000;
      remainingSeconds = Math.max(0, Math.ceil(this.turnTimeLimit - elapsed));
    }

    return {
      roomId: this.roomId,
      state: this.state,
      handNumber: this.handNumber,
      pot: totalPot,
      mainPot: this.pot,
      currentMaxBet: this.currentMaxBet,
      minRaise: this.minRaise,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      turnTimeLimit: this.turnTimeLimit,
      turnTimeRemaining: remainingSeconds,
      dealerIndex: this.dealerIndex,
      sbIndex: this.sbIndex,
      bbIndex: this.bbIndex,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: this.currentTurnIndex >= 0 && this.players[this.currentTurnIndex] ? this.players[this.currentTurnIndex].id : null,
      players: this.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet,
        totalHandBet: p.totalHandBet,
        folded: p.folded,
        isAllIn: p.isAllIn,
        isSittingOut: p.isSittingOut,
        isHost: p.isHost,
        avatarColor: p.avatarColor,
        isDealer: idx === this.dealerIndex,
        isSmallBlind: idx === this.sbIndex,
        isBigBlind: idx === this.bbIndex,
        isTurn: idx === this.currentTurnIndex
      })),
      actionLog: this.actionLog.slice(0, 15),
      lastAction: this.lastAction,
      winners: this.winners
    };
  }

  toJSON() {
    return {
      roomId: this.roomId,
      startingChips: this.startingChips,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      turnTimeLimit: this.turnTimeLimit,
      players: this.players,
      state: this.state,
      pot: this.pot,
      currentMaxBet: this.currentMaxBet,
      minRaise: this.minRaise,
      dealerIndex: this.dealerIndex,
      sbIndex: this.sbIndex,
      bbIndex: this.bbIndex,
      currentTurnIndex: this.currentTurnIndex,
      turnStartTime: this.turnStartTime,
      actionLog: this.actionLog,
      lastAction: this.lastAction,
      handNumber: this.handNumber,
      winners: this.winners
    };
  }

  static fromJSON(data) {
    const room = new PokerRoom(data.roomId, {
      startingChips: data.startingChips,
      smallBlind: data.smallBlind,
      bigBlind: data.bigBlind,
      turnTimeLimit: data.turnTimeLimit
    });
    room.players = data.players || [];
    room.state = data.state || 'LOBBY';
    room.pot = data.pot || 0;
    room.currentMaxBet = data.currentMaxBet || 0;
    room.minRaise = data.minRaise || 2;
    room.dealerIndex = data.dealerIndex || 0;
    room.sbIndex = data.sbIndex ?? -1;
    room.bbIndex = data.bbIndex ?? -1;
    room.currentTurnIndex = data.currentTurnIndex ?? -1;
    room.turnStartTime = data.turnStartTime || Date.now();
    room.actionLog = data.actionLog || [];
    room.lastAction = data.lastAction || null;
    room.handNumber = data.handNumber || 0;
    room.winners = data.winners || [];
    return room;
  }

  getRandomColor() {
    const colors = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

module.exports = PokerRoom;
