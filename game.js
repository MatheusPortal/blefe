(() => {
  "use strict";

  const CARD_TYPES = ["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga", "coringa"];
  const COMMON_CARDS = CARD_TYPES.filter((type) => type !== "coringa");
  const CARDS = {
    leao: { name: "Leão", emoji: "🦁", color: "#e9a16f", effect: "Erro: perde 2 vidas." },
    coelho: { name: "Coelho", emoji: "🐇", color: "#bd9bfa", effect: "Acerto: ganha 1 sorte." },
    vaca: { name: "Vaca", emoji: "🐄", color: "#f0d477", effect: "Erro: compra 2 extras." },
    peixe: { name: "Peixe", emoji: "🐟", color: "#7ec9e8", effect: "Acerto: +1 sorte. Erro: perde sorte ou vida." },
    tigre: { name: "Tigre", emoji: "🐅", color: "#ec8b51", effect: "Erro: perde 1 vida." },
    macaco: { name: "Macaco", emoji: "🐒", color: "#c49668", effect: "Acerto: compra 1 extra." },
    elefante: { name: "Elefante", emoji: "🐘", color: "#91a8b8", effect: "Erro: quem jogou recupera 1 vida." },
    tartaruga: { name: "Tartaruga", emoji: "🐢", color: "#7bc99c", effect: "Acerto: ganha 1 escudo." },
    coringa: { name: "Coringa", emoji: "🃏", color: "#f1839a", effect: "Troca o palpite: -1 vida e compra 3 extras." }
  };
  const TURN_SECONDS = 60;
  const CARD_WIDTH = 106;
  const CARD_HEIGHT = 146;
  const EXTRA_DECK_SIZE = 20;
  const MAX_FACE_DOWN_CARDS = 20;
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const actionArea = document.querySelector("#action-area");
  const turnLabel = document.querySelector("#turn-label");
  const turnMessage = document.querySelector("#turn-message");
  const timer = document.querySelector("#timer");
  const timerValue = document.querySelector("#timer-value");
  const rulesDialog = document.querySelector("#rules-dialog");
  const MOBILE_CANVAS_WIDTH = 780;
  const MOBILE_CANVAS_HEIGHT = 1050;
  const isMobileCanvas = () => canvas.width === MOBILE_CANVAS_WIDTH;

  let state;
  let clockInterval;
  let aiTimeout;
  let dealInterval;
  let diceInterval;
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

  function createExtraDeck() {
    const deck = COMMON_CARDS.flatMap((type) => [type, type]);
    while (deck.length < EXTRA_DECK_SIZE) {
      deck.push(COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)]);
    }
    return shuffle(deck);
  }

  function makePlayer(name) {
    return {
      name,
      hp: 5,
      luck: 0,
      shields: 0,
      hand: createHand(),
      extraCardsHeld: Object.fromEntries(COMMON_CARDS.map((type) => [type, 0]))
    };
  }

  function clearGameTimers() {
    window.clearInterval(clockInterval);
    window.clearInterval(dealInterval);
    window.clearInterval(diceInterval);
    window.clearTimeout(aiTimeout);
  }

  function startGame() {
    clearGameTimers();
    hoverCard = -1;
    state = {
      players: { player: makePlayer("Você"), ai: makePlayer("IA") },
      extraDeck: createExtraDeck(),
      extraDiscard: [],
      phase: "dealing",
      round: 1,
      seconds: TURN_SECONDS,
      pending: null,
      setupCard: null,
      setupGuesses: { player: null, ai: null },
      guesses: {},
      lastReveal: null,
      playerPlayHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      playerGuessHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      aiPlayHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      eliminated: null,
      hintUsed: false,
      gameOver: false,
      dealt: { player: 0, ai: 0 },
      startingPlayer: null,
      aiInitiallyHadJoker: false,
      dice: { player: 1, ai: 1 },
      diceFrame: 0,
      message: "Embaralhando as cartas...",
      log: "Distribuindo a mão."
    };

    if (Math.random() < 0.02) {
      const recipient = Math.random() < 0.5 ? state.players.player : state.players.ai;
      const replacementIndex = Math.floor(Math.random() * recipient.hand.length);
      recipient.hand[replacementIndex] = "coringa";
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
        state.message = "Distribuindo as mãos...";
        render();
        return;
      }

      window.clearInterval(dealInterval);
      beginSetupChallenge();
    }, 105);
  }

  function drawExtraCard() {
    if (state.extraDeck.length === 0 && state.extraDiscard.length > 0) {
      state.extraDeck = shuffle(state.extraDiscard);
      state.extraDiscard = [];
    }
    return state.extraDeck.pop() || null;
  }

  function beginSetupChallenge() {
    const deckCounts = Object.fromEntries(COMMON_CARDS.map((type) => [type, 0]));
    for (const type of state.extraDeck) deckCounts[type] += 1;
    const totalCards = state.extraDeck.length;
    const probabilities = Object.fromEntries(COMMON_CARDS.map((type) => [
      type,
      totalCards ? deckCounts[type] / totalCards : 1 / COMMON_CARDS.length
    ]));
    state.setupGuesses.ai = chooseGuess(probabilities, false, COMMON_CARDS);
    state.setupCard = drawExtraCard();
    state.phase = "setup-guess";
    state.message = "Adivinhe a carta para disputar a iniciativa.";
    state.log = "Palpite a carta central.";
    beginTimedPhase();
    render();
  }

  function beginTimedPhase() {
    window.clearInterval(clockInterval);
    state.seconds = TURN_SECONDS;
    clockInterval = window.setInterval(() => {
      if (state.gameOver || !["player-play", "player-guess", "setup-guess"].includes(state.phase)) return;
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
      state.log = "Tempo esgotado: carta escolhida automaticamente.";
      playCard("player", type);
    } else if (state.phase === "player-guess") {
      const choices = CARD_TYPES.filter((type) => type !== state.eliminated);
      submitGuess("player", choices[Math.floor(Math.random() * choices.length)]);
    } else if (state.phase === "setup-guess") {
      const type = COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)];
      submitSetupGuess(type);
    }
  }

  function submitSetupGuess(type) {
    if (state.phase !== "setup-guess") return;
    window.clearInterval(clockInterval);
    state.setupGuesses.player = type;
    state.phase = "setup-revealing";
    state.message = "Palpites na mesa...";
    state.log = "Revelando a carta.";
    render();
    aiTimeout = window.setTimeout(resolveSetupChallenge, 650);
  }

  function resolveSetupChallenge() {
    if (state.phase !== "setup-revealing") return;
    const playerCorrect = state.setupGuesses.player === state.setupCard;
    const aiCorrect = state.setupGuesses.ai === state.setupCard;
    state.lastReveal = { actualType: state.setupCard };
    state.extraDiscard.push(state.setupCard);

    if (playerCorrect !== aiCorrect) {
      const starter = playerCorrect ? "player" : "ai";
      const name = state.players[starter].name;
      state.phase = "setup-result";
      state.message = `${name} acertou e começa.`;
      state.log = `${CARDS[state.setupCard].emoji} ${name} abre a partida.`;
      render();
      aiTimeout = window.setTimeout(() => startTurn(starter), 950);
      return;
    }

    state.phase = "dice-roll";
    state.message = "Empate nos palpites. Dados!";
    state.log = "Desempate na mesa.";
    render();
    rollDice();
  }

  function rollDice() {
    if (state.phase !== "dice-roll") return;
    state.diceFrame = 0;
    window.clearInterval(diceInterval);
    diceInterval = window.setInterval(() => {
      state.diceFrame += 1;
      state.dice.player = 1 + Math.floor(Math.random() * 6);
      state.dice.ai = 1 + Math.floor(Math.random() * 6);
      render();
      if (state.diceFrame < 8) return;

      window.clearInterval(diceInterval);
      state.dice.player = 1 + Math.floor(Math.random() * 6);
      state.dice.ai = 1 + Math.floor(Math.random() * 6);
      if (state.dice.player === state.dice.ai) {
        state.message = "Dados empatados. Mais uma!";
        state.log = `${state.dice.player} × ${state.dice.ai} · novo lance`;
        render();
        aiTimeout = window.setTimeout(rollDice, 550);
        return;
      }

      const starter = state.dice.player > state.dice.ai ? "player" : "ai";
      const name = state.players[starter].name;
      state.message = `${state.dice.player} × ${state.dice.ai} · ${name} começa.`;
      state.log = `${name} venceu no dado.`;
      render();
      aiTimeout = window.setTimeout(() => startTurn(starter), 950);
    }, 100);
  }

  function startTurn(playerKey) {
    if (state.gameOver) return;
    state.startingPlayer = playerKey;
    state.phase = playerKey === "player" ? "player-play" : "ai-play";
    state.setupCard = null;
    state.guesses = {};
    state.lastReveal = null;
    state.message = playerKey === "player" ? "Sua vez." : "A IA começa.";
    state.log = `${state.players[playerKey].name} começa.`;
    if (playerKey === "player") {
      beginTimedPhase();
      render();
    } else {
      startAiTurn();
    }
  }

  function drawBonusCards(playerKey, count) {
    const player = state.players[playerKey];
    const drawn = [];
    for (let index = 0; index < count; index += 1) {
      const type = drawExtraCard();
      if (!type) break;
      player.hand.push(type);
      player.extraCardsHeld[type] += 1;
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
    if (player.extraCardsHeld[type] > 0) {
      player.extraCardsHeld[type] -= 1;
      state.extraDiscard.push(type);
    }
    if (playerKey === "player") state.playerPlayHistory[type] += 1;
    if (playerKey === "ai") state.aiPlayHistory[type] += 1;

    state.pending = { owner: playerKey, type };
    state.lastReveal = null;
    state.guesses = {};
    state.eliminated = null;
    state.hintUsed = false;

    if (playerKey === "player") {
      state.phase = "ai-guess";
      state.message = "A IA está escolhendo o palpite.";
      render();
      aiTimeout = window.setTimeout(aiMakeGuess, 800);
      return;
    }

    state.phase = "player-guess";
    state.message = "Adivinhe a carta no centro.";
    beginTimedPhase();
    render();
  }

  function probabilityOfPlayerCard() {
    const weights = {};
    for (const type of CARD_TYPES) {
      if (type === "coringa") {
        weights[type] = state.aiInitiallyHadJoker || state.playerPlayHistory.coringa > 0 ? 0 : 0.04;
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

  function chooseGuess(probabilities, useLuck, options = CARD_TYPES) {
    const available = [...options];
    if (useLuck) {
      const leastLikely = available
        .filter((type) => probabilities[type] > 0)
        .sort((a, b) => probabilities[a] - probabilities[b])[0];
      if (leastLikely && available.length > 1) available.splice(available.indexOf(leastLikely), 1);
    }

    return sampleByScore(available, (guess) => {
      let value = 0;
      for (const actual of CARD_TYPES) {
        const chance = probabilities[actual] || 0;
        if (actual === "leao" && guess !== actual) value -= chance * 2;
        if (actual === "tigre" && guess !== actual) value -= chance;
        if (actual === "coelho" && guess === actual) value += chance * 0.45;
        if (actual === "vaca" && guess !== actual) value += chance * 0.7;
        if (actual === "peixe") value += chance * (guess === actual ? 0.4 : -0.5);
        if (actual === "macaco" && guess === actual) value += chance * 0.55;
        if (actual === "elefante" && guess !== actual) value -= chance * 0.45;
        if (actual === "tartaruga" && guess === actual) value += chance * 0.5;
        if (actual === "coringa") value -= chance * 0.6;
      }
      return value;
    }, 0.9);
  }

  function aiMakeGuess() {
    if (state.gameOver || state.phase !== "ai-guess") return;
    const ai = state.players.ai;
    const useLuck = ai.luck > 0 && Math.random() < 0.65;
    if (useLuck) ai.luck -= 1;
    const guess = chooseGuess(probabilityOfPlayerCard(), useLuck);
    submitGuess("ai", guess);
  }

  function submitGuess(guesserKey, guess) {
    if (!state.pending || !["player-guess", "ai-guess"].includes(state.phase)) return;
    window.clearInterval(clockInterval);
    state.guesses[guesserKey] = guess;
    state.phase = "revealing";
    state.message = "Palpite na mesa...";
    state.log = "Revelando a carta.";
    render();
    aiTimeout = window.setTimeout(() => resolveGuess(guesserKey, guess), 650);
  }

  function applyDamage(player, amount) {
    if (player.shields > 0) {
      player.shields -= 1;
      return { blocked: true, lost: 0 };
    }
    const lost = Math.min(player.hp, amount);
    player.hp -= lost;
    return { blocked: false, lost };
  }

  function resolveGuess(guesserKey, guess) {
    if (state.gameOver || !state.pending) return;
    const { owner, type: actualType } = state.pending;
    const guesser = state.players[guesserKey];
    const playedBy = state.players[owner];
    const selectedGuess = guess;
    let correct = guess === actualType;
    let summary;

    if (guesserKey === "player") state.playerGuessHistory[guess] += 1;

    if (actualType === "coringa") {
      const alternatives = COMMON_CARDS.filter((type) => type !== guess);
      const swappedTo = alternatives[Math.floor(Math.random() * alternatives.length)] || COMMON_CARDS[0];
      state.guesses[guesserKey] = swappedTo;
      correct = false;
      const damage = applyDamage(guesser, 1);
      const bonus = drawBonusCards(guesserKey, 3);
      summary = `🃏 Coringa · ${damage.blocked ? "escudo" : "−1 vida"} · +${bonus.length} extras`;
    } else if (actualType === "leao" && !correct) {
      const damage = applyDamage(guesser, 2);
      summary = `🦁 Leão · ${damage.blocked ? "escudo" : "−2 vidas"}`;
    } else if (actualType === "coelho" && correct) {
      guesser.luck += 1;
      summary = "🐇 Coelho · +1 sorte";
    } else if (actualType === "vaca" && !correct) {
      const bonus = drawBonusCards(guesserKey, 2);
      summary = `🐄 Vaca · +${bonus.length} extras`;
    } else if (actualType === "peixe") {
      if (correct) {
        guesser.luck += 1;
        summary = "🐟 Peixe · +1 sorte";
      } else if (guesser.luck > 0) {
        guesser.luck -= 1;
        summary = "🐟 Peixe · −1 sorte";
      } else {
        const damage = applyDamage(guesser, 1);
        summary = `🐟 Peixe · ${damage.blocked ? "escudo" : "−1 vida"}`;
      }
    } else if (actualType === "tigre" && !correct) {
      const damage = applyDamage(guesser, 1);
      summary = `🐅 Tigre · ${damage.blocked ? "escudo" : "−1 vida"}`;
    } else if (actualType === "macaco" && correct) {
      const bonus = drawBonusCards(guesserKey, 1);
      summary = `🐒 Macaco · +${bonus.length} extra`;
    } else if (actualType === "elefante" && !correct) {
      const healed = Math.min(1, 5 - playedBy.hp);
      playedBy.hp += healed;
      summary = `🐘 Elefante · ${healed ? "+1 vida" : "vida cheia"}`;
    } else if (actualType === "tartaruga" && correct) {
      guesser.shields += 1;
      summary = "🐢 Tartaruga · +1 escudo";
    } else {
      summary = correct ? "Palpite certo" : "Palpite errado";
    }

    state.phase = "result";
    state.lastReveal = { owner, actualType, guess: selectedGuess, correct, summary };
    state.pending = null;
    state.message = summary;
    state.log = summary;

    if (guesser.hp <= 0) {
      guesser.hp = 0;
      endGame(owner, `${playedBy.name} venceu · vida zerada`);
    } else if (playedBy.hand.length === 0) {
      endGame(owner, `${playedBy.name} venceu · sem cartas`);
    }
    render();
  }

  function endGame(winnerKey, reason) {
    state.phase = "game-over";
    state.gameOver = true;
    state.winner = winnerKey;
    state.message = winnerKey === "player" ? `Vitória · ${reason}` : `Derrota · ${reason}`;
    state.log = reason;
  }

  function useLuck() {
    if (state.phase !== "player-guess" || state.players.player.luck < 1 || state.hintUsed) return;
    const wrongOptions = CARD_TYPES.filter((type) => type !== state.pending.type && type !== state.eliminated);
    if (wrongOptions.length === 0) return;
    state.eliminated = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    state.hintUsed = true;
    state.players.player.luck -= 1;
    state.log = `Sorte: não é ${CARDS[state.eliminated].name}.`;
    render();
  }

  function continueAfterResult() {
    if (state.phase !== "result") return;
    if (state.lastReveal.owner === "player") {
      startAiTurn();
      return;
    }
    state.round += 1;
    state.phase = "player-play";
    state.message = "Sua vez.";
    state.log = `Rodada ${state.round}`;
    beginTimedPhase();
    render();
  }

  function startAiTurn() {
    if (state.gameOver) return;
    if (state.players.ai.hand.length === 0) {
      endGame("ai", "IA sem cartas");
      render();
      return;
    }
    state.phase = "ai-play";
    state.message = "A IA joga...";
    render();
    aiTimeout = window.setTimeout(() => {
      if (state.gameOver || state.phase !== "ai-play") return;
      const type = chooseAiCard();
      playCard("ai", type);
    }, 750);
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
      leao: 2 * (1 - guessProbability.leao) + (playerIsWeak ? 0.7 : 0),
      coelho: -0.45 * guessProbability.coelho,
      vaca: -0.45 * (1 - guessProbability.vaca),
      peixe: 0.8 - guessProbability.peixe,
      tigre: 1 - guessProbability.tigre,
      macaco: -0.55 * guessProbability.macaco,
      elefante: 0.35 * (1 - guessProbability.elefante),
      tartaruga: -0.5 * guessProbability.tartaruga,
      coringa: 0.15
    };
    const mixedScores = (type) => scores[type] - state.aiPlayHistory[type] * 0.4;

    if (Math.random() < 0.65) return hand[Math.floor(Math.random() * hand.length)];
    return sampleByScore(hand, mixedScores, 1.6);
  }

  function render() {
    drawTable();
    updateTimer();
    turnMessage.textContent = state.message;
    renderActions();
    canvas.setAttribute("aria-label", getCanvasDescription());
  }

  function getCanvasDescription() {
    return `Você: ${state.players.player.hand.length} cartas, ${state.players.player.hp} vidas. IA: ${state.players.ai.hand.length} cartas, ${state.players.ai.hp} vidas. ${state.message}`;
  }

  function renderActions() {
    actionArea.replaceChildren();
    turnLabel.textContent = ["player-play", "player-guess", "setup-guess"].includes(state.phase)
      ? "SUA VEZ"
      : ["result", "game-over", "setup-result"].includes(state.phase) ? "RESULTADO" : "MESA";

    if (state.phase === "setup-guess") {
      addCaption("PALPITE PARA ABRIR A PARTIDA");
      for (const type of COMMON_CARDS) addGuessButton(type, () => submitSetupGuess(type));
    } else if (state.phase === "player-play") {
      addCaption("CLIQUE EM UMA CARTA");
    } else if (state.phase === "player-guess") {
      addCaption("PALPITE");
      for (const type of CARD_TYPES) {
        const button = addGuessButton(type, () => submitGuess("player", type));
        button.disabled = type === state.eliminated;
      }
      const hint = document.createElement("button");
      hint.type = "button";
      hint.className = "hint-button";
      hint.disabled = state.players.player.luck < 1 || state.hintUsed;
      hint.textContent = `✦ ${state.players.player.luck}`;
      hint.setAttribute("aria-label", `Usar sorte: ${state.players.player.luck}`);
      hint.addEventListener("click", useLuck);
      actionArea.append(hint);
    } else if (state.phase === "result") {
      addCaption(`${CARDS[state.lastReveal.actualType].emoji} ${CARDS[state.lastReveal.actualType].name}`);
      const next = document.createElement("button");
      next.type = "button";
      next.className = "primary-button";
      next.textContent = "Continuar →";
      next.addEventListener("click", continueAfterResult);
      actionArea.append(next);
    } else if (state.phase === "game-over") {
      addCaption(state.winner === "player" ? "VITÓRIA" : "FIM DE JOGO");
      const restart = document.createElement("button");
      restart.type = "button";
      restart.className = "primary-button";
      restart.textContent = "Jogar novamente";
      restart.addEventListener("click", startGame);
      actionArea.append(restart);
    } else if (state.phase === "dealing") {
      addCaption("DISTRIBUINDO...");
    } else if (state.phase === "setup-revealing" || state.phase === "revealing") {
      addCaption("REVELANDO...");
    } else if (state.phase === "dice-roll") {
      addCaption("DESEMPATE · DADOS");
    } else {
      addCaption("A IA PENSA...");
    }
  }

  function addGuessButton(type, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "guess-button";
    button.textContent = `${CARDS[type].emoji} ${CARDS[type].name}`;
    button.addEventListener("click", onClick);
    actionArea.append(button);
    return button;
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
    timer.hidden = !["player-play", "player-guess", "setup-guess"].includes(state.phase);
  }

  function drawTable() {
    const ctx = context;
    if (isMobileCanvas()) {
      drawMobileTable(ctx);
      return;
    }
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

    drawPlayerPanel(ctx, 916, 24, state.players.ai, "OPONENTE", false);
    drawPlayerPanel(ctx, 916, 524, state.players.player, "VOCÊ", true);
    drawExtraDeck(ctx);
    drawAiHand(ctx);
    drawCenter(ctx, width / 2, 326);
    drawPlayerHand(ctx);
    drawGuessMarkers(ctx);

    ctx.fillStyle = "rgba(233, 243, 224, .66)";
    ctx.font = "10px Consolas, monospace";
    ctx.textAlign = "center";
    const phaseText = ["setup-guess", "setup-revealing", "setup-result", "dice-roll"].includes(state.phase)
      ? state.phase === "dice-roll" ? "DESEMPATE" : "PALPITE DE ABERTURA"
      : state.phase === "player-play" ? "SUA VEZ"
        : state.phase === "player-guess" ? "SEU PALPITE"
          : ["result", "game-over"].includes(state.phase) ? "REVELADA"
            : state.phase === "dealing" ? "EMBARALHANDO" : "A IA PENSA";
    ctx.fillText(phaseText, width / 2, 250);

    if (state.phase === "dice-roll") drawDice(ctx);

    if (state.lastReveal && ["result", "game-over"].includes(state.phase)) {
      drawResultToast(ctx, state.lastReveal.summary);
    }
  }

  function drawMobileTable(ctx) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const felt = ctx.createLinearGradient(0, 0, width, height);
    felt.addColorStop(0, "#205347");
    felt.addColorStop(1, "#173d35");
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(207, 231, 183, .28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width * .46, height * .38, 0, 0, Math.PI * 2);
    ctx.stroke();

    drawMobilePlayerPanel(ctx, 545, 20, state.players.ai, "IA");
    drawMobilePlayerPanel(ctx, 545, 900, state.players.player, "VOCÊ");
    drawExtraDeck(ctx);
    drawAiHand(ctx);
    drawCenter(ctx, width / 2, 470);
    drawPlayerHand(ctx);
    drawGuessMarkers(ctx);

    ctx.fillStyle = "rgba(233, 243, 224, .72)";
    ctx.font = "16px Consolas, monospace";
    ctx.textAlign = "center";
    const phaseText = ["setup-guess", "setup-revealing", "setup-result", "dice-roll"].includes(state.phase)
      ? state.phase === "dice-roll" ? "DADOS" : "PALPITE DE ABERTURA"
        : state.phase === "player-play" ? "SUA VEZ"
          : state.phase === "player-guess" ? "SEU PALPITE"
            : ["result", "game-over"].includes(state.phase) ? "REVELADA"
              : state.phase === "dealing" ? "DISTRIBUINDO" : "IA PENSA";
    ctx.fillText(phaseText, width / 2, 355);

    if (state.phase === "dice-roll") drawDice(ctx);
    if (state.lastReveal && ["result", "game-over"].includes(state.phase)) {
      drawResultToast(ctx, state.lastReveal.summary);
    }
  }

  function drawMobilePlayerPanel(ctx, x, y, player, label) {
    const width = 215;
    const height = 120;
    ctx.save();
    ctx.fillStyle = "rgba(15, 33, 29, .78)";
    roundRect(ctx, x, y, width, height, 12);
    ctx.fill();
    ctx.strokeStyle = label === "VOCÊ" ? "rgba(201, 239, 116, .4)" : "rgba(231, 243, 229, .14)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, 12);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = label === "VOCÊ" ? "#c9ef74" : "#b5d5c7";
    ctx.font = "15px Consolas, monospace";
    ctx.fillText(label, x + 15, y + 22);
    ctx.fillStyle = "#ef806f";
    ctx.font = "20px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
    ctx.fillText(`${"♥".repeat(player.hp)}${"♡".repeat(5 - player.hp)}`, x + 15, y + 54);
    ctx.fillStyle = "#a9bdba";
    ctx.font = "14px Consolas, monospace";
    ctx.fillText(`${player.hp}/5 VIDA`, x + 15, y + 80);
    ctx.textAlign = "right";
    ctx.fillStyle = "#e5eddf";
    ctx.fillText(`${player.hand.length} CARTAS`, x + width - 15, y + 80);
    if (player.luck > 0 || player.shields > 0) {
      ctx.fillStyle = "#d9c477";
      ctx.fillText(`✦${player.luck}  ⛨${player.shields}`, x + width - 15, y + 25);
    }
    ctx.restore();
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
    if (player.luck > 0 || player.shields > 0) {
      ctx.fillStyle = "#d9c477";
      ctx.fillText(`✦${player.luck}  ⛨${player.shields}`, x + 151, y + 19);
    }
    ctx.restore();
  }

  function drawExtraDeck(ctx) {
    const mobile = isMobileCanvas();
    const x = mobile ? 32 : 48;
    const y = mobile ? 430 : 272;
    const cardWidth = mobile ? 96 : 76;
    const cardHeight = mobile ? 138 : 108;
    const canDraw = state.extraDeck.length > 0 || state.extraDiscard.length > 0;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(226, 238, 221, .72)";
    ctx.font = `${mobile ? 15 : 9}px Consolas, monospace`;
    ctx.fillText("EXTRAS", x + cardWidth / 2, y - 15);
    if (canDraw) {
      const offset = state.extraDeck.length > 1 ? 4 : 0;
      drawCard(ctx, x + offset, y + offset, null, cardWidth, cardHeight);
      drawCard(ctx, x, y, null, cardWidth, cardHeight);
    } else {
      ctx.fillStyle = "rgba(15, 33, 29, .55)";
      roundRect(ctx, x, y, cardWidth, cardHeight, 9);
      ctx.fill();
      ctx.strokeStyle = "rgba(208, 235, 190, .25)";
      roundRect(ctx, x + 4, y + 4, cardWidth - 8, cardHeight - 8, 7);
      ctx.stroke();
    }
    ctx.fillStyle = "#c9ef74";
    ctx.font = `bold ${mobile ? 17 : 11}px Consolas, monospace`;
    ctx.fillText(String(state.extraDeck.length), x + cardWidth / 2, y + cardHeight + 20);
    ctx.restore();
  }

  function drawAiHand(ctx) {
    if (isMobileCanvas()) {
      drawMobileAiHand(ctx);
      return;
    }
    const handSize = state.phase === "dealing" ? state.dealt.ai : state.players.ai.hand.length;
    const visibleCount = Math.min(handSize, MAX_FACE_DOWN_CARDS);
    const cardWidth = 94;
    const cardHeight = 132;
    const spacing = visibleCount > 1 ? Math.min(30, 520 / (visibleCount - 1)) : 0;
    const startX = 550 - ((visibleCount - 1) * spacing) / 2;

    for (let index = 0; index < visibleCount; index += 1) {
      const normalized = visibleCount > 1 ? (index / (visibleCount - 1)) * 2 - 1 : 0;
      const x = startX + index * spacing;
      const y = 88 + Math.abs(normalized) * 9;
      drawCard(ctx, x - cardWidth / 2, y - cardHeight / 2, null, cardWidth, cardHeight);
    }
    if (handSize > MAX_FACE_DOWN_CARDS) {
      ctx.fillStyle = "#c9ef74";
      ctx.font = "9px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`+${handSize - MAX_FACE_DOWN_CARDS}`, 550, 170);
    }
  }

  function drawMobileAiHand(ctx) {
    const handSize = state.phase === "dealing" ? state.dealt.ai : state.players.ai.hand.length;
    const visibleCount = Math.min(handSize, MAX_FACE_DOWN_CARDS);
    const cardWidth = 94;
    const cardHeight = 132;
    const spacing = visibleCount > 1 ? Math.min(42, 460 / (visibleCount - 1)) : 0;
    const startX = canvas.width / 2 - ((visibleCount - 1) * spacing) / 2;
    for (let index = 0; index < visibleCount; index += 1) {
      const x = startX + index * spacing;
      drawCard(ctx, x - cardWidth / 2, 205 - cardHeight / 2, null, cardWidth, cardHeight);
    }
    if (handSize > MAX_FACE_DOWN_CARDS) {
      ctx.fillStyle = "#c9ef74";
      ctx.font = "14px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`+${handSize - MAX_FACE_DOWN_CARDS}`, canvas.width / 2, 285);
    }
  }

  function getPlayerCardLayouts() {
    const hand = state.players.player.hand;
    const visibleCount = state.phase === "dealing" ? state.dealt.player : hand.length;
    const layouts = [];
    const mobile = isMobileCanvas();
    const centerX = mobile ? canvas.width / 2 : 550;
    const spacing = visibleCount > 1
      ? Math.min(mobile ? 76 : 76, (mobile ? 440 : 500) / (visibleCount - 1))
      : 0;
    const startX = centerX - ((visibleCount - 1) * spacing) / 2;

    for (let index = 0; index < visibleCount; index += 1) {
      const normalized = visibleCount > 1 ? (index / (visibleCount - 1)) * 2 - 1 : 0;
      layouts.push({
        index,
        x: startX + index * spacing,
        y: mobile ? 795 + Math.abs(normalized) * 18 : 536 + Math.abs(normalized) * 17,
        angle: normalized * 0.38,
        type: hand[index]
      });
    }
    return layouts;
  }

  function drawPlayerHand(ctx) {
    const canPlay = state.phase === "player-play";
    const layouts = getPlayerCardLayouts();
    for (const layout of layouts) {
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
    if (canPlay && hoverCard >= 0 && layouts[hoverCard]) drawCardTooltip(ctx, layouts[hoverCard]);
    if (state.players.player.hand.length > 0) {
      ctx.fillStyle = "rgba(226, 238, 221, .76)";
      const mobile = isMobileCanvas();
      ctx.font = `${mobile ? 14 : 9}px Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.fillText(
        canPlay ? "SUA MÃO · CLIQUE PARA JOGAR" : "SUA MÃO",
        canvas.width / 2,
        mobile ? canvas.height - 18 : 644
      );
    }
  }

  function drawCardTooltip(ctx, layout) {
    const mobile = isMobileCanvas();
    const width = mobile ? 330 : 224;
    const height = mobile ? 64 : 43;
    const x = Math.max(width / 2 + 8, Math.min(canvas.width - width / 2 - 8, layout.x));
    const y = mobile ? 645 : 425;
    ctx.save();
    ctx.fillStyle = "rgba(10, 23, 21, .94)";
    roundRect(ctx, x - width / 2, y, width, height, 7);
    ctx.fill();
    ctx.strokeStyle = `${CARDS[layout.type].color}99`;
    ctx.lineWidth = 1;
    roundRect(ctx, x - width / 2, y, width, height, 7);
    ctx.stroke();
    ctx.fillStyle = CARDS[layout.type].color;
    ctx.textAlign = "center";
    ctx.font = `bold ${mobile ? 17 : 11}px 'Segoe UI', sans-serif`;
    ctx.fillText(`${CARDS[layout.type].emoji} ${CARDS[layout.type].name}`, x, y + (mobile ? 24 : 16));
    ctx.fillStyle = "#e6ede1";
    ctx.font = `${mobile ? 15 : 10}px 'Segoe UI', sans-serif`;
    ctx.fillText(CARDS[layout.type].effect, x, y + (mobile ? 48 : 33), width - 18);
    ctx.restore();
  }

  function drawGuessMarkers(ctx) {
    const showSetupGuesses = ["setup-revealing", "setup-result", "dice-roll"].includes(state.phase);
    if (showSetupGuesses) {
      if (state.setupGuesses.ai) drawGuessMarker(ctx, "ai", state.setupGuesses.ai);
      if (state.setupGuesses.player) drawGuessMarker(ctx, "player", state.setupGuesses.player);
      return;
    }
    if (state.guesses.ai) drawGuessMarker(ctx, "ai", state.guesses.ai);
    if (state.guesses.player) drawGuessMarker(ctx, "player", state.guesses.player);
  }

  function drawGuessMarker(ctx, playerKey, type) {
    const mobile = isMobileCanvas();
    const x = mobile ? 670 : 900;
    const y = mobile ? playerKey === "ai" ? 345 : 590 : playerKey === "ai" ? 205 : 407;
    const width = mobile ? 82 : 58;
    const height = mobile ? 118 : 84;
    ctx.save();
    ctx.fillStyle = "rgba(226, 238, 221, .68)";
    ctx.font = `${mobile ? 14 : 8}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.fillText("PALPITE", x + width / 2, y - (mobile ? 12 : 8));
    drawCard(ctx, x, y, type, width, height);
    ctx.restore();
  }

  function drawCenter(ctx, centerX, centerY) {
    const mobile = isMobileCanvas();
    const cardWidth = mobile ? 124 : 100;
    const cardHeight = mobile ? 176 : 144;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(13, 30, 25, .24)";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 45, 114, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    const setupVisible = ["setup-result", "dice-roll"].includes(state.phase);
    const normalVisible = state.lastReveal && ["result", "game-over"].includes(state.phase);
    const visibleCard = setupVisible
      ? state.setupCard
      : normalVisible ? state.lastReveal.actualType : null;
    drawCard(ctx, centerX - cardWidth / 2, centerY - cardHeight / 2, visibleCard, cardWidth, cardHeight);
    ctx.fillStyle = "rgba(226, 238, 221, .72)";
    ctx.font = `${mobile ? 14 : 10}px Consolas, monospace`;
    const openingGuess = ["setup-guess", "setup-revealing"].includes(state.phase);
    const label = setupVisible
      ? "CARTA DO SORTEIO"
      : normalVisible ? CARDS[visibleCard].name.toUpperCase()
        : openingGuess ? "CARTA DE ABERTURA" : "CARTA JOGADA";
    ctx.fillText(label, centerX, centerY + (mobile ? 113 : 91));
    ctx.restore();
  }

  function drawResultToast(ctx, summary) {
    const mobile = isMobileCanvas();
    const x = mobile ? 165 : 355;
    const y = mobile ? 600 : 429;
    const width = mobile ? 450 : 390;
    const height = mobile ? 52 : 40;
    ctx.save();
    ctx.fillStyle = "rgba(11, 24, 23, .86)";
    roundRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.fillStyle = "#ecf2e6";
    ctx.font = `${mobile ? 17 : 12}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(summary, x + width / 2, y + height / 2 + (mobile ? 6 : 4), width - 24);
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
      const mobile = isMobileCanvas();
      ctx.textAlign = "center";
      ctx.fillStyle = "#24312b";
      ctx.font = `${Math.round(width * (mobile ? 0.52 : 0.43))}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;
      ctx.fillText(CARDS[type].emoji, 0, 8);
      ctx.fillStyle = CARDS[type].color;
      ctx.fillRect(-width * 0.34, height * 0.33, width * 0.68, 5);
      ctx.fillStyle = "#35443d";
      ctx.font = `bold ${Math.max(mobile ? 12 : 8, Math.round(width * (mobile ? 0.135 : 0.105)))}px 'Segoe UI', sans-serif`;
      ctx.fillText(CARDS[type].name.toUpperCase(), 0, height * (mobile ? 0.31 : 0.28));
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

  function drawDice(ctx) {
    if (isMobileCanvas()) {
      drawDie(ctx, 270, 470, state.dice.player);
      drawDie(ctx, 510, 470, state.dice.ai);
      return;
    }
    drawDie(ctx, 455, 326, state.dice.player);
    drawDie(ctx, 645, 326, state.dice.ai);
  }

  function drawDie(ctx, x, y, value) {
    const size = 72;
    const offset = size * 0.25;
    const points = {
      1: [[0, 0]],
      2: [[-offset, -offset], [offset, offset]],
      3: [[-offset, -offset], [0, 0], [offset, offset]],
      4: [[-offset, -offset], [offset, -offset], [-offset, offset], [offset, offset]],
      5: [[-offset, -offset], [offset, -offset], [0, 0], [-offset, offset], [offset, offset]],
      6: [[-offset, -offset], [offset, -offset], [-offset, 0], [offset, 0], [-offset, offset], [offset, offset]]
    };
    ctx.save();
    ctx.fillStyle = "#f5f0df";
    ctx.shadowColor = "rgba(0, 0, 0, .35)";
    ctx.shadowBlur = 14;
    roundRect(ctx, x - size / 2, y - size / 2, size, size, 12);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#24312b";
    for (const [px, py] of points[value]) {
      ctx.beginPath();
      ctx.arc(x + px, y + py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function getCardAtPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const layouts = getPlayerCardLayouts();

    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      const layout = layouts[index];
      const dx = x - layout.x;
      const dy = y - layout.y;
      const localX = dx * Math.cos(layout.angle) + dy * Math.sin(layout.angle);
      const localY = -dx * Math.sin(layout.angle) + dy * Math.cos(layout.angle);
      if (Math.abs(localX) <= CARD_WIDTH / 2 && Math.abs(localY) <= CARD_HEIGHT / 2) {
        return layout.index;
      }
    }
    return -1;
  }

  function handleCanvasPointerMove(event) {
    const nextHover = state.phase === "player-play" ? getCardAtPointer(event) : -1;
    if (hoverCard === nextHover) return;
    hoverCard = nextHover;
    canvas.style.cursor = nextHover >= 0 ? "pointer" : "default";
    if (state.phase === "player-play") drawTable();
  }

  function handleCanvasClick(event) {
    if (state.phase !== "player-play") return;
    const cardIndex = getCardAtPointer(event);
    if (cardIndex < 0) return;
    playCard("player", state.players.player.hand[cardIndex]);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  canvas.addEventListener("pointermove", handleCanvasPointerMove);
  canvas.addEventListener("pointerleave", () => {
    hoverCard = -1;
    canvas.style.cursor = "default";
    if (state.phase === "player-play") drawTable();
  });
  canvas.addEventListener("click", handleCanvasClick);
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

  function resizeCanvasForViewport() {
    const mobile = window.innerWidth <= 650;
    const width = mobile ? MOBILE_CANVAS_WIDTH : 1100;
    const height = mobile ? MOBILE_CANVAS_HEIGHT : 660;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    if (state) render();
  }

  window.addEventListener("resize", resizeCanvasForViewport);
  resizeCanvasForViewport();
  startGame();
})();
