# ♠️ Fichas de Poker - Gerenciador em Tempo Real ♦️

Aplicativo web leve e em tempo real para gerenciar **fichas e apostas de poker** pelo celular e pela TV, feito sob medida para quando vocês têm o **baralho de cartas físico na mesa**, mas não possuem fichas de plástico.

---

## 🚀 Como Usar no Jogo

1. **Iniciar o Servidor:**
   * Basta dar dois cliques no arquivo `iniciar-poker.bat` ou executar:
     ```bash
     npm start
     ```
2. **Abrir na TV / Computador:**
   * No navegador da TV ou PC, acesse:
     ```text
     http://localhost:3000/tv.html
     ```
   * A tela mostrará a **Mesa Oval com feltro verde**, o **Pote Central**, o **Histórico de Apostas** e o **QR Code**.
3. **Conectar os Celulares:**
   * Cada jogador apenas aponta a câmera do celular para o **QR Code** na tela da TV (ou acessa o link exibido, ex: `http://192.168.0.109:3000/play.html`).
   * Digita o próprio **Nome** e clica em **Entrar**.
   * Não precisa de conta, e-mail nem senha!

---

## 🃏 Como Funciona a Rodada (Texas Hold'em)

1. **Cartas Físicas:**
   * Alguém embaralha e dá as cartas físicas normalmente na mesa real.
2. **Início da Mão:**
   * Na TV ou no celular do Host, clica-se em **Iniciar Mão**.
   * O sistema debita os **Blinds (Small Blind e Big Blind)** automaticamente e indica quem é o **Dealer (Botão D)**.
3. **Apostas pelo Celular:**
   * Quando for a vez do jogador:
     * O celular vibra e toca um sinal sonoro.
     * Os botões são liberados: **FOLD** (Desistir), **CHECK / CALL** (Passar / Pagar), **APOSTAR / RAISE** (com slider e atalhos de ½ Pote, Pote e All-In).
4. **Ruas do Poker:**
   * O pote vai acumulando no centro da mesa da TV em tempo real.
   * Conforme as apostas se igualam, a mesa avança: **Pré-Flop ➔ Flop ➔ Turn ➔ River ➔ Showdown**.
5. **Showdown (Revelação):**
   * Vocês mostram as cartas físicas na mesa real.
   * Clica-se em quem venceu a mão na tela (suporta **Split Pot** para empates).
   * O pote é transferido para o vencedor com som de comemoração!
6. **Recarga (Rebuy):**
   * Se alguém perder tudo e quiser continuar jogando, basta clicar em **+100 Fichas** no topo da tela do celular.

---

## 🛠️ Tecnologias Utilizadas
* **Backend:** Node.js, Express, Socket.IO, QRCode.
* **Frontend:** HTML5, Tailwind CSS, Lucide Icons.
* **Áudio:** Web Audio API (sons sintetizados de fichas, mesa e vitória com zero dependências externas).
