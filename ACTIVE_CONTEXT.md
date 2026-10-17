# 📋 ACTIVE_CONTEXT.md - Fichas de Poker

## 📌 Visão Geral do Projeto
Aplicativo web de alta performance para gerenciar **fichas e apostas de Poker (Texas Hold'em)** via celular e TV/PC em tempo real.
O objetivo é substituir fichas físicas de plástico quando os amigos jogam com **baralho físico real** na mesa.

* **GitHub:** [https://github.com/diogoksm-star/fichas-de-poker](https://github.com/diogoksm-star/fichas-de-poker)
* **Vercel Produção:** [https://fichas-de-poker.vercel.app](https://fichas-de-poker.vercel.app)
* **Tela da TV / Telão:** [https://fichas-de-poker.vercel.app/tv.html](https://fichas-de-poker.vercel.app/tv.html)
* **Celular dos Amigos:** [https://fichas-de-poker.vercel.app/play.html](https://fichas-de-poker.vercel.app/play.html)
* **Localhost:** `http://localhost:3000` (ou clique duplo em `iniciar-poker.bat`)

---

## 🛠️ Arquitetura & Tecnologias
* **Backend:** Node.js, Express, Socket.io, QRCode.
* **Frontend:** HTML5, Tailwind CSS, Lucide Icons, QRCode.js (CDN).
* **Áudio:** Web Audio API (sintetizador nativo sem arquivos externos para som de fichas, mesa, fold e vitória).
* **Banco de Dados Híbrido (`db.js`):**
  * PostgreSQL (Supabase / Neon / Vercel Postgres via `DATABASE_URL`).
  * JSON local automático em `./data/database.json` se rodar sem banco externo.
* **Persistência de Estado Serverless:** A sala inteira (`PokerRoom`) é serializada e salva no banco (`poker_room_state`) a cada ação, permitindo sincronização em tempo real entre diferentes instâncias serverless da Vercel.
* **Sincronização Híbrida (Dual-Sync):**
  * Local/Servidor Dedicado: WebSockets Socket.IO com 0ms de latência.
  * Nuvem Vercel Serverless: Polling REST de contingência (`/api/state`) a cada 1s caso o WebSocket desconecte.

---

## 🐛 Problemas Identificados e Soluções Aplicadas

### 1. Bug de travamento após a 1ª rodada de apostas
* **Causa 1:** Em ambientes serverless (Vercel), instâncias isoladas recriavam o objeto da sala em memória (`rooms = new Map()`), resetando o jogo ou perdendo os jogadores.
  * **Solução:** Implementamos `toJSON()` e `fromJSON()` no `poker-engine.js` e salvamento persistente no banco de dados (`db.saveRoomState` e `db.loadRoomState`).
* **Causa 2:** Quando sobravam menos de 2 jogadores ativos capazes de apostar (ex: all-in ou sobra de fichas), `advanceStreet()` definia `currentTurnIndex = -1` sem permitir navegação para o Showdown.
  * **Solução:** Corrigido o fluxo para permitir que a mão prossiga pelas cartas físicas até a revelação.

### 2. Timer de Ação por Turno
* **Solução:** Adicionado timer de 30 segundos por turno (configurável).
* Se o jogador não agir dentro do tempo limite, o sistema executa automaticamente:
  * **Check** (se a aposta necessária for 0).
  * **Fold** (se houver aposta pendente).
* Exibição visual de contagem regressiva na TV e no celular, com alerta vibratório nos últimos 5 segundos.

### 3. Controle de Cartas Físicas na Mesa (PC / TV)
* Adicionado painel visual com 5 cartas comunitárias físicas:
  * `[ Flop 1 ]  [ Flop 2 ]  [ Flop 3 ]   [ Turn 4ª ]   [ River 5ª ]`
  * As cartas acendem em verde esmeralda conforme são abertas na mesa real.
* Botões de navegação rápida de rua pelo Host no PC:
  * `Pré-Flop` ➔ `Flop (3)` ➔ `Turn (4ª)` ➔ `River (5ª)` ➔ `Showdown`.

### 4. Botão Direto para Decidir Vencedor
* Adicionado botão permanente **`🏆 Decidir Vencedor`** no topo da TV e ao lado do Pote.
* O Host pode clicar a **qualquer momento da mão** (mesmo antes do showdown formal), escolher quem ganhou a rodada real com o baralho físico (ou selecionar múltiplos para Split Pot) e o pote é transferido instantaneamente!

---

## 📂 Estrutura de Arquivos
```
FICHAS DE POKER/
├── server.js              # Servidor Express + Socket.IO + REST API + Timer Loop
├── poker-engine.js        # Regras completas de Texas Hold'em, Timer e Serialização
├── db.js                  # Camada de banco de dados (Postgres / JSON Local)
├── iniciar-poker.bat      # Launcher rápido de 2 cliques no Windows
├── vercel.json            # Configuração de deploy da Vercel
├── ACTIVE_CONTEXT.md      # Este documento de continuidade
├── README.md              # Documentação e regras do jogo
└── public/
    ├── index.html         # Landing page / seletor TV ou Celular
    ├── tv.html            # Telão da TV (Mesa oval, cartas, pote, QR code, ranking)
    ├── play.html          # Controle móvel do jogador (fichas, timer, apostas)
    ├── sound.js           # Sintetizador de efeitos sonoros Web Audio API
    └── css/style.css      # Estilização visual casino felt, animações e fichas
```

---

## 🚀 Como Continuar na Próxima Sessão
* O repositório está versionado e sincronizado com o GitHub (`diogoksm-star/fichas-de-poker`).
* O deploy de produção na Vercel atualiza automaticamente com `git push`.
