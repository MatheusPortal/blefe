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

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function createHand() {
    const hand = [];
    for (const type of COMMON_CARDS) {
      const count = 2 + Math.floor(Math.random() * 2);
      for (let index = 0; index < count; index += 1) hand.push(type);
    }
    return shuffle(hand);
  }

  function makePlayer(name) {
    return { name, hp: 5, luck: 0, hand: createHand(), discard: [] };
  }

  function startGame() {
    window.clearInterval(clockInterval);
    window.clearTimeout(aiTimeout);
    state = {
      players: { player: makePlayer("Você"), ai: makePlayer("IA") },
      phase: "player-play",
      round: 1,
      seconds: TURN_SECONDS,
      pending: null,
      lastReveal: null,
      lastBonus: null,
      playerPlayHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      playerGuessHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      eliminated: null,
      hintUsed: false,
      gameOver: false,
      message: "Escolha uma carta para jogar virada para baixo.",
      log: "A partida começou. Escolha sua primeira carta."
    };

    if (Math.random() < 0.02) {
      const recipient = Math.random() < 0.5 ? state.players.player : state.players.ai;
      recipient.hand.push("coringa");
      recipient.hand = shuffle(recipient.hand);
      state.log = `Um Coringa apareceu no jogo e foi para a mão de ${recipient.name}.`;
    }

    beginTimedPhase();
    render();
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
      ensureHand("player");
      const type = state.players.player.hand[Math.floor(Math.random() * state.players.player.hand.length)];
      state.log = `O tempo acabou. Você jogou ${CARDS[type].name} automaticamente.`;
      playCard("player", type);
    } else if (state.phase === "player-guess") {
      const choices = CARD_TYPES.filter((type) => type !== state.eliminated);
      const guess = choices[Math.floor(Math.random() * choices.length)];
      state.log = `O tempo acabou. Seu palpite foi ${CARDS[guess].name}.`;
      resolveGuess("player", guess);
    }
  }

  function ensureHand(playerKey) {
    const player = state.players[playerKey];
    if (player.hand.length > 0) return;
    player.hand = shuffle(player.discard);
    player.discard = [];
    if (player.hand.length === 0) {
      player.hand = [COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)]];
    }
    state.log = `${player.name} embaralhou as cartas jogadas e as colocou de volta na mão.`;
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
    player.discard.push(type);
    if (playerKey === "player") state.playerPlayHistory[type] += 1;

    state.pending = { owner: playerKey, type };
    state.lastReveal = null;
    state.lastBonus = null;
    state.eliminated = null;
    state.hintUsed = false;

    if (playerKey === "player") {
      state.phase = "ai-guess";
      state.message = "A IA está analisando suas jogadas anteriores...";
      render();
      aiTimeout = window.setTimeout(aiMakeGuess, 950);
      return;
    }

    state.phase = "player-guess";
    state.message = "A IA jogou uma carta. Qual você acha que é?";
    beginTimedPhase();
    render();
  }

  function probabilityOfPlayerCard() {
    const weights = {};
    for (const type of CARD_TYPES) {
      const played = state.playerPlayHistory[type];
      weights[type] = type === "coringa" ? Math.max(0.08, 0.2 - played) : Math.max(0.2, 2.5 - played);
    }
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(Object.entries(weights).map(([type, value]) => [type, value / total]));
  }

  function chooseGuess(probabilities, actualType, useLuck) {
    const available = [...CARD_TYPES];
    if (useLuck) {
      const falseOptions = available.filter((type) => type !== actualType);
      const leastLikely = falseOptions.sort((a, b) => probabilities[a] - probabilities[b])[0];
      available.splice(available.indexOf(leastLikely), 1);
    }

    const expectedValue = (guess) => {
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
    };
    return available.sort((a, b) => expectedValue(b) - expectedValue(a))[0];
  }

  function aiMakeGuess() {
    if (state.gameOver || state.phase !== "ai-guess") return;
    const probabilities = probabilityOfPlayerCard();
    const ai = state.players.ai;
    const useLuck = ai.luck > 0;
    if (useLuck) ai.luck -= 1;
    const guess = chooseGuess(probabilities, state.pending.type, useLuck);
    state.log = `A IA usou ${useLuck ? "1 ponto de sorte e " : ""}suas jogadas anteriores para escolher.`;
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
    let swappedTo = null;
    let bonusCards = [];

    if (guesserKey === "player") state.playerGuessHistory[guess] += 1;

    if (actualType === "coringa") {
      const alternatives = COMMON_CARDS.filter((type) => type !== guess);
      swappedTo = alternatives[Math.floor(Math.random() * alternatives.length)] || COMMON_CARDS[0];
      correct = false;
      guesser.hp -= 1;
      bonusCards = drawBonusCards(guesserKey, 3);
      detail = `O Coringa trocou seu palpite de ${CARDS[guess].name} para ${CARDS[swappedTo].name}. Você perde 1 vida e recebe 3 cartas bônus (${bonusCards.map((type) => CARDS[type].name).join(", ")}).`;
    } else if (!correct && actualType === "leao") {
      guesser.hp -= 2;
      detail = `${guesser.name} errou e perdeu 2 vidas.`;
    } else if (correct && actualType === "coelho") {
      guesser.luck += 1;
      detail = `${guesser.name} acertou e ganhou 1 ponto de sorte.`;
    } else if (!correct && actualType === "vaca") {
      bonusCards = drawBonusCards(guesserKey, 2);
      detail = `${guesser.name} errou e recebeu 2 cartas bônus (${bonusCards.map((type) => CARDS[type].name).join(", ")}).`;
    } else if (actualType === "peixe") {
      detail = "Peixe: nenhum efeito especial.";
    } else {
      detail = correct ? `${guesser.name} acertou o palpite.` : `${guesser.name} errou o palpite.`;
    }

    state.phase = "result";
    state.lastReveal = { owner, actualType, guess, correct, swappedTo, detail };
    state.lastBonus = bonusCards.length ? { playerKey: guesserKey, cards: bonusCards } : null;
    state.pending = null;
    state.message = actualType === "coringa"
      ? "O Coringa mudou as regras do palpite!"
      : `${correct ? "Acertou!" : "Não foi dessa vez."} ${detail}`;
    state.log = `${playedBy.name} revelou ${CARDS[actualType].name}. ${detail}`;

    if (guesser.hp <= 0) {
      guesser.hp = 0;
      state.gameOver = true;
      state.phase = "game-over";
      state.message = guesserKey === "player" ? "Fim de jogo. A IA venceu desta vez." : "Vitória! Você venceu o duelo.";
    }
    render();
  }

  function continueAfterResult() {
    if (state.phase !== "result") return;
    if (state.lastReveal.owner === "player") {
      startAiTurn();
    } else {
      state.round += 1;
      state.phase = "player-play";
      state.message = "Escolha uma carta para jogar virada para baixo.";
      state.log = `Rodada ${state.round}. Sua vez de jogar.`;
      ensureHand("player");
      beginTimedPhase();
      render();
    }
  }

  function startAiTurn() {
    state.phase = "ai-play";
    state.message = "A IA está escolhendo uma carta...";
    render();
    aiTimeout = window.setTimeout(() => {
      if (state.gameOver || state.phase !== "ai-play") return;
      ensureHand("ai");
      const type = chooseAiCard();
      state.log = "A IA escolheu uma carta de acordo com seu histórico de palpites.";
      playCard("ai", type);
    }, 850);
  }

  function chooseAiCard() {
    const ai = state.players.ai;
    const guessCounts = { ...state.playerGuessHistory };
    const total = Object.values(guessCounts).reduce((sum, value) => sum + value, 0);
    const guessProbabilities = Object.fromEntries(CARD_TYPES.map((type) => [
      type,
      (guessCounts[type] + 1) / (total + CARD_TYPES.length)
    ]));
    const cardScore = (type) => {
      const chanceGuessed = guessProbabilities[type];
      if (type === "leao") return 2 * (1 - chanceGuessed);
      if (type === "coelho") return -0.45 * chanceGuessed;
      if (type === "vaca") return -1.2 * (1 - chanceGuessed);
      if (type === "coringa") return 0.35;
      return 0;
    };
    return ai.hand
      .map((type, index) => ({ type, index, score: cardScore(type) + Math.random() * 0.18 }))
      .sort((a, b) => b.score - a.score)[0].type;
  }

  function render() {
    drawTable();
    updateTimer();
    roundNumber.textContent = String(state.round);
    turnMessage.textContent = state.message;
    gameLog.textContent = state.log;
    renderActions();
  }

  function renderActions() {
    actionArea.replaceChildren();
    turnLabel.textContent = state.phase === "player-play" || state.phase === "player-guess"
      ? "SUA VEZ"
      : state.phase === "result" || state.phase === "game-over" ? "RESULTADO" : "VEZ DA IA";

    if (state.phase === "player-play") {
      const grouped = state.players.player.hand.reduce((counts, type) => {
        counts[type] = (counts[type] || 0) + 1;
        return counts;
      }, {});
      addCaption("ESCOLHA UMA CARTA PARA JOGAR VIRADA PARA BAIXO");
      for (const type of CARD_TYPES) {
        if (!grouped[type]) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "card-button";
        button.innerHTML = `<span class="card-name">${CARDS[type].emoji} ${CARDS[type].name}</span><span class="card-count">×${grouped[type]}</span>`;
        button.addEventListener("click", () => playCard("player", type));
        actionArea.append(button);
      }
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
      addCaption("CARTA REVELADA");
      const reveal = document.createElement("span");
      reveal.className = "guess-button";
      reveal.textContent = `${CARDS[state.lastReveal.actualType].emoji} ${CARDS[state.lastReveal.actualType].name}`;
      actionArea.append(reveal);
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
    } else {
      addCaption(state.phase === "ai-guess" ? "A IA ESTÁ PENSANDO..." : "A IA ESTÁ ESCOLHENDO SUA CARTA...");
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
    ctx.globalAlpha = 0.08;
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

    drawPlayerPanel(ctx, 55, 205, state.players.ai, "OPONENTE", false);
    drawPlayerPanel(ctx, width - 255, 205, state.players.player, "VOCÊ", true);
    drawCenter(ctx, width / 2, height / 2 + 4);
    if (state.lastBonus && ["result", "game-over"].includes(state.phase)) drawBonusPile(ctx);

    ctx.fillStyle = "rgba(233, 243, 224, .63)";
    ctx.font = "11px Consolas, monospace";
    ctx.textAlign = "center";
    const phaseText = state.phase === "player-play" ? "SUA VEZ DE JOGAR"
      : state.phase === "player-guess" ? "SUA VEZ DE ADIVINHAR"
        : state.phase === "result" ? "CARTA REVELADA"
          : state.phase === "game-over" ? "PARTIDA ENCERRADA" : "A IA ESTÁ PENSANDO";
    ctx.fillText(phaseText, width / 2, 55);

    if (state.lastReveal && ["result", "game-over"].includes(state.phase)) {
      ctx.fillStyle = "rgba(11, 24, 23, .72)";
      roundRect(ctx, width / 2 - 200, height - 79, 400, 48, 9);
      ctx.fill();
      ctx.fillStyle = "#ecf2e6";
      ctx.font = "13px 'DM Sans', sans-serif";
      ctx.fillText(state.lastReveal.detail, width / 2, height - 50, 370);
    }
  }

  function drawPlayerPanel(ctx, x, y, player, label, isPlayer) {
    ctx.save();
    ctx.fillStyle = "rgba(15, 33, 29, .62)";
    roundRect(ctx, x, y, 200, 150, 12);
    ctx.fill();
    ctx.strokeStyle = isPlayer ? "rgba(201, 239, 116, .4)" : "rgba(231, 243, 229, .14)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, 200, 150, 12);
    ctx.stroke();

    ctx.fillStyle = isPlayer ? "#c9ef74" : "#b5d5c7";
    ctx.textAlign = "left";
    ctx.font = "10px Consolas, monospace";
    ctx.fillText(label, x + 17, y + 24);
    ctx.fillStyle = "#f4f4e9";
    ctx.font = "bold 18px 'DM Sans', sans-serif";
    ctx.fillText(player.name, x + 17, y + 52);

    for (let index = 0; index < 5; index += 1) {
      ctx.fillStyle = index < player.hp ? "#ef806f" : "rgba(236, 242, 231, .2)";
      ctx.font = "18px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
      ctx.fillText("♥", x + 17 + index * 24, y + 82);
    }

    ctx.fillStyle = "#a9bdba";
    ctx.font = "11px 'DM Sans', sans-serif";
    ctx.fillText(`Vidas ${player.hp}/5`, x + 17, y + 105);
    ctx.fillStyle = "#d9c477";
    ctx.fillText(`✦ ${player.luck} sorte`, x + 17, y + 127);

    const cardCount = player.hand.length;
    ctx.fillStyle = "rgba(236, 242, 231, .72)";
    ctx.textAlign = "right";
    ctx.font = "10px Consolas, monospace";
    ctx.fillText(`${cardCount} CARTAS`, x + 184, y + 24);
    ctx.restore();
  }

  function drawBonusPile(ctx) {
    const { playerKey, cards } = state.lastBonus;
    const startX = playerKey === "player" ? 740 : 320;
    const y = 418;
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = "#c9ef74";
    ctx.font = "9px Consolas, monospace";
    ctx.fillText(`CARTAS BÔNUS +${cards.length}`, startX, y - 10);
    cards.forEach((type, index) => {
      const x = startX + index * 39;
      ctx.fillStyle = "#f5f0df";
      roundRect(ctx, x, y, 34, 48, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(28, 44, 38, .2)";
      roundRect(ctx, x + 2, y + 2, 30, 44, 4);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#24312b";
      ctx.font = "17px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
      ctx.fillText(CARDS[type].emoji, x + 17, y + 30);
      ctx.textAlign = "left";
      ctx.font = "9px Consolas, monospace";
    });
    ctx.restore();
  }

  function drawCenter(ctx, centerX, centerY) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(13, 30, 25, .24)";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 45, 114, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    let visibleCard = null;
    if (state.lastReveal && ["result", "game-over"].includes(state.phase)) {
      visibleCard = state.lastReveal.actualType;
    }
    drawCard(ctx, centerX - 40, centerY - 58, visibleCard);
    ctx.fillStyle = "rgba(226, 238, 221, .72)";
    ctx.font = "10px Consolas, monospace";
    ctx.fillText(visibleCard ? CARDS[visibleCard].name.toUpperCase() : "CARTA VIRADA", centerX, centerY + 70);
    ctx.restore();
  }

  function drawCard(ctx, x, y, type) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, .32)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = type ? "#f5f0df" : "#203f38";
    roundRect(ctx, x, y, 80, 112, 9);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 2;
    ctx.strokeStyle = type ? "rgba(28, 44, 38, .2)" : "rgba(208, 235, 190, .65)";
    roundRect(ctx, x + 4, y + 4, 72, 104, 7);
    ctx.stroke();

    if (type) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#24312b";
      ctx.font = "30px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
      ctx.fillText(CARDS[type].emoji, x + 40, y + 64);
      ctx.fillStyle = CARDS[type].color;
      ctx.fillRect(x + 13, y + 89, 54, 4);
    } else {
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(201, 239, 116, .47)";
      ctx.lineWidth = 1;
      for (let offset = -35; offset <= 35; offset += 14) {
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 18 + offset);
        ctx.lineTo(x + 70, y + 78 + offset);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 70, y + 18 + offset);
        ctx.lineTo(x + 10, y + 78 + offset);
        ctx.stroke();
      }
      ctx.fillStyle = "#c9ef74";
      ctx.font = "17px Georgia, serif";
      ctx.fillText("✦", x + 40, y + 62);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  document.querySelector("#restart-button").addEventListener("click", startGame);
  document.querySelector("#rules-button").addEventListener("click", () => rulesDialog.showModal());
  document.querySelector("#close-rules").addEventListener("click", () => rulesDialog.close());
  rulesDialog.addEventListener("click", (event) => {
    if (event.target === rulesDialog) rulesDialog.close();
  });

  startGame();
})();
