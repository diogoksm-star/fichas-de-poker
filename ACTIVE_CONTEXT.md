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

## 🚀 Melhorias e Correções Implementadas (Modelo Zynga Poker + Conexão Físico-Digital)

### 1. Desbloqueio Completo da Mesa para 2 Jogadores (Heads-Up)
* **Problema anterior:** A TV exibia a mensagem *"Aguardando amigos entrarem pelo celular (Mínimo 2 jogadores)"* e ficava presa no Lobby mesmo com 2 amigos conectados, porque só havia um botão pequeno de iniciar no topo do PC. Pelo celular, não havia como começar a mão!
* **Solução:**
  * **No Celular (`play.html`):** Adicionado card de Lobby inteligente com botão verde pulsante **"🟢 INICIAR PARTIDA (X Jogadores Prontos)"** visível para qualquer jogador no celular assim que houver 2 ou mais pessoas sentadas.
  * **Na TV (`tv.html`):** No centro da mesa, assim que 2 jogadores entram, o alerta de espera se transforma em um botão gigante **"🟢 COMEÇAR PARTIDA"**.
  * **Regras de Heads-Up (2 jogadores):** O Dealer é o Small Blind (SB) e fala primeiro no pré-flop; o Big Blind fala primeiro no pós-flop. Rotação automática de Dealer a cada nova mão.

### 2. A Ponte Físico-Digital (Assistente de Mesa e Baralho Real)
* Criado o banner **"🃏 Assistente de Cartas Físicas"** na TV e no Celular:
  * **Pré-Flop:** *"Dealer [Nome]: Embaralhe o baralho físico e distribua 2 cartas fechadas para cada jogador."*
  * **Flop:** *"Apostas pagas! Dealer: Queime 1 carta e abra o FLOP (3 cartas na mesa física)."*
  * **Turn:** *"Apostas pagas! Dealer: Queime 1 carta e abra o TURN (4ª carta na mesa física)."*
  * **River:** *"Apostas pagas! Dealer: Queime 1 carta e abra o RIVER (5ª carta na mesa física)."*
  * **Showdown:** *"🏆 SHOWDOWN: Revelem as cartas físicas na mesa! Decidam quem venceu a rodada."*

### 3. Controles de Aposta no Celular Estilo Zynga Poker
* Botões táteis com feedback sonoro e vibratório:
  * **FOLD (Vermelho):** Com proteção contra fold acidental (se for grátis dar Check, exibe modal de confirmação).
  * **CHECK / PAGAR (Verde / Âmbar):** Exibe exatamente quantas fichas faltam para pagar ou se é All-in.
  * **APOSTAR / AUMENTAR (Esmeralda):** Com atalhos instantâneos (`MÍN`, `2X`, `½ POTE`, `POTE`, `ALL-IN`) + botões `[-]` e `[+]` de ajuste fino ao lado do slider.
  * **Timer de 30 segundos:** Barra de progresso visual no celular e contagem regressiva pulsante na TV.

### 4. Decisão de Vencedor Direto pelo Celular
* Qualquer jogador na mesa pode tocar em **"🏆 Decidir Vencedor"** no celular a qualquer momento para abrir o seletor de quem teve a melhor mão de cartas físicas reais.
* Suporte a vitória única ou Split Pot (empate).
* Entrega do pote animada com som de vitória e botão **"🟢 Próxima Mão"** instantâneo no celular e na TV.

### 5. Layout Heads-Up Transmissão na TV
* Quando há 2 jogadores, a TV posiciona um na extrema esquerda (`14%`) e outro na extrema direita (`86%`), mantendo o centro 100% limpo para as cartas comunitárias, o pote e o timer.

---

## 📂 Estrutura de Arquivos
```
FICHAS DE POKER/
├── server.js              # Servidor Express + Socket.IO + REST API + Timer Loop
├── poker-engine.js        # Regras de Texas Hold'em, Heads-Up, Timer e Serialização
├── db.js                  # Camada de banco de dados (Postgres / JSON Local)
├── iniciar-poker.bat      # Launcher rápido de 2 cliques no Windows
├── vercel.json            # Configuração de deploy da Vercel
├── ACTIVE_CONTEXT.md      # Este documento de continuidade
├── README.md              # Documentação e regras do jogo
├── test-simulation.js     # Teste end-to-end de 2 jogadores (100% aprovado)
├── test-fold-allin.js     # Teste de fold e all-in (100% aprovado)
└── public/
    ├── index.html         # Landing page / seletor TV ou Celular
    ├── tv.html            # Telão da TV (Mesa oval, cartas, pote, QR code, ranking)
    ├── play.html          # Controle móvel Zynga Poker (fichas, timer, apostas, showdown)
    ├── sound.js           # Sintetizador de efeitos sonoros Web Audio API
    └── css/style.css      # Estilização visual casino felt, animações e fichas
```
