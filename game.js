(() => {
  "use strict";

  const CARD_TYPES = ["leao", "coelho", "vaca", "peixe", "coringa"];
  const COMMON_CARDS = CARD_TYPES.slice(0, 4);
  const CARDS = {
    leao: { name: "Leão", emoji: "🦁", color: "#e9a16f" },
    coelho: { name: "Coelho", emoji: "🐇", color: "#bd9bfa" },
    vaca: { name: "Vaca", emoji: "🐄", color: "#f0d477" },
    peixe: { name: "Peixe", emoji: "🐟", color: "#7ec9e8" },
    coringa: { name: "Coringa", emoji: "🃏", color: "#f1839a" }
  };
  const TURN_SECONDS = 60;
  const CARD_WIDTH = 106;
  const CARD_HEIGHT = 146;
  const MAX_FACE_DOWN_CARDS = 20;
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const actionArea = document.querySelector("#action-area");
  const turnLabel = document.querySelector("#turn-label");
  const turnMessage = document.querySelector("#turn-message");
  const timer = document.querySelector("#timer");
  const timerValue = document.querySelector("#timer-value");
  const roundNumber = document.querySelector("#round-number");
  const gameLog = document.querySelector("#game-log");
  const rulesDialog = document.querySelector("#rules-dialog");

  let state;
  let clockInterval;
  let aiTimeout;
  let dealInterval;
  let hoverCard = -1;

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function createHand() {
    return Array.from({ length: 7 }, () => (
      COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)]
    ));
  }

  function makePlayer(name) {
    return { name, hp: 5, luck: 0, hand: createHand() };
  }

  function clearGameTimers() {
    window.clearInterval(clockInterval);
    window.clearInterval(dealInterval);
    window.clearTimeout(aiTimeout);
  }

  function startGame() {
    clearGameTimers();
    hoverCard = -1;
    state = {
      players: { player: makePlayer("Você"), ai: makePlayer("IA") },
      phase: "dealing",
      round: 1,
      seconds: TURN_SECONDS,
      pending: null,
      lastReveal: null,
      playerPlayHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      playerGuessHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      aiPlayHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      eliminated: null,
      hintUsed: false,
      gameOver: false,
      dealt: { player: 0, ai: 0 },
      coinFrame: 0,
      startingPlayer: null,
      aiInitiallyHadJoker: false,
      message: "Embaralhando e distribuindo 7 cartas para cada jogador...",
      log: "As cartas estão sendo embaralhadas."
    };

    if (Math.random() < 0.02) {
      const recipient = Math.random() < 0.5 ? state.players.player : state.players.ai;
      const replacementIndex = Math.floor(Math.random() * recipient.hand.length);
      recipient.hand[replacementIndex] = "coringa";
      state.log = "Um Coringa foi embaralhado na partida.";
    }
    state.aiInitiallyHadJoker = state.players.ai.hand.includes("coringa");

    render();
    animateDeal();
  }

  function animateDeal() {
    const drawOrder = shuffle([
      ...Array.from({ length: 7 }, () => "player"),
      ...Array.from({ length: 7 }, () => "ai")
    ]);
    let drawIndex = 0;
    dealInterval = window.setInterval(() => {
      if (drawIndex < drawOrder.length) {
        state.dealt[drawOrder[drawIndex]] += 1;
        drawIndex += 1;
        state.message = `Distribuindo cartas... ${state.dealt.player + state.dealt.ai}/14`;
        state.log = "Cada jogador recebe 7 cartas sorteadas.";
        render();
        return;
      }

      state.phase = "coin-toss";
      state.message = "Sorteando quem começa...";
      state.log = "A partida vai começar.";
      state.coinFrame = 0;
      render();
      window.clearInterval(dealInterval);
      dealInterval = window.setInterval(() => {
        state.coinFrame += 1;
        render();
        if (state.coinFrame < 10) return;

        window.clearInterval(dealInterval);
        state.startingPlayer = Math.random() < 0.5 ? "player" : "ai";
        const starter = state.players[state.startingPlayer].name;
        state.log = `O sorteio decidiu: ${starter} começa.`;
        if (state.startingPlayer === "player") {
          state.phase = "player-play";
          state.message = "Você começa! Clique em uma das suas cartas para jogá-la.";
          beginTimedPhase();
          render();
        } else {
          state.message = "A IA começa! Prepare-se para adivinhar.";
          render();
          aiTimeout = window.setTimeout(startAiTurn, 700);
        }
      }, 120);
    }, 105);
  }

  function beginTimedPhase() {
    window.clearInterval(clockInterval);
    state.seconds = TURN_SECONDS;
    clockInterval = window.setInterval(() => {
      if (state.gameOver || !["player-play", "player-guess"].includes(state.phase)) return;
      state.seconds -= 1;
      if (state.seconds <= 0) {
        state.seconds = 0;
        window.clearInterval(clockInterval);
        onTimeout();
      }
      updateTimer();
    }, 1000);
  }

  function onTimeout() {
    if (state.phase === "player-play") {
      const hand = state.players.player.hand;
      const type = hand[Math.floor(Math.random() * hand.length)];
      state.log = `O tempo acabou. Você jogou ${CARDS[type].name} automaticamente.`;
      playCard("player", type);
    } else if (state.phase === "player-guess") {
      const choices = CARD_TYPES.filter((type) => type !== state.eliminated);
      const guess = choices[Math.floor(Math.random() * choices.length)];
      state.log = `O tempo acabou. Seu palpite foi ${CARDS[guess].name}.`;
      resolveGuess("player", guess);
    }
  }

  function drawBonusCards(playerKey, count) {
    const player = state.players[playerKey];
    const drawn = [];
    for (let index = 0; index < count; index += 1) {
      const type = COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)];
      player.hand.push(type);
      drawn.push(type);
    }
    return drawn;
  }

  function playCard(playerKey, type) {
    if (state.gameOver) return;
    const player = state.players[playerKey];
    const cardIndex = player.hand.indexOf(type);
    if (cardIndex < 0) return;

    window.clearInterval(clockInterval);
    player.hand.splice(cardIndex, 1);
    if (playerKey === "player") state.playerPlayHistory[type] += 1;
    if (playerKey === "ai") state.aiPlayHistory[type] += 1;

    state.pending = { owner: playerKey, type };
    state.lastReveal = null;
    state.eliminated = null;
    state.hintUsed = false;

    if (playerKey === "player") {
      state.phase = "ai-guess";
      state.message = "A IA está analisando suas jogadas anteriores...";
      render();
      aiTimeout = window.setTimeout(aiMakeGuess, 900);
      return;
    }

    state.phase = "player-guess";
    state.message = "A IA jogou uma carta virada para baixo. Qual carta é?";
    beginTimedPhase();
    render();
  }

  function probabilityOfPlayerCard() {
    const weights = {};
    for (const type of CARD_TYPES) {
      if (type === "coringa") {
        const aiHasJoker = state.aiInitiallyHadJoker;
        const playerUsedJoker = state.playerPlayHistory.coringa > 0;
        weights[type] = aiHasJoker || playerUsedJoker ? 0 : 0.04;
      } else {
        weights[type] = 1 + state.playerPlayHistory[type] * 1.3;
      }
    }
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(Object.entries(weights).map(([type, value]) => [type, value / total]));
  }

  function sampleByScore(options, getScore, temperature) {
    const scores = options.map(getScore);
    const maximum = Math.max(...scores);
    const weights = scores.map((score) => Math.exp((score - maximum) / temperature));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let threshold = Math.random() * total;
    for (let index = 0; index < options.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) return options[index];
    }
    return options[options.length - 1];
  }

  function chooseGuess(probabilities, useLuck) {
    const available = [...CARD_TYPES];
    if (useLuck) {
      const leastLikely = available
        .filter((type) => probabilities[type] > 0)
        .sort((a, b) => probabilities[a] - probabilities[b])[0];
      if (leastLikely && available.length > 1) available.splice(available.indexOf(leastLikely), 1);
    }

    return sampleByScore(available, (guess) => {
      let value = 0;
      for (const actual of CARD_TYPES) {
        const chance = probabilities[actual];
        if (actual === "coringa") {
          value -= chance * 0.65;
        } else if (actual === "leao" && guess !== actual) {
          value -= chance * 2;
        } else if (actual === "vaca" && guess !== actual) {
          value += chance * 1.2;
        } else if (actual === "coelho" && guess === actual) {
          value += chance * 0.45;
        }
      }
      return value;
    }, 0.8);
  }

  function aiMakeGuess() {
    if (state.gameOver || state.phase !== "ai-guess") return;
    const ai = state.players.ai;
    const probabilities = probabilityOfPlayerCard();
    const useLuck = ai.luck > 0 && Math.random() < 0.65;
    if (useLuck) ai.luck -= 1;
    const guess = chooseGuess(probabilities, useLuck);
    state.log = `A IA usou ${useLuck ? "um ponto de sorte e " : ""}seu histórico para decidir.`;
    resolveGuess("ai", guess);
  }

  function useLuck() {
    if (state.phase !== "player-guess" || state.players.player.luck < 1 || state.hintUsed) return;
    const wrongOptions = CARD_TYPES.filter((type) => type !== state.pending.type && type !== state.eliminated);
    if (wrongOptions.length === 0) return;
    state.eliminated = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    state.hintUsed = true;
    state.players.player.luck -= 1;
    state.log = `Sua sorte revelou que não é ${CARDS[state.eliminated].name}.`;
    render();
  }

  function resolveGuess(guesserKey, guess) {
    if (state.gameOver || !state.pending) return;
    window.clearInterval(clockInterval);
    const { owner, type: actualType } = state.pending;
    const guesser = state.players[guesserKey];
    const playedBy = state.players[owner];
    let correct = guess === actualType;
    let detail = "";
    let bonusCards = [];

    if (guesserKey === "player") state.playerGuessHistory[guess] += 1;

    if (actualType === "coringa") {
      const alternatives = COMMON_CARDS.filter((type) => type !== guess);
      const swappedTo = alternatives[Math.floor(Math.random() * alternatives.length)] || COMMON_CARDS[0];
      correct = false;
      guesser.hp -= 1;
      bonusCards = drawBonusCards(guesserKey, 3);
      detail = `O Coringa trocou o palpite para ${CARDS[swappedTo].name}. Você perde 1 vida e recebe 3 cartas bônus.`;
    } else if (!correct && actualType === "leao") {
      guesser.hp -= 2;
      detail = `${guesser.name} errou e perdeu 2 vidas.`;
    } else if (correct && actualType === "coelho") {
      guesser.luck += 1;
      detail = `${guesser.name} acertou e ganhou 1 ponto de sorte.`;
    } else if (!correct && actualType === "vaca") {
      bonusCards = drawBonusCards(guesserKey, 2);
      detail = `${guesser.name} errou e recebeu 2 cartas bônus.`;
    } else if (actualType === "peixe") {
      detail = "Peixe: nenhum efeito especial.";
    } else {
      detail = correct ? `${guesser.name} acertou o palpite.` : `${guesser.name} errou o palpite.`;
    }

    state.phase = "result";
    state.lastReveal = { owner, actualType, guess, correct, detail };
    state.pending = null;
    state.message = actualType === "coringa"
      ? "O Coringa mudou as regras do palpite!"
      : `${correct ? "Acertou!" : "Não foi dessa vez."} ${detail}`;
    state.log = `${playedBy.name} revelou ${CARDS[actualType].name}. ${detail}`;

    if (guesser.hp <= 0) {
      guesser.hp = 0;
      endGame(owner, `${playedBy.name} venceu: ${guesser.name} ficou sem vidas.`);
    } else if (playedBy.hand.length === 0) {
      endGame(owner, `${playedBy.name} venceu: ficou sem cartas na mão.`);
    }
    render();
  }

  function endGame(winnerKey, reason) {
    state.phase = "game-over";
    state.gameOver = true;
    state.winner = winnerKey;
    state.message = winnerKey === "player" ? `Vitória! ${reason}` : `Fim de jogo. ${reason}`;
    state.log = reason;
  }

  function continueAfterResult() {
    if (state.phase !== "result") return;
    if (state.lastReveal.owner === "player") {
      startAiTurn();
      return;
    }
    state.round += 1;
    state.phase = "player-play";
    state.message = "Sua vez! Clique em uma das suas cartas para jogá-la.";
    state.log = `Rodada ${state.round}. Sua vez de jogar.`;
    beginTimedPhase();
    render();
  }

  function startAiTurn() {
    if (state.gameOver) return;
    if (state.players.ai.hand.length === 0) {
      endGame("ai", "A IA venceu: ficou sem cartas na mão.");
      render();
      return;
    }
    state.phase = "ai-play";
    state.message = "A IA está escolhendo uma carta...";
    render();
    aiTimeout = window.setTimeout(() => {
      if (state.gameOver || state.phase !== "ai-play") return;
      const type = chooseAiCard();
      state.log = "A IA escolheu uma carta usando estratégia e um pouco de imprevisibilidade.";
      playCard("ai", type);
    }, 800);
  }

  function chooseAiCard() {
    const hand = state.players.ai.hand;
    const guessCounts = state.playerGuessHistory;
    const totalGuesses = Object.values(guessCounts).reduce((sum, value) => sum + value, 0);
    const guessProbability = Object.fromEntries(CARD_TYPES.map((type) => [
      type,
      (guessCounts[type] + 1) / (totalGuesses + CARD_TYPES.length)
    ]));
    const playerIsWeak = state.players.player.hp <= 2;
    const scores = {
      leao: 2 * (1 - guessProbability.leao) + (playerIsWeak ? 0.7 : 0) - state.aiPlayHistory.leao * 0.4,
      coelho: -0.45 * guessProbability.coelho - state.aiPlayHistory.coelho * 0.4,
      vaca: -0.45 * (1 - guessProbability.vaca) - state.aiPlayHistory.vaca * 0.4,
      peixe: 0.05 - state.aiPlayHistory.peixe * 0.4,
      coringa: 0.25 - state.aiPlayHistory.coringa * 0.4
    };

    if (Math.random() < 0.65) return hand[Math.floor(Math.random() * hand.length)];
    return sampleByScore(hand, (type) => scores[type], 1.6);
  }

  function render() {
    drawTable();
    updateTimer();
    roundNumber.textContent = String(state.round);
    turnMessage.textContent = state.message;
    gameLog.textContent = state.log;
    renderActions();
    canvas.setAttribute("aria-label", getCanvasDescription());
  }

  function getCanvasDescription() {
    const playerCards = state.players.player.hand.length;
    const aiCards = state.players.ai.hand.length;
    return `Mesa de cartas. Você tem ${playerCards} cartas e ${state.players.player.hp} vidas. A IA tem ${aiCards} cartas e ${state.players.ai.hp} vidas. ${state.message}`;
  }

  function renderActions() {
    actionArea.replaceChildren();
    turnLabel.textContent = ["player-play", "player-guess"].includes(state.phase)
      ? "SUA VEZ"
      : ["result", "game-over"].includes(state.phase) ? "RESULTADO" : "VEZ DA IA";

    if (state.phase === "player-play") {
      addCaption("CLIQUE EM UMA DAS SUAS CARTAS NA MESA PARA JOGAR");
    } else if (state.phase === "player-guess") {
      addCaption("QUAL CARTA A IA JOGOU?");
      for (const type of CARD_TYPES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "guess-button";
        button.disabled = type === state.eliminated;
        button.textContent = `${CARDS[type].emoji} ${CARDS[type].name}`;
        button.addEventListener("click", () => resolveGuess("player", type));
        actionArea.append(button);
      }
      const hint = document.createElement("button");
      hint.type = "button";
      hint.className = "hint-button";
      hint.disabled = state.players.player.luck < 1 || state.hintUsed;
      hint.textContent = `✦ Usar sorte (${state.players.player.luck})`;
      hint.addEventListener("click", useLuck);
      actionArea.append(hint);
    } else if (state.phase === "result") {
      addCaption(`CARTA REVELADA: ${CARDS[state.lastReveal.actualType].emoji} ${CARDS[state.lastReveal.actualType].name}`);
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary-button";
      next.textContent = "Continuar →";
      next.addEventListener("click", continueAfterResult);
      actionArea.append(next);
    } else if (state.phase === "game-over") {
      addCaption("FIM DE JOGO");
      const restart = document.createElement("button");
      restart.type = "button";
      restart.className = "primary-button";
      restart.textContent = "Jogar novamente";
      restart.addEventListener("click", startGame);
      actionArea.append(restart);
    } else if (state.phase === "dealing") {
      addCaption("EMBARALHANDO E DISTRIBUINDO AS CARTAS...");
    } else if (state.phase === "coin-toss") {
      addCaption("SORTEANDO QUEM COMEÇA...");
    } else {
      addCaption(state.phase === "ai-guess" ? "A IA ESTÁ PENSANDO..." : "A IA ESTÁ ESCOLHENDO UMA CARTA...");
    }
  }

  function addCaption(text) {
    const caption = document.createElement("p");
    caption.className = "action-caption";
    caption.textContent = text;
    actionArea.append(caption);
  }

  function updateTimer() {
    timerValue.textContent = String(state.seconds);
    timer.classList.toggle("is-low", state.seconds <= 10);
    timer.hidden = !["player-play", "player-guess"].includes(state.phase);
  }

  function drawTable() {
    const ctx = context;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const felt = ctx.createLinearGradient(0, 0, 0, height);
    felt.addColorStop(0, "#205347");
    felt.addColorStop(1, "#173d35");
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "#d4e4b7";
    ctx.lineWidth = 1;
    for (let x = 20; x < width; x += 38) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(width / 2, height / 2, 25, width / 2, height / 2, 430);
    glow.addColorStop(0, "rgba(181, 222, 155, .08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(207, 231, 183, .28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2 + 5, 466, 239, 0, 0, Math.PI * 2);
    ctx.stroke();

    drawPlayerPanel(ctx, 22, 24, state.players.ai, "OPONENTE", false);
    drawPlayerPanel(ctx, 916, 524, state.players.player, "VOCÊ", true);
    drawAiHand(ctx);
    drawCenter(ctx, width / 2, 326);
    drawPlayerHand(ctx);

    ctx.fillStyle = "rgba(233, 243, 224, .72)";
    ctx.font = "11px Consolas, monospace";
    ctx.textAlign = "center";
    const phaseText = state.phase === "dealing" ? "EMBARALHANDO AS CARTAS"
      : state.phase === "coin-toss" ? "SORTEANDO QUEM COMEÇA"
        : state.phase === "player-play" ? "SUA VEZ DE JOGAR"
          : state.phase === "player-guess" ? "SUA VEZ DE ADIVINHAR"
            : ["result", "game-over"].includes(state.phase) ? "CARTA REVELADA"
              : "A IA ESTÁ PENSANDO";
    ctx.fillText(phaseText, width / 2, 250);

    if (state.phase === "coin-toss") drawCoin(ctx, width / 2, 326);

    if (state.lastReveal && ["result", "game-over"].includes(state.phase)) {
      ctx.fillStyle = "rgba(11, 24, 23, .82)";
      roundRect(ctx, width / 2 - 200, 425, 400, 48, 9);
      ctx.fill();
      ctx.fillStyle = "#ecf2e6";
      ctx.font = "12px 'Segoe UI', sans-serif";
      ctx.fillText(state.lastReveal.detail, width / 2, 454, 370);
    }
  }

  function drawPlayerPanel(ctx, x, y, player, label, isPlayer) {
    ctx.save();
    ctx.fillStyle = "rgba(15, 33, 29, .72)";
    roundRect(ctx, x, y, 162, 91, 10);
    ctx.fill();
    ctx.strokeStyle = isPlayer ? "rgba(201, 239, 116, .4)" : "rgba(231, 243, 229, .14)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, 162, 91, 10);
    ctx.stroke();

    ctx.fillStyle = isPlayer ? "#c9ef74" : "#b5d5c7";
    ctx.textAlign = "left";
    ctx.font = "9px Consolas, monospace";
    ctx.fillText(label, x + 11, y + 17);
    ctx.fillStyle = "#f4f4e9";
    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.fillText(player.name, x + 11, y + 37);
    ctx.fillStyle = "#ef806f";
    ctx.font = "12px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
    ctx.fillText(`${"♥".repeat(player.hp)}${"♡".repeat(5 - player.hp)}`, x + 11, y + 57);
    ctx.fillStyle = "#a9bdba";
    ctx.font = "9px Consolas, monospace";
    ctx.fillText(`${player.hp}/5 VIDAS`, x + 11, y + 75);
    ctx.textAlign = "right";
    ctx.fillStyle = "#e5eddf";
    ctx.fillText(`${player.hand.length} CARTAS`, x + 151, y + 75);
    if (player.luck > 0) {
      ctx.fillStyle = "#d9c477";
      ctx.fillText(`✦ ${player.luck}`, x + 151, y + 19);
    }
    ctx.restore();
  }

  function drawAiHand(ctx) {
    const handSize = state.phase === "dealing" ? state.dealt.ai : state.players.ai.hand.length;
    const visibleCount = Math.min(handSize, MAX_FACE_DOWN_CARDS);
    const cardWidth = 94;
    const cardHeight = 132;
    const spacing = visibleCount > 1 ? Math.min(38, 670 / (visibleCount - 1)) : 0;
    const startX = 550 - ((visibleCount - 1) * spacing) / 2;

    for (let index = 0; index < visibleCount; index += 1) {
      const normalized = visibleCount > 1 ? (index / (visibleCount - 1)) * 2 - 1 : 0;
      const x = startX + index * spacing;
      const y = 88 + Math.abs(normalized) * 9;
      drawCard(ctx, x - cardWidth / 2, y - cardHeight / 2, null, cardWidth, cardHeight);
    }

    if (handSize > 0) {
      ctx.fillStyle = "rgba(226, 238, 221, .72)";
      ctx.font = "9px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(handSize > MAX_FACE_DOWN_CARDS ? `${MAX_FACE_DOWN_CARDS} CARTAS VIRADAS · +${handSize - MAX_FACE_DOWN_CARDS}` : "CARTAS DA IA · VIRADAS PARA BAIXO", 550, 170);
    }
  }

  function getPlayerCardLayouts() {
    const hand = state.players.player.hand;
    const visibleCount = state.phase === "dealing" ? state.dealt.player : hand.length;
    const layouts = [];
    const spacing = visibleCount > 1 ? Math.min(90, 590 / (visibleCount - 1)) : 0;
    const startX = 550 - ((visibleCount - 1) * spacing) / 2;

    for (let index = 0; index < visibleCount; index += 1) {
      const normalized = visibleCount > 1 ? (index / (visibleCount - 1)) * 2 - 1 : 0;
      layouts.push({
        index,
        x: startX + index * spacing,
        y: 536 + Math.abs(normalized) * 17,
        angle: normalized * 0.38,
        type: hand[index]
      });
    }
    return layouts;
  }

  function drawPlayerHand(ctx) {
    const canPlay = state.phase === "player-play";
    for (const layout of getPlayerCardLayouts()) {
      const hovered = canPlay && layout.index === hoverCard;
      drawCard(
        ctx,
        layout.x - CARD_WIDTH / 2,
        layout.y - CARD_HEIGHT / 2 - (hovered ? 15 : 0),
        layout.type,
        CARD_WIDTH,
        CARD_HEIGHT,
        layout.angle,
        hovered
      );
    }
    if (state.players.player.hand.length > 0) {
      ctx.fillStyle = "rgba(226, 238, 221, .76)";
      ctx.font = "9px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(canPlay ? "SUAS CARTAS · CLIQUE PARA JOGAR" : "SUA MÃO", 550, 644);
    }
  }

  function drawCenter(ctx, centerX, centerY) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(13, 30, 25, .24)";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 45, 114, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    const visibleCard = state.lastReveal && ["result", "game-over"].includes(state.phase)
      ? state.lastReveal.actualType
      : null;
    drawCard(ctx, centerX - 50, centerY - 72, visibleCard, 100, 144);
    ctx.fillStyle = "rgba(226, 238, 221, .72)";
    ctx.font = "10px Consolas, monospace";
    ctx.fillText(visibleCard ? CARDS[visibleCard].name.toUpperCase() : "CARTA JOGADA", centerX, centerY + 91);
    ctx.restore();
  }

  function drawCard(ctx, x, y, type, width, height, angle = 0, highlighted = false) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(angle);
    ctx.shadowColor = "rgba(0, 0, 0, .35)";
    ctx.shadowBlur = highlighted ? 21 : 13;
    ctx.shadowOffsetY = highlighted ? 10 : 6;
    ctx.fillStyle = type ? "#f5f0df" : "#203f38";
    roundRect(ctx, -width / 2, -height / 2, width, height, 10);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = highlighted ? 3 : 2;
    ctx.strokeStyle = type ? "rgba(28, 44, 38, .2)" : "rgba(208, 235, 190, .65)";
    roundRect(ctx, -width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 8);
    ctx.stroke();

    if (type) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#24312b";
      ctx.font = `${Math.round(width * 0.43)}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;
      ctx.fillText(CARDS[type].emoji, 0, 8);
      ctx.fillStyle = CARDS[type].color;
      ctx.fillRect(-width * 0.34, height * 0.33, width * 0.68, 5);
      ctx.fillStyle = "#35443d";
      ctx.font = `bold ${Math.max(9, Math.round(width * 0.105))}px 'Segoe UI', sans-serif`;
      ctx.fillText(CARDS[type].name.toUpperCase(), 0, height * 0.28);
    } else {
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(201, 239, 116, .47)";
      ctx.lineWidth = 1;
      ctx.save();
      roundRect(ctx, -width / 2 + 5, -height / 2 + 5, width - 10, height - 10, 7);
      ctx.clip();
      for (let offset = -width; offset <= width; offset += 17) {
        ctx.beginPath();
        ctx.moveTo(-width / 2 + 10, offset);
        ctx.lineTo(width / 2 - 10, offset + 45);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(width / 2 - 10, offset);
        ctx.lineTo(-width / 2 + 10, offset + 45);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#c9ef74";
      ctx.font = `${Math.round(width * 0.22)}px Georgia, serif`;
      ctx.fillText("✦", 0, 9);
    }
    ctx.restore();
  }

  function drawCoin(ctx, x, y) {
    const squash = Math.max(0.12, Math.abs(Math.cos(state.coinFrame * Math.PI / 2)));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, 1);
    ctx.shadowColor = "rgba(0, 0, 0, .4)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = state.coinFrame % 2 === 0 ? "#d9c477" : "#c9ef74";
    ctx.beginPath();
    ctx.arc(0, 0, 43, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#fff1bd";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#314331";
    ctx.font = "bold 25px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(state.coinFrame % 2 === 0 ? "?" : "✦", 0, 9);
    ctx.restore();
  }

  function handleCanvasPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const layouts = getPlayerCardLayouts();
    let hitIndex = -1;

    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      const layout = layouts[index];
      const dx = x - layout.x;
      const dy = y - layout.y;
      const localX = dx * Math.cos(layout.angle) + dy * Math.sin(layout.angle);
      const localY = -dx * Math.sin(layout.angle) + dy * Math.cos(layout.angle);
      if (Math.abs(localX) <= CARD_WIDTH / 2 && Math.abs(localY) <= CARD_HEIGHT / 2) {
        hitIndex = layout.index;
        break;
      }
    }

    if (state.phase === "player-play" && hitIndex >= 0) {
      playCard("player", state.players.player.hand[hitIndex]);
      return;
    }
    if (hoverCard !== hitIndex) {
      hoverCard = hitIndex;
      canvas.style.cursor = state.phase === "player-play" && hitIndex >= 0 ? "pointer" : "default";
      if (state.phase === "player-play") drawTable();
    }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  canvas.addEventListener("pointermove", handleCanvasPointer);
  canvas.addEventListener("pointerleave", () => {
    hoverCard = -1;
    canvas.style.cursor = "default";
    if (state.phase === "player-play") drawTable();
  });
  canvas.addEventListener("click", handleCanvasPointer);
  canvas.addEventListener("keydown", (event) => {
    if (!["player-play", "dealing"].includes(state.phase) || !/^[1-9]$/.test(event.key)) return;
    const cardIndex = Number(event.key) - 1;
    const card = state.players.player.hand[cardIndex];
    if (!card || state.phase !== "player-play") return;
    playCard("player", card);
  });

  document.querySelector("#restart-button").addEventListener("click", startGame);
  document.querySelector("#rules-button").addEventListener("click", () => rulesDialog.showModal());
  document.querySelector("#close-rules").addEventListener("click", () => rulesDialog.close());
  rulesDialog.addEventListener("click", (event) => {
    if (event.target === rulesDialog) rulesDialog.close();
  });

  startGame();
})();
