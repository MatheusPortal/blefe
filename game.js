(() => {
  "use strict";

  const CARD_TYPES = ["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga", "troca", "coringa"];
  const SPECIAL_CARDS = ["troca", "coringa"];
  const COMMON_CARDS = CARD_TYPES.filter((type) => !SPECIAL_CARDS.includes(type));
  const COMMON_CARD_COUNTS = {
    leao: 4,
    coelho: 4,
    vaca: 4,
    peixe: 4,
    tigre: 4,
    macaco: 4,
    elefante: 4,
    tartaruga: 4
  };
  const COMMON_DECK_SIZE = Object.values(COMMON_CARD_COUNTS).reduce((sum, count) => sum + count, 0);
  const DECK_SIZE = COMMON_DECK_SIZE + SPECIAL_CARDS.length;
  const INITIAL_HAND_SIZE = 7;
  const MAX_CARDS_PER_SPECIES = 3;
  const MAX_LUCK = 5;
  const CARDS = {
    leao: { name: "Leão", emoji: "🦁", color: "#e9a16f", effect: "Erro: perde 2 vidas e compra 1 carta; quem jogou ganha 1 sorte." },
    coelho: { name: "Coelho", emoji: "🐇", color: "#bd9bfa", effect: "Erro: compra 3 cartas; quem jogou ganha 2 de sorte. Acerto: +1 sorte." },
    vaca: { name: "Vaca", emoji: "🐄", color: "#f0d477", effect: "Erro: compra 2 cartas; quem jogou ganha 2 escudos. Acerto: +1 sorte." },
    peixe: { name: "Peixe", emoji: "🐟", color: "#7ec9e8", effect: "Erro: compra 3 cartas; quem jogou ganha 2 de sorte. Acerto: +1 vida." },
    tigre: { name: "Tigre", emoji: "🐅", color: "#ec8b51", effect: "Erro: perde 1 vida e compra 2 cartas. Acerto: +1 vida ou escudo." },
    macaco: { name: "Macaco", emoji: "🐒", color: "#c49668", effect: "Erro: compra 4 cartas; quem jogou ganha 3 de sorte. Acerto: +1 sorte." },
    elefante: { name: "Elefante", emoji: "🐘", color: "#91a8b8", effect: "Erro: perde 2 vidas e compra 2 cartas; quem jogou ganha 1 escudo." },
    tartaruga: { name: "Tartaruga", emoji: "🐢", color: "#7bc99c", effect: "Erro: compra 1 carta e perde 1 escudo; quem jogou ganha 1 escudo." },
    troca: { name: "Troca", emoji: "🔄", color: "#d9c477", effect: "Erro: quem jogou pode trocar as mãos durante as 2 rodadas seguintes." },
    coringa: { name: "Coringa", emoji: "🃏", color: "#f1839a", effect: "Erro: quem jogou ganha 1 vida e revela até 2 cartas da mão adversária." }
  };
  const TURN_SECONDS = 40;
  const RESULT_PAUSE_SECONDS = 4;
  const OPENING_RESULT_PAUSE_MS = 2400;
  const CARD_WIDTH = 106;
  const CARD_HEIGHT = 146;
  const MAX_FACE_DOWN_CARDS = 20;
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const tableOverlay = document.querySelector("#table-overlay");
  const tableResult = document.querySelector("#table-result");
  const tableRestartButton = document.querySelector("#play-again-button");
  const tableFooter = document.querySelector(".table-footer");
  const actionArea = document.querySelector("#action-area");
  const timer = document.querySelector("#timer");
  const timerValue = document.querySelector("#timer-value");
  const useLuckButton = document.querySelector("#use-luck-button");
  const swapHandsButton = document.querySelector("#swap-hands-button");
  const roundCountdown = document.querySelector("#round-countdown");
  const roundCountdownValue = document.querySelector("#round-countdown-value");
  const rulesDialog = document.querySelector("#rules-dialog");
  const soundToggle = document.querySelector("#sound-toggle");
  const mainMenu = document.querySelector("#main-menu");
  const gameShell = document.querySelector("#game-shell");
  const leaveGameButton = document.querySelector("#leave-game-button");
  const connectionLogButton = document.querySelector("#connection-log-button");
  const restartButton = document.querySelector("#restart-button");
  const MOBILE_CANVAS_WIDTH = 780;
  const MOBILE_CANVAS_HEIGHT = 1520;
  let canvasWidth = 1100;
  let canvasHeight = 660;
  let canvasPixelRatio = 1;
  const isMobileCanvas = () => canvasWidth === MOBILE_CANVAS_WIDTH;

  let state;
  let clockInterval;
  let aiTimeout;
  let dealInterval;
  let diceInterval;
  let roundPauseInterval;
  let attributeAnimationFrame;
  let resultAnimationFrame;
  let audioContext;
  let soundEnabled = true;
  let hoverCard = -1;
  let hoverOpponentCard = -1;
  let onlineRole = null;
  let onlineSession = null;
  let onlineNames = null;
  let systemEventSequence = 0;
  let lastSystemEventId = 0;
  let swapRequestPending = false;

  const isOnlineHost = () => onlineRole === "host";
  const isOnlineGuest = () => onlineRole === "guest";

  function showGameView() {
    mainMenu.hidden = true;
    gameShell.hidden = false;
    leaveGameButton.hidden = false;
    restartButton.hidden = Boolean(onlineRole);
    document.body.classList.toggle("online-mode", Boolean(onlineRole));
  }

  function showMenuView() {
    clearGameTimers();
    if (attributeAnimationFrame) window.cancelAnimationFrame(attributeAnimationFrame);
    if (resultAnimationFrame) window.cancelAnimationFrame(resultAnimationFrame);
    attributeAnimationFrame = null;
    resultAnimationFrame = null;
    state = null;
    onlineRole = null;
    onlineSession = null;
    onlineNames = null;
    mainMenu.hidden = false;
    gameShell.hidden = true;
    leaveGameButton.hidden = true;
    connectionLogButton.hidden = true;
    document.body.classList.remove("online-mode");
  }

  function startOfflineGame() {
    onlineRole = null;
    onlineSession = null;
    onlineNames = null;
    connectionLogButton.hidden = true;
    showGameView();
    startGame();
  }

  function startOnlineHost(session, names) {
    onlineRole = "host";
    onlineSession = session;
    onlineNames = names;
    showGameView();
    startGame();
  }

  function waitForOnlineGame(session, names) {
    onlineRole = "guest";
    onlineSession = session;
    onlineNames = names;
    lastSystemEventId = 0;
    swapRequestPending = false;
    state = null;
    showGameView();
  }

  function sendOnlineAction(action, type, index) {
    if (!onlineSession) return false;
    const message = { kind: "game-action", action };
    if (type !== undefined) message.type = type;
    if (index !== undefined) message.index = index;
    return onlineSession.send(message);
  }

  function requestRematch() {
    if (!onlineRole) {
      startGame();
      return;
    }
    if (!state || state.phase !== "game-over" || state.rematch.player) return;

    state.rematch.player = true;
    if (isOnlineGuest() && !sendOnlineAction("rematch")) {
      state.rematch.player = false;
      render();
      return;
    }
    if (isOnlineHost() && state.rematch.ai) {
      startGame();
      return;
    }
    render();
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function createDeck() {
    const commonDeck = Object.entries(COMMON_CARD_COUNTS).flatMap(([type, count]) => (
      Array(count).fill(type)
    ));
    return shuffle([...commonDeck, ...SPECIAL_CARDS]);
  }

  function dealInitialHand(deck, discard) {
    const hand = [];
    const speciesCounts = Object.fromEntries(COMMON_CARDS.map((type) => [type, 0]));
    while (hand.length < INITIAL_HAND_SIZE && deck.length > 0) {
      const type = deck.pop();
      if (!SPECIAL_CARDS.includes(type) && speciesCounts[type] >= MAX_CARDS_PER_SPECIES) {
        discard.push(type);
        continue;
      }
      hand.push(type);
      if (!SPECIAL_CARDS.includes(type)) speciesCounts[type] += 1;
    }
    return hand;
  }

  function makePlayer(name, hand) {
    return {
      name,
      hp: 5,
      luck: 0,
      shields: 0,
      extraDrawBlocks: 0,
      hand
    };
  }

  function clearGameTimers() {
    window.clearInterval(clockInterval);
    window.clearInterval(dealInterval);
    window.clearInterval(diceInterval);
    window.clearInterval(roundPauseInterval);
    window.clearTimeout(aiTimeout);
  }

  function appendSystemEvent(event) {
    if (!state) return;
    state.systemEvents.push(event);
    if (state.systemEvents.length > 40) state.systemEvents.shift();
    if (onlineRole && window.BlefeOnline) window.BlefeOnline.logGameEvent(event);
  }

  function recordSystemEvent(text) {
    if (!state || typeof text !== "string" || !text.trim()) return;
    appendSystemEvent({
      id: ++systemEventSequence,
      round: state.round,
      kind: "system",
      text: text.trim().slice(0, 180)
    });
  }

  function logLocalSystemMessage(text) {
    if (onlineRole && window.BlefeOnline) window.BlefeOnline.logGameEvent(text);
  }

  function recordRoundResult(reveal) {
    const playedBy = state.players[reveal.owner];
    const guesser = state.players[reveal.guesser];
    appendSystemEvent({
      id: ++systemEventSequence,
      round: state.round,
      kind: "round-result",
      cardType: reveal.actualType,
      playedBy: playedBy.name,
      guesser: guesser.name,
      correct: reveal.correct,
      attributes: reveal.attributes
    });
  }

  function syncSystemEvents(events) {
    for (const event of events) {
      if (event.id <= lastSystemEventId) continue;
      if (window.BlefeOnline) window.BlefeOnline.logGameEvent(event);
      lastSystemEventId = event.id;
    }
  }

  function prepareAudio() {
    if (!soundEnabled || !window.AudioContext) return;
    if (!audioContext) audioContext = new window.AudioContext();
    if (audioContext.state === "suspended") audioContext.resume();
  }

  function playCardSound(type) {
    if (!soundEnabled || !audioContext || audioContext.state !== "running") return;
    const frequencies = {
      leao: 392,
      coelho: 587,
      vaca: 330,
      peixe: 523,
      tigre: 440,
      macaco: 659,
      elefante: 349,
      tartaruga: 494,
      troca: 466,
      coringa: 784
    };
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    const frequency = frequencies[type];
    oscillator.type = type === "coringa" ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.25, now + 0.1);
    volume.gain.setValueAtTime(0.001, now);
    volume.gain.exponentialRampToValueAtTime(0.07, now + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    oscillator.connect(volume);
    volume.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }

  function startGame() {
    clearGameTimers();
    hoverCard = -1;
    hoverOpponentCard = -1;
    swapRequestPending = false;
    if (resultAnimationFrame) {
      window.cancelAnimationFrame(resultAnimationFrame);
      resultAnimationFrame = null;
    }
    const extraDeck = createDeck();
    const extraDiscard = [];
    state = {
      players: {
        player: makePlayer(
          onlineNames ? onlineNames.local : "Você",
          dealInitialHand(extraDeck, extraDiscard)
        ),
        ai: makePlayer(
          onlineNames ? onlineNames.remote : "IA",
          dealInitialHand(extraDeck, extraDiscard)
        )
      },
      extraDeck,
      extraDiscard,
      phase: "dealing",
      round: 1,
      seconds: TURN_SECONDS,
      pending: null,
      pendingJokerReveal: null,
      setupCard: null,
      setupGuesses: { player: null, ai: null },
      guesses: {},
      lastReveal: null,
      systemEvents: [],
      swapAbility: null,
      pauseSeconds: 0,
      resultSequence: 0,
      visualEffectSequence: 0,
      visualEffect: null,
      visualEffectStartedAt: null,
      playerPlayHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      playerGuessHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      aiPlayHistory: Object.fromEntries(CARD_TYPES.map((type) => [type, 0])),
      eliminated: [],
      hintUsed: false,
      gameOver: false,
      rematch: { player: false, ai: false },
      dealt: { player: 0, ai: 0 },
      startingPlayer: null,
      aiHasJoker: false,
      jokerDistributed: false,
      dice: { player: 1, ai: 1 },
      diceFrame: 0,
      attributeAnimations: [],
      message: "Embaralhando as cartas...",
      log: "Distribuindo a mão."
    };
    if (attributeAnimationFrame) {
      window.cancelAnimationFrame(attributeAnimationFrame);
      attributeAnimationFrame = null;
    }

    state.jokerDistributed = state.players.player.hand.includes("coringa") || state.players.ai.hand.includes("coringa");
    state.aiHasJoker = state.players.ai.hand.includes("coringa");

    recordSystemEvent("Partida iniciada. Boa sorte!");
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
    state.setupGuesses.ai = isOnlineHost() ? null : chooseGuess(probabilities, false, COMMON_CARDS);
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
      const timedPhases = ["player-play", "player-guess", "setup-guess", "player-joker-select"];
      if (onlineRole) timedPhases.push("ai-play", "ai-guess", "ai-joker-select");
      if (state.gameOver || !timedPhases.includes(state.phase)) return;
      state.seconds -= 1;
      if (state.seconds <= 0) {
        state.seconds = 0;
        window.clearInterval(clockInterval);
        onTimeout();
      }
      if (isOnlineHost()) render();
      else updateTimer();
    }, 1000);
  }

  function beginRoundPause(onComplete) {
    window.clearInterval(roundPauseInterval);
    state.pauseSeconds = RESULT_PAUSE_SECONDS;
    const deadline = Date.now() + RESULT_PAUSE_SECONDS * 1000;
    render();
    roundPauseInterval = window.setInterval(() => {
      if (!state || state.phase !== "result") {
        window.clearInterval(roundPauseInterval);
        return;
      }
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (state.pauseSeconds !== secondsLeft) {
        state.pauseSeconds = secondsLeft;
        render();
      }
      if (secondsLeft === 0) {
        window.clearInterval(roundPauseInterval);
        onComplete();
      }
    }, 100);
  }

  function onTimeout() {
    if (isOnlineHost() && state.phase === "ai-play") {
      const hand = state.players.ai.hand;
      playCard("ai", hand[Math.floor(Math.random() * hand.length)]);
    } else if (isOnlineHost() && state.phase === "ai-guess") {
      const choices = CARD_TYPES.filter((type) => !state.eliminated.includes(type));
      submitGuess("ai", choices[Math.floor(Math.random() * choices.length)]);
    } else if (isOnlineHost() && state.phase === "setup-guess") {
      if (!state.setupGuesses.player) {
        state.setupGuesses.player = COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)];
      }
      if (!state.setupGuesses.ai) {
        state.setupGuesses.ai = COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)];
      }
      state.phase = "setup-revealing";
      render();
      aiTimeout = window.setTimeout(resolveSetupChallenge, 650);
    } else if (state.phase === "player-joker-select" || state.phase === "ai-joker-select") {
      const target = state.pendingJokerReveal && state.players[state.pendingJokerReveal.target];
      if (!target || target.hand.length === 0) {
        finishJokerReveal([]);
        return;
      }
      const selected = state.pendingJokerReveal.selectedIndices;
      const needed = Math.min(2, target.hand.length);
      const remaining = shuffle(Array.from({ length: target.hand.length }, (_, index) => index)
        .filter((index) => !selected.includes(index)))
        .slice(0, needed - selected.length);
      if (state.phase === "player-joker-select") {
        remaining.forEach(submitJokerReveal);
      } else {
        finishJokerReveal([...selected, ...remaining]);
      }
    } else if (state.phase === "player-play") {
      const hand = state.players.player.hand;
      const type = hand[Math.floor(Math.random() * hand.length)];
      recordSystemEvent("Tempo esgotado: carta escolhida automaticamente.");
      state.log = "Tempo esgotado: carta escolhida automaticamente.";
      playCard("player", type);
    } else if (state.phase === "player-guess") {
      const choices = CARD_TYPES.filter((type) => !state.eliminated.includes(type));
      recordSystemEvent("Tempo esgotado: palpite escolhido automaticamente.");
      submitGuess("player", choices[Math.floor(Math.random() * choices.length)]);
    } else if (state.phase === "setup-guess") {
      const type = COMMON_CARDS[Math.floor(Math.random() * COMMON_CARDS.length)];
      submitSetupGuess(type);
    }
  }

  function submitSetupGuess(type) {
    if (state.phase !== "setup-guess") return;
    window.clearInterval(clockInterval);
    if (isOnlineGuest()) {
      sendOnlineAction("setup-guess", type);
      state.phase = "setup-wait";
      state.message = "Palpite enviado. Aguardando o outro jogador...";
      logLocalSystemMessage(state.message);
      render();
      return;
    }
    state.setupGuesses.player = type;
    if (isOnlineHost() && !state.setupGuesses.ai) {
      state.message = `Aguardando o palpite de ${state.players.ai.name}...`;
      recordSystemEvent(state.message);
      render();
      beginTimedPhase();
      return;
    }
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
      recordSystemEvent(`Palpite inicial: ${name} acertou ${CARDS[state.setupCard].emoji} ${CARDS[state.setupCard].name}.`);
      render();
      aiTimeout = window.setTimeout(() => startTurn(starter), OPENING_RESULT_PAUSE_MS);
      return;
    }

    state.phase = "dice-roll";
    state.message = "Empate nos palpites. Dados!";
    state.log = "Desempate na mesa.";
    recordSystemEvent("Empate nos palpites iniciais. Desempate nos dados.");
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
        recordSystemEvent(`Dados empatados (${state.dice.player} × ${state.dice.ai}). Novo lance.`);
        render();
        aiTimeout = window.setTimeout(rollDice, 550);
        return;
      }

      const starter = state.dice.player > state.dice.ai ? "player" : "ai";
      const name = state.players[starter].name;
      state.message = `${state.dice.player} × ${state.dice.ai} · ${name} começa.`;
      state.log = `${name} venceu no dado.`;
      recordSystemEvent(`Desempate: ${name} venceu nos dados (${state.dice.player} × ${state.dice.ai}).`);
      render();
      aiTimeout = window.setTimeout(() => startTurn(starter), OPENING_RESULT_PAUSE_MS);
    }, 100);
  }

  function startTurn(playerKey) {
    if (state.gameOver) return;
    state.startingPlayer = playerKey;
    state.phase = playerKey === "player" ? "player-play" : "ai-play";
    state.setupCard = null;
    state.guesses = {};
    state.lastReveal = null;
    state.pauseSeconds = 0;
    expireSwapAbility();
    state.message = playerKey === "player"
      ? `Vez do jogador ${state.players.player.name}.`
      : isOnlineHost()
        ? `Aguardando a jogada de ${state.players.ai.name}.`
        : "A IA começa.";
    state.log = `${state.players[playerKey].name} começa.`;
    recordSystemEvent(`Rodada ${state.round}: Vez do jogador ${state.players[playerKey].name}.`);
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
    const blocked = Math.min(count, player.extraDrawBlocks);
    player.extraDrawBlocks -= blocked;
    for (let index = blocked; index < count; index += 1) {
      if (state.extraDeck.length === 0 && state.extraDiscard.length === 0) break;
      const type = drawExtraCard();
      if (!type) break;
      if (type !== "coringa" && player.hand.filter((card) => card === type).length >= MAX_CARDS_PER_SPECIES) {
        state.extraDiscard.push(type);
        continue;
      }
      player.hand.push(type);
      drawn.push(type);
      if (type === "coringa") state.jokerDistributed = true;
      if (playerKey === "ai" && type === "coringa") state.aiHasJoker = true;
    }
    return { drawn, blocked };
  }

  function hasCardsToDraw() {
    return state.extraDeck.length > 0 || state.extraDiscard.length > 0;
  }

  function describeCardDraw(result) {
    const parts = [];
    if (result.drawn.length > 0) {
      const count = result.drawn.length;
      parts.push(`+${count} ${count === 1 ? "carta" : "cartas"}`);
    }
    if (result.blocked > 0) {
      parts.push(`${result.blocked} ${result.blocked === 1 ? "bloqueada" : "bloqueadas"} pela Tartaruga`);
    }
    return parts.length > 0 ? parts.join(", ") : "nenhuma carta comprada";
  }

  function describeDamage(result) {
    const parts = [];
    if (result.blocked > 0) {
      parts.push(`${result.blocked} ${result.blocked === 1 ? "dano bloqueado" : "danos bloqueados"} por escudo`);
    }
    if (result.lost > 0) {
      parts.push(`−${result.lost} ${result.lost === 1 ? "vida" : "vidas"}`);
    }
    return parts.length > 0 ? parts.join(", ") : "sem dano";
  }

  function gainLuck(player, amount) {
    const gained = Math.min(amount, MAX_LUCK - player.luck);
    player.luck += gained;
    return `+${gained} sorte`;
  }

  function gainShield(player, amount) {
    player.shields += amount;
    return `+${amount} ${amount === 1 ? "escudo" : "escudos"}`;
  }

  function recoverLifeOrShield(player) {
    if (player.hp < 5) {
      player.hp += 1;
      return "+1 vida";
    }
    player.shields += 1;
    return "+1 escudo (vida cheia)";
  }

  function resolveCardEffect(type, ownerKey, guesserKey, correct) {
    const owner = state.players[ownerKey];
    const guesser = state.players[guesserKey];
    if (correct) {
      switch (type) {
        case "tigre":
        case "tartaruga":
          return recoverLifeOrShield(guesser);
        case "peixe":
          if (guesser.hp >= 5) return "vida já está cheia";
          guesser.hp += 1;
          return "+1 vida";
        case "macaco":
        case "vaca":
        case "coelho":
          return gainLuck(guesser, 1);
        case "elefante":
          return gainShield(guesser, 1);
        default:
          return "sem efeito";
      }
    }

    switch (type) {
      case "leao": {
        const damage = describeDamage(applyDamage(guesser, 2));
        const draw = describeCardDraw(drawBonusCards(guesserKey, 1));
        return `${damage}; compra ${draw}; ${owner.name} ${gainLuck(owner, 1)}`;
      }
      case "tigre": {
        const damage = describeDamage(applyDamage(guesser, 1));
        const draw = describeCardDraw(drawBonusCards(guesserKey, 2));
        return `${damage}; compra ${draw}`;
      }
      case "peixe": {
        const draw = describeCardDraw(drawBonusCards(guesserKey, 3));
        return `compra ${draw}; ${owner.name} ${gainLuck(owner, 2)}`;
      }
      case "macaco": {
        const draw = describeCardDraw(drawBonusCards(guesserKey, 4));
        return `compra ${draw}; ${owner.name} ${gainLuck(owner, 3)}`;
      }
      case "elefante": {
        const damage = describeDamage(applyDamage(guesser, 2));
        const draw = describeCardDraw(drawBonusCards(guesserKey, 2));
        return `${damage}; compra ${draw}; ${owner.name} ${gainShield(owner, 1)}`;
      }
      case "vaca": {
        const draw = describeCardDraw(drawBonusCards(guesserKey, 2));
        return `compra ${draw}; ${owner.name} ${gainShield(owner, 2)}`;
      }
      case "coelho": {
        const draw = describeCardDraw(drawBonusCards(guesserKey, 3));
        return `compra ${draw}; ${owner.name} ${gainLuck(owner, 2)}`;
      }
      case "tartaruga": {
        const draw = describeCardDraw(drawBonusCards(guesserKey, 1));
        const lostShield = guesser.shields > 0;
        if (lostShield) guesser.shields -= 1;
        return `compra ${draw}; ${lostShield ? "−1 escudo" : "sem escudo para perder"}; ${owner.name} ${gainShield(owner, 1)}`;
      }
      case "coringa": {
        const healed = Math.min(1, 5 - owner.hp);
        owner.hp += healed;
        return `${owner.name} +${healed} vida; pode revelar até 2 cartas`;
      }
      case "troca":
        state.swapAbility = { owner: ownerKey, expiresAfterRound: state.round + 2 };
        return `${owner.name} pode trocar as mãos durante as 2 próximas rodadas`;
      default:
        return "sem efeito";
    }
  }

  function isSwapAvailable(ownerKey = "player") {
    return Boolean(
      state.swapAbility
      && state.swapAbility.owner === ownerKey
      && state.round <= state.swapAbility.expiresAfterRound
      && !state.gameOver
    );
  }

  function exchangeHands(ownerKey) {
    if (!isSwapAvailable(ownerKey)) return false;
    const targetKey = ownerKey === "player" ? "ai" : "player";
    const owner = state.players[ownerKey];
    const target = state.players[targetKey];
    [owner.hand, target.hand] = [target.hand, owner.hand];
    state.aiHasJoker = state.players.ai.hand.includes("coringa");
    state.swapAbility = null;
    swapRequestPending = false;
    state.message = "Troca de mãos!";
    state.log = state.message;
    recordSystemEvent(`${owner.name} trocou as mãos com ${target.name}.`);
    state.attributeAnimations = [
      { playerKey: "player", text: "mão trocada", color: "#d9c477", startedAt: performance.now() },
      { playerKey: "ai", text: "mão trocada", color: "#d9c477", startedAt: performance.now() }
    ];
    triggerVisualEffect("swap");
    animateAttributeChanges();
    render();
    return true;
  }

  function completeHandSwap(ownerKey) {
    if (!exchangeHands(ownerKey)) return false;
    window.clearInterval(clockInterval);
    window.clearInterval(roundPauseInterval);
    window.clearTimeout(aiTimeout);
    state.round += 1;
    state.pending = null;
    state.pendingJokerReveal = null;
    state.guesses = {};
    state.lastReveal = null;
    state.eliminated = [];
    state.hintUsed = false;
    state.pauseSeconds = 0;
    state.phase = "player-play";
    state.message = `Troca concluída. Rodada ${state.round}: vez do jogador ${state.players.player.name}.`;
    state.log = state.message;
    recordSystemEvent(state.message);
    expireSwapAbility();
    if (state.players.player.hand.length === 0) {
      endGame("player", `${state.players.player.name} venceu · sem cartas`);
    } else if (state.players.ai.hand.length === 0) {
      endGame("ai", `${state.players.ai.name} venceu · sem cartas`);
    } else {
      beginTimedPhase();
    }
    render();
    return true;
  }

  function triggerVisualEffect(kind, details = {}) {
    state.visualEffect = {
      id: ++state.visualEffectSequence,
      kind,
      ...details
    };
    state.visualEffectStartedAt = performance.now();
    animateVisualEffect();
  }

  function animateVisualEffect() {
    if (!state || !state.visualEffect || state.visualEffectStartedAt === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (resultAnimationFrame) window.cancelAnimationFrame(resultAnimationFrame);
    const effectId = state.visualEffect.id;
    const drawFrame = () => {
      if (!state || !state.visualEffect || state.visualEffect.id !== effectId) {
        resultAnimationFrame = null;
        return;
      }
      if (performance.now() - state.visualEffectStartedAt >= 1000) {
        resultAnimationFrame = null;
        drawTable();
        return;
      }
      drawTable();
      resultAnimationFrame = window.requestAnimationFrame(drawFrame);
    };
    resultAnimationFrame = window.requestAnimationFrame(drawFrame);
  }

  function useSwapHands() {
    if (!isSwapAvailable("player") || swapRequestPending) return;
    if (isOnlineGuest()) {
      if (!sendOnlineAction("swap-hands")) return;
      swapRequestPending = true;
      render();
      return;
    }
    completeHandSwap("player");
  }

  function expireSwapAbility() {
    if (state.swapAbility && state.round > state.swapAbility.expiresAfterRound) {
      const owner = state.players[state.swapAbility.owner];
      recordSystemEvent(`A oportunidade de Troca de ${owner.name} terminou.`);
      state.swapAbility = null;
    }
  }

  function playCard(playerKey, type) {
    if (state.gameOver) return;
    const player = state.players[playerKey];
    const cardIndex = player.hand.indexOf(type);
    if (cardIndex < 0) return;
    if (isOnlineGuest()) {
      if (playerKey !== "player" || state.phase !== "player-play") return;
      sendOnlineAction("play", type);
      state.phase = "ai-play";
      state.message = "Jogada enviada. Aguardando a resposta...";
      logLocalSystemMessage(state.message);
      render();
      return;
    }

    window.clearInterval(clockInterval);
    player.hand.splice(cardIndex, 1);
    state.extraDiscard.push(type);
    if (playerKey === "ai" && type === "coringa") state.aiHasJoker = false;
    if (playerKey === "player") state.playerPlayHistory[type] += 1;
    if (playerKey === "ai") state.aiPlayHistory[type] += 1;
    playCardSound(type);
    state.pending = { owner: playerKey, type };
    state.lastReveal = null;
    state.guesses = {};
    state.eliminated = [];
    state.hintUsed = false;

    if (playerKey === "player") {
      state.phase = "ai-guess";
      state.message = isOnlineHost()
        ? `Aguardando o palpite de ${state.players.ai.name}.`
        : "A IA está escolhendo o palpite.";
      if (isOnlineHost()) recordSystemEvent(state.message);
      render();
      if (isOnlineHost()) {
        beginTimedPhase();
        return;
      }
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
        weights[type] = state.aiHasJoker ? 0 : 0.04;
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
        .sort((a, b) => probabilities[a] - probabilities[b])
        .slice(0, Math.min(2, available.length - 1));
      for (const type of leastLikely) available.splice(available.indexOf(type), 1);
    }

    return sampleByScore(available, (guess) => {
      let value = 0;
      const penalties = {
        leao: 2.2,
        coelho: state.players.ai.luck > 0 ? 0.7 : 1,
        vaca: 0.3,
        peixe: state.players.ai.luck >= 2 ? 1.2 : 1,
        tigre: 1,
        macaco: 0.8,
        elefante: 1,
        tartaruga: 0.4,
        coringa: 1.5
      };
      for (const actual of CARD_TYPES) {
        const chance = probabilities[actual] || 0;
        if (guess !== actual) value -= chance * penalties[actual];
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
    if (isOnlineGuest()) {
      if (guesserKey !== "player" || state.phase !== "player-guess") return;
      sendOnlineAction("guess", guess);
      state.phase = "ai-guess";
      state.message = "Palpite enviado. Aguardando o resultado...";
      logLocalSystemMessage(state.message);
      render();
      return;
    }
    if (!state.pending || !["player-guess", "ai-guess"].includes(state.phase)) return;
    window.clearInterval(clockInterval);
    state.guesses[guesserKey] = guess;
    state.phase = "revealing";
    state.message = "Palpite na mesa...";
    state.log = "Revelando a carta.";
    render();
    aiTimeout = window.setTimeout(() => resolveGuess(guesserKey, guess), 650);
  }

  function recordResolvedGuess(reveal) {
    recordRoundResult(reveal);
  }

  function applyDamage(player, amount) {
    const blocked = Math.min(player.shields, amount);
    player.shields -= blocked;
    const lost = Math.min(player.hp, amount - blocked);
    player.hp -= lost;
    return { blocked, lost };
  }

  function getPlayerAttributes(player) {
    return {
      hp: player.hp,
      luck: player.luck,
      shields: player.shields,
      cards: player.hand.length
    };
  }

  function createAttributeAnimations(previousAttributes) {
    const changes = [];
    const attributes = [
      ["hp", "vida", "vidas", "#ff887d"],
      ["luck", "sorte", "sorte", "#d9c477"],
      ["shields", "escudo", "escudos", "#78d5aa"],
      ["cards", "carta", "cartas", "#c9ef74"]
    ];

    for (const playerKey of ["player", "ai"]) {
      const current = getPlayerAttributes(state.players[playerKey]);
      for (const [attribute, singular, plural, color] of attributes) {
        const change = current[attribute] - previousAttributes[playerKey][attribute];
        if (change === 0) continue;
        const amount = Math.abs(change);
        const name = amount === 1 ? singular : plural;
        changes.push({
          playerKey,
          attribute,
          value: change,
          text: `${change > 0 ? "+" : "−"}${amount} ${name}`,
          color,
          startedAt: performance.now()
        });
      }
    }
    return changes;
  }

  function animateAttributeChanges() {
    if (!state.attributeAnimations.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.attributeAnimations = [];
      return;
    }
    const finishAt = Math.max(...state.attributeAnimations.map((item) => item.startedAt)) + 1100;
    const drawFrame = () => {
      if (!state || !state.attributeAnimations.length) {
        attributeAnimationFrame = null;
        return;
      }
      if (performance.now() >= finishAt) {
        state.attributeAnimations = [];
        attributeAnimationFrame = null;
        drawTable();
        return;
      }
      drawTable();
      attributeAnimationFrame = window.requestAnimationFrame(drawFrame);
    };
    attributeAnimationFrame = window.requestAnimationFrame(drawFrame);
  }

  function resolveGuess(guesserKey, guess) {
    if (state.gameOver || !state.pending) return;
    const { owner, type: actualType } = state.pending;
    const guesser = state.players[guesserKey];
    const playedBy = state.players[owner];
    const previousAttributes = {
      player: getPlayerAttributes(state.players.player),
      ai: getPlayerAttributes(state.players.ai)
    };
    const correct = guess === actualType;
    if (guesserKey === "player") state.playerGuessHistory[guess] += 1;
    const effect = resolveCardEffect(actualType, owner, guesserKey, correct);
    const effectSummary = correct && effect === "sem efeito" ? "nada acontece" : effect;
    state.message = correct ? "Palpite certo!" : "Palpite errado!";
    state.attributeAnimations = createAttributeAnimations(previousAttributes);
    const attributeChanges = state.attributeAnimations.map((animation) => ({
      playerName: state.players[animation.playerKey].name,
      attribute: animation.attribute,
      value: animation.value
    }));
    animateAttributeChanges();
    state.phase = "result";
    state.lastReveal = {
      id: ++state.resultSequence,
      owner,
      actualType,
      guess,
      guesser: guesserKey,
      correct,
      effectSummary,
      attributes: attributeChanges,
      summary: state.message,
      revealedCards: []
    };
    triggerVisualEffect("reveal", { cardType: actualType, correct });
    state.pending = null;
    state.pendingJokerReveal = null;
    state.log = state.message;

    const needsJokerReveal = !correct
      && actualType === "coringa"
      && guesser.hand.length > 0
      && guesser.hp > 0
      && playedBy.hand.length > 0;
    if (!needsJokerReveal) recordResolvedGuess(state.lastReveal);

    if (guesser.hp <= 0) {
      guesser.hp = 0;
      endGame(owner, `${playedBy.name} venceu · vida zerada`);
    } else if (playedBy.hand.length === 0) {
      endGame(owner, `${playedBy.name} venceu · sem cartas`);
    }

    if (!state.gameOver && needsJokerReveal) {
      beginJokerReveal(owner, guesserKey);
      return;
    }

    render();
    if (!state.gameOver) {
      beginRoundPause(advanceAfterResult);
    }
  }

  function beginJokerReveal(ownerKey, targetKey) {
    state.pendingJokerReveal = { owner: ownerKey, target: targetKey, selectedIndices: [] };
    if (ownerKey === "ai" && !isOnlineHost()) {
      state.phase = "ai-joker-select";
      state.message = "O Coringa revela duas cartas...";
      const target = state.players[targetKey];
      const indices = shuffle(Array.from({ length: target.hand.length }, (_, index) => index))
        .slice(0, Math.min(2, target.hand.length));
      finishJokerReveal(indices);
      return;
    }
    state.phase = ownerKey === "player" ? "player-joker-select" : "ai-joker-select";
    state.message = ownerKey === "player"
      ? "Clique em até duas cartas da mão adversária."
      : `Aguardando ${state.players.ai.name} selecionar cartas.`;
    recordSystemEvent(`${state.players[ownerKey].name}: clique em até duas cartas da mão adversária para revelar.`);
    beginTimedPhase();
    render();
  }

  function submitJokerReveal(index) {
    if (state.phase !== "player-joker-select" || !state.pendingJokerReveal) return;
    const target = state.players[state.pendingJokerReveal.target];
    if (!Number.isInteger(index) || index < 0 || index >= target.hand.length) return;
    const selected = state.pendingJokerReveal.selectedIndices;
    if (selected.includes(index) || selected.length >= Math.min(2, target.hand.length)) return;
    if (isOnlineGuest()) {
      if (!sendOnlineAction("joker-reveal", undefined, index)) return;
    }
    selected.push(index);
    if (selected.length >= Math.min(2, target.hand.length)) {
      if (!isOnlineGuest()) finishJokerReveal(selected);
      else {
        state.message = "Duas cartas selecionadas.";
        render();
      }
    } else {
      state.message = "Escolha mais uma carta.";
      render();
    }
  }

  function receiveJokerRevealSelection(index) {
    if (
      state.phase !== "ai-joker-select"
      || !state.pendingJokerReveal
      || state.pendingJokerReveal.owner !== "ai"
    ) return;
    const target = state.players[state.pendingJokerReveal.target];
    const selected = state.pendingJokerReveal.selectedIndices;
    if (
      !Number.isInteger(index)
      || index < 0
      || index >= target.hand.length
      || selected.includes(index)
      || selected.length >= Math.min(2, target.hand.length)
    ) return;
    selected.push(index);
    if (selected.length >= Math.min(2, target.hand.length)) finishJokerReveal(selected);
    else render();
  }

  function finishJokerReveal(indices) {
    if (!state.pendingJokerReveal || !state.lastReveal) return;
    window.clearInterval(clockInterval);
    const target = state.players[state.pendingJokerReveal.target];
    const revealedCards = Array.isArray(indices)
      ? indices.filter((index) => Number.isInteger(index) && index >= 0 && index < target.hand.length)
        .slice(0, 2)
        .map((index) => target.hand[index])
      : [];
    state.lastReveal.revealedCards = revealedCards;
    state.lastReveal.summary = `Coringa revelou ${revealedCards.length} ${revealedCards.length === 1 ? "carta" : "cartas"}.`;
    state.message = state.lastReveal.summary;
    state.log = state.message;
    recordResolvedGuess(state.lastReveal);
    recordSystemEvent(`Coringa revelou ${revealedCards.length} cartas da mão adversária.`);
    state.pendingJokerReveal = null;
    state.phase = "result";
    render();
    if (!state.gameOver) beginRoundPause(advanceAfterResult);
  }

  function endGame(winnerKey, reason) {
    state.phase = "game-over";
    state.gameOver = true;
    state.winner = winnerKey;
    state.message = winnerKey === "player" ? `Vitória · ${reason}` : `Derrota · ${reason}`;
    state.log = reason;
    recordSystemEvent(state.message);
  }

  function useLuck() {
    if (state.phase !== "player-guess" || state.players.player.luck < 1 || state.hintUsed) return;
    if (isOnlineGuest()) {
      sendOnlineAction("use-luck");
      state.phase = "ai-guess";
      state.message = "Usando sorte...";
      logLocalSystemMessage(state.message);
      render();
      return;
    }
    applyLuck("player");
  }

  function applyLuck(guesserKey) {
    const guesser = state.players[guesserKey];
    if (guesser.luck < 1 || state.hintUsed || !state.pending) return;
    const wrongOptions = shuffle(CARD_TYPES.filter((type) => type !== state.pending.type));
    state.eliminated = wrongOptions.slice(0, Math.min(2, wrongOptions.length));
    if (state.eliminated.length === 0) return;
    state.hintUsed = true;
    guesser.luck -= 1;
    const eliminatedNames = state.eliminated.map((type) => CARDS[type].name).join(" nem ");
    state.log = `Sorte: não é ${eliminatedNames}.`;
    state.message = state.log;
    recordSystemEvent(`${guesser.name} usou sorte para eliminar duas opções.`);
    render();
  }

  function advanceAfterResult() {
    if (state.phase !== "result") return;
    if (state.lastReveal.owner === "player") {
      startAiTurn();
      return;
    }
    state.round += 1;
    expireSwapAbility();
    state.guesses = {};
    state.lastReveal = null;
    state.pauseSeconds = 0;
    state.phase = "player-play";
    state.message = `Vez do jogador ${state.players.player.name}.`;
    state.log = `Rodada ${state.round}`;
    recordSystemEvent(`Rodada ${state.round}: Vez do jogador ${state.players.player.name}.`);
    beginTimedPhase();
    render();
  }

  function startAiTurn() {
    if (state.gameOver) return;
    if (
      !onlineRole
      && isSwapAvailable("ai")
      && state.players.ai.hand.length < state.players.player.hand.length
    ) exchangeHands("ai");
    state.guesses = {};
    state.lastReveal = null;
    state.pauseSeconds = 0;
    if (state.players.ai.hand.length === 0) {
      endGame("ai", `${state.players.ai.name} sem cartas`);
      render();
      return;
    }
    if (isOnlineHost()) {
      state.phase = "ai-play";
      state.message = `Aguardando a jogada de ${state.players.ai.name}.`;
      recordSystemEvent(state.message);
      beginTimedPhase();
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
      leao: 2.2 * (1 - guessProbability.leao) + (playerIsWeak ? 0.7 : 0),
      coelho: 1 * (1 - guessProbability.coelho),
      vaca: 0.3 * (1 - guessProbability.vaca),
      peixe: 1.2 * (1 - guessProbability.peixe),
      tigre: 1 * (1 - guessProbability.tigre),
      macaco: 0.8 * (1 - guessProbability.macaco),
      elefante: 1 * (1 - guessProbability.elefante),
      tartaruga: 0.4 * (1 - guessProbability.tartaruga),
      troca: 0.6 * (1 - guessProbability.troca),
      coringa: 1.5 * (1 - guessProbability.coringa)
    };
    const mixedScores = (type) => scores[type] - state.aiPlayHistory[type] * 0.4;

    if (Math.random() < 0.65) return hand[Math.floor(Math.random() * hand.length)];
    return sampleByScore(hand, mixedScores, 1.6);
  }

  function render() {
    if (!state) return;
    drawTable();
    updateTimer();
    roundCountdown.hidden = state.phase !== "result" || state.pauseSeconds <= 0;
    roundCountdownValue.textContent = String(state.pauseSeconds || RESULT_PAUSE_SECONDS);
    updateTurnTools();
    const showTableResult = state.phase === "game-over";
    tableOverlay.hidden = !showTableResult;
    tableResult.textContent = showTableResult ? state.message : "";
    tableRestartButton.hidden = !showTableResult;
    tableRestartButton.disabled = Boolean(onlineRole && state.rematch.player);
    tableRestartButton.textContent = !onlineRole
      ? "Jogar novamente"
      : state.rematch.player
        ? state.rematch.ai ? "Preparando revanche..." : "Aguardando aceitação..."
        : state.rematch.ai ? "Aceitar revanche" : "Pedir revanche";
    tableFooter.hidden = state.phase === "game-over";
    restartButton.hidden = Boolean(onlineRole);
    actionArea.hidden = !(state.phase === "player-guess"
      || (state.phase === "setup-guess" && (!isOnlineHost() || !state.setupGuesses.player)));
    renderActions();
    canvas.setAttribute("aria-label", getCanvasDescription());
    if (isOnlineHost() && onlineSession && state.phase !== "dealing") {
      onlineSession.send({ kind: "game-state", snapshot: createOnlineSnapshot() });
    }
  }

  function updateTurnTools() {
    useLuckButton.hidden = state.phase !== "player-guess";
    useLuckButton.disabled = state.players.player.luck < 1 || state.hintUsed;
    useLuckButton.textContent = `✦ Usar sorte (${state.players.player.luck})`;
    useLuckButton.setAttribute("aria-label", `Usar sorte: ${state.players.player.luck}`);
    swapHandsButton.hidden = !isSwapAvailable("player");
    swapHandsButton.disabled = swapRequestPending;
    swapHandsButton.textContent = swapRequestPending ? "Aguardando troca..." : "🔄 Trocar mãos";
    swapHandsButton.setAttribute("aria-label", "Trocar todas as cartas da mão com o adversário");
  }

  function createOnlineSnapshot() {
    const snapshot = JSON.parse(JSON.stringify(state));
    const remotePlayer = snapshot.players.ai;
    const privateHostHandSize = snapshot.players.player.hand.length;
    snapshot.players = {
      player: remotePlayer,
      ai: {
        ...snapshot.players.player,
        hand: Array(privateHostHandSize).fill(null)
      }
    };
    snapshot.rematch = { player: state.rematch.ai, ai: state.rematch.player };
    if (snapshot.swapAbility) {
      snapshot.swapAbility.owner = snapshot.swapAbility.owner === "player" ? "ai" : "player";
    }
    snapshot.extraDeck = Array(snapshot.extraDeck.length).fill(null);
    snapshot.extraDiscard = [];
    snapshot.playerPlayHistory = {};
    snapshot.playerGuessHistory = {};
    snapshot.aiPlayHistory = {};
    snapshot.aiHasJoker = false;
    snapshot.jokerDistributed = false;
    snapshot.attributeAnimations = [];
    snapshot.visualEffectStartedAt = null;
    snapshot.dealt = { player: state.dealt.ai, ai: state.dealt.player };
    snapshot.dice = { player: state.dice.ai, ai: state.dice.player };
    snapshot.setupGuesses = { player: state.setupGuesses.ai, ai: state.setupGuesses.player };
    snapshot.guesses = {
      player: state.guesses.ai || null,
      ai: state.guesses.player || null
    };
    if (!["setup-revealing", "setup-result", "dice-roll"].includes(state.phase)) {
      snapshot.setupGuesses = { player: null, ai: null };
    }
    if (!["setup-result", "dice-roll"].includes(state.phase)) snapshot.setupCard = null;
    if (snapshot.pending) {
      snapshot.pending.owner = snapshot.pending.owner === "player" ? "ai" : "player";
      if (state.pending.owner === "player" && !["result", "game-over"].includes(state.phase)) {
        snapshot.pending.type = null;
      }
    }
    if (snapshot.lastReveal) {
      const owner = state.lastReveal.owner;
      if (owner !== "ai") delete snapshot.lastReveal.revealedCards;
      snapshot.lastReveal.owner = snapshot.lastReveal.owner === "player" ? "ai" : "player";
      snapshot.lastReveal.guesser = snapshot.lastReveal.guesser === "player" ? "ai" : "player";
    }
    if (snapshot.pendingJokerReveal) {
      snapshot.pendingJokerReveal.owner = snapshot.pendingJokerReveal.owner === "player" ? "ai" : "player";
      snapshot.pendingJokerReveal.target = snapshot.pendingJokerReveal.target === "player" ? "ai" : "player";
    }
    if (snapshot.winner) {
      snapshot.winner = snapshot.winner === "player" ? "ai" : "player";
      snapshot.message = snapshot.winner === "player"
        ? `Vitória · ${state.players.ai.name} venceu`
        : `Derrota · ${state.players.player.name} venceu`;
    }
    if (snapshot.startingPlayer) {
      snapshot.startingPlayer = snapshot.startingPlayer === "player" ? "ai" : "player";
    }
    const phaseMap = {
      "player-play": "ai-play",
      "ai-play": "player-play",
      "player-guess": "ai-guess",
      "ai-guess": "player-guess",
      "player-joker-select": "ai-joker-select",
      "ai-joker-select": "player-joker-select"
    };
    snapshot.phase = phaseMap[state.phase] || state.phase;
    if (snapshot.phase === "player-play") snapshot.message = `Vez do jogador ${snapshot.players.player.name}.`;
    else if (snapshot.phase === "player-guess") snapshot.message = "Sua vez de adivinhar.";
    else if (snapshot.phase === "ai-play") snapshot.message = `Aguardando a jogada de ${snapshot.players.ai.name}.`;
    else if (snapshot.phase === "ai-guess") snapshot.message = `Aguardando o palpite de ${snapshot.players.ai.name}.`;
    else if (snapshot.phase === "player-joker-select") snapshot.message = "Clique em até duas cartas da mão do adversário.";
    else if (snapshot.phase === "ai-joker-select") snapshot.message = `Aguardando ${snapshot.players.ai.name} selecionar cartas.`;
    return snapshot;
  }

  function receiveOnlineAction(message) {
    if (!isOnlineHost() || !state || !message) return;
    if (message.action === "rematch" && state.phase === "game-over") {
      state.rematch.ai = true;
      if (state.rematch.player) startGame();
      else render();
      return;
    }
    if (state.gameOver) return;
    const type = message.type;
    if (message.action === "swap-hands" && isSwapAvailable("ai")) {
      completeHandSwap("ai");
      return;
    }
    if (message.action === "setup-guess" && COMMON_CARDS.includes(type) && state.phase === "setup-guess") {
      if (state.setupGuesses.ai) return;
      state.setupGuesses.ai = type;
      if (state.setupGuesses.player) {
        state.phase = "setup-revealing";
        state.message = "Palpites na mesa...";
        render();
        window.clearInterval(clockInterval);
        aiTimeout = window.setTimeout(resolveSetupChallenge, 650);
      } else {
        render();
      }
      return;
    }
    if (message.action === "play" && CARD_TYPES.includes(type) && state.phase === "ai-play") {
      playCard("ai", type);
      return;
    }
    if (message.action === "guess" && CARD_TYPES.includes(type) && state.phase === "ai-guess" && !state.eliminated.includes(type)) {
      submitGuess("ai", type);
      return;
    }
    if (message.action === "use-luck" && state.phase === "ai-guess") {
      applyLuck("ai");
      return;
    }
    if (
      message.action === "joker-reveal"
      && Number.isInteger(message.index)
      && state.phase === "ai-joker-select"
      && state.pendingJokerReveal
      && state.pendingJokerReveal.owner === "ai"
    ) {
      receiveJokerRevealSelection(message.index);
    }
  }

  function applyOnlineSnapshot(snapshot) {
    if (!isOnlineGuest() || !isValidOnlineSnapshot(snapshot)) return false;
    const previousRound = state && state.phase !== "game-over" ? state.round : null;
    const previousVisualId = state && state.visualEffect ? state.visualEffect.id : null;
    const previousVisualStartedAt = state ? state.visualEffectStartedAt : null;
    const previousAttributes = state ? {
      player: getPlayerAttributes(state.players.player),
      ai: getPlayerAttributes(state.players.ai)
    } : null;
    state = snapshot;
    if (state.visualEffect && state.visualEffect.id !== previousVisualId) {
      state.visualEffectStartedAt = performance.now();
      animateVisualEffect();
    } else {
      state.visualEffectStartedAt = previousVisualStartedAt;
    }
    if (!state.swapAbility || state.swapAbility.owner !== "player") swapRequestPending = false;
    syncSystemEvents(state.systemEvents);
    state.attributeAnimations = previousAttributes && previousRound === snapshot.round
      ? createAttributeAnimations(previousAttributes)
      : [];
    animateAttributeChanges();
    render();
    return true;
  }

  function isValidOnlineSnapshot(snapshot) {
    const phases = [
      "setup-guess", "setup-revealing", "setup-result", "dice-roll",
      "player-play", "ai-play", "player-guess", "ai-guess",
      "player-joker-select", "ai-joker-select",
      "revealing", "result", "game-over"
    ];
    const validCard = (type) => type === null || CARD_TYPES.includes(type);
    const validPlayer = (player) => (
      player
      && typeof player.name === "string"
      && player.name.length <= 18
      && Number.isInteger(player.hp)
      && player.hp >= 0
      && player.hp <= 5
      && Number.isInteger(player.luck)
      && player.luck >= 0
      && player.luck <= MAX_LUCK
      && Number.isInteger(player.shields)
      && player.shields >= 0
      && player.shields <= 10000
      && Number.isInteger(player.extraDrawBlocks)
      && player.extraDrawBlocks >= 0
      && player.extraDrawBlocks <= 10000
      && Array.isArray(player.hand)
      && player.hand.length <= 40
      && player.hand.every(validCard)
      && COMMON_CARDS.every((type) => player.hand.filter((card) => card === type).length <= MAX_CARDS_PER_SPECIES)
      && SPECIAL_CARDS.every((type) => player.hand.filter((card) => card === type).length <= 1)
    );
    const validGuessSet = (guesses) => (
      guesses
      && validCard(guesses.player === undefined ? null : guesses.player)
      && validCard(guesses.ai === undefined ? null : guesses.ai)
    );
    const validAttributes = (attributes) => (
      Array.isArray(attributes)
      && attributes.length <= 8
      && attributes.every((change) => (
        change
        && typeof change.playerName === "string"
        && change.playerName.length <= 18
        && ["hp", "luck", "shields", "cards"].includes(change.attribute)
        && Number.isInteger(change.value)
        && change.value !== 0
        && Math.abs(change.value) <= 10000
      ))
    );
    if (!snapshot || typeof snapshot !== "object" || !phases.includes(snapshot.phase)) return false;
    if (!snapshot.players || !validPlayer(snapshot.players.player) || !validPlayer(snapshot.players.ai)) return false;
    if (!snapshot.rematch || typeof snapshot.rematch.player !== "boolean" || typeof snapshot.rematch.ai !== "boolean") return false;
    if (typeof snapshot.jokerDistributed !== "boolean") return false;
    if (!Number.isInteger(snapshot.round) || snapshot.round < 1 || snapshot.round > 1000) return false;
    if (!Number.isInteger(snapshot.seconds) || snapshot.seconds < 0 || snapshot.seconds > TURN_SECONDS) return false;
    if (typeof snapshot.message !== "string" || snapshot.message.length > 256) return false;
    if (!Array.isArray(snapshot.extraDeck) || snapshot.extraDeck.length > DECK_SIZE) return false;
    if (!Array.isArray(snapshot.extraDiscard) || snapshot.extraDiscard.length > DECK_SIZE) return false;
    if (snapshot.pendingJokerReveal !== null && (
      !snapshot.pendingJokerReveal
      || !["player", "ai"].includes(snapshot.pendingJokerReveal.owner)
      || !["player", "ai"].includes(snapshot.pendingJokerReveal.target)
      || !Array.isArray(snapshot.pendingJokerReveal.selectedIndices)
      || snapshot.pendingJokerReveal.selectedIndices.length > 2
      || new Set(snapshot.pendingJokerReveal.selectedIndices).size !== snapshot.pendingJokerReveal.selectedIndices.length
      || !snapshot.pendingJokerReveal.selectedIndices.every((index) => (
        Number.isInteger(index)
        && index >= 0
        && index < snapshot.players[snapshot.pendingJokerReveal.target].hand.length
      ))
    )) return false;
    if (!Number.isInteger(snapshot.pauseSeconds) || snapshot.pauseSeconds < 0 || snapshot.pauseSeconds > RESULT_PAUSE_SECONDS) return false;
    if (!Number.isInteger(snapshot.resultSequence) || snapshot.resultSequence < 0) return false;
    if (!Number.isInteger(snapshot.visualEffectSequence) || snapshot.visualEffectSequence < 0) return false;
    if (snapshot.visualEffect !== null && (
      !snapshot.visualEffect
      || !Number.isInteger(snapshot.visualEffect.id)
      || snapshot.visualEffect.id < 1
      || !["swap", "reveal"].includes(snapshot.visualEffect.kind)
      || (snapshot.visualEffect.cardType !== undefined && !CARD_TYPES.includes(snapshot.visualEffect.cardType))
      || (snapshot.visualEffect.correct !== undefined && typeof snapshot.visualEffect.correct !== "boolean")
    )) return false;
    if (snapshot.swapAbility !== null && (
      !snapshot.swapAbility
      || !["player", "ai"].includes(snapshot.swapAbility.owner)
      || !Number.isInteger(snapshot.swapAbility.expiresAfterRound)
      || snapshot.swapAbility.expiresAfterRound < snapshot.round
      || snapshot.swapAbility.expiresAfterRound > snapshot.round + 2
    )) return false;
    if (!Array.isArray(snapshot.systemEvents) || snapshot.systemEvents.length > 40 || !snapshot.systemEvents.every((event) => (
      event
      && Number.isSafeInteger(event.id)
      && event.id > 0
      && Number.isInteger(event.round)
      && event.round >= 1
      && event.round <= 1000
      && (
        (event.kind === "system"
          && typeof event.text === "string"
          && event.text.length > 0
          && event.text.length <= 180)
        || (event.kind === "round-result"
          && CARD_TYPES.includes(event.cardType)
          && typeof event.playedBy === "string"
          && event.playedBy.length <= 18
          && typeof event.guesser === "string"
          && event.guesser.length <= 18
          && typeof event.correct === "boolean"
          && validAttributes(event.attributes))
      )
    ))) return false;
    if (
      !validCard(snapshot.setupCard)
      || !Array.isArray(snapshot.eliminated)
      || snapshot.eliminated.length > 2
      || !snapshot.eliminated.every((type) => CARD_TYPES.includes(type))
    ) return false;
    if (!validGuessSet(snapshot.guesses) || !validGuessSet(snapshot.setupGuesses)) return false;
    if (snapshot.pending !== null && (
      !snapshot.pending
      || !["player", "ai"].includes(snapshot.pending.owner)
      || !validCard(snapshot.pending.type)
    )) return false;
    if (snapshot.lastReveal && (
      !validCard(snapshot.lastReveal.actualType)
      || (snapshot.lastReveal.guess !== undefined && !validCard(snapshot.lastReveal.guess))
      || !["player", "ai"].includes(snapshot.lastReveal.guesser)
      || typeof snapshot.lastReveal.effectSummary !== "string"
      || snapshot.lastReveal.effectSummary.length > 180
      || typeof snapshot.lastReveal.correct !== "boolean"
      || !validAttributes(snapshot.lastReveal.attributes)
      || (snapshot.lastReveal.revealedCards !== undefined && (
        !Array.isArray(snapshot.lastReveal.revealedCards)
        || snapshot.lastReveal.revealedCards.length > 2
        || !snapshot.lastReveal.revealedCards.every((type) => CARD_TYPES.includes(type))
      ))
      || (snapshot.lastReveal.owner && !["player", "ai"].includes(snapshot.lastReveal.owner))
      || (snapshot.lastReveal.summary && snapshot.lastReveal.summary.length > 256)
    )) return false;
    if (!snapshot.dice || ![snapshot.dice.player, snapshot.dice.ai].every((value) => Number.isInteger(value) && value >= 1 && value <= 6)) return false;
    if (!snapshot.dealt || ![snapshot.dealt.player, snapshot.dealt.ai].every((value) => Number.isInteger(value) && value >= 0 && value <= 7)) return false;
    return true;
  }

  function getCanvasDescription() {
    const playerName = onlineRole ? state.players.player.name : "Você";
    const opponentName = onlineRole ? state.players.ai.name : "IA";
    return `${playerName}: ${state.players.player.hand.length} cartas, ${state.players.player.hp} vidas. ${opponentName}: ${state.players.ai.hand.length} cartas, ${state.players.ai.hp} vidas. ${state.message}`;
  }

  function renderActions() {
    actionArea.replaceChildren();

    if (state.phase === "setup-guess") {
      COMMON_CARDS.forEach((type, index) => {
        addGuessButton(type, () => submitSetupGuess(type), index, COMMON_CARDS.length);
      });
    } else if (state.phase === "player-guess") {
      CARD_TYPES.forEach((type, index) => {
        const button = addGuessButton(type, () => submitGuess("player", type), index, CARD_TYPES.length);
        button.disabled = state.eliminated.includes(type);
      });
    }
  }

  function addGuessButton(type, onClick, index, count) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "guess-button guess-card";
    button.setAttribute("aria-label", `${CARDS[type].name}: ${CARDS[type].effect}`);
    button.title = CARDS[type].effect;
    const emoji = document.createElement("span");
    emoji.className = "guess-card-emoji";
    emoji.textContent = CARDS[type].emoji;
    const name = document.createElement("span");
    name.className = "guess-card-name";
    name.textContent = CARDS[type].name;
    button.append(emoji, name);
    const arcPosition = count > 1 ? (index / (count - 1)) * 2 - 1 : 0;
    const fanSpread = actionArea.clientWidth * (isMobileCanvas() ? 0.36 : 0.4);
    button.style.setProperty("--fan-x", `${arcPosition * fanSpread}px`);
    button.style.setProperty("--fan-y", `${Math.abs(arcPosition) * 14}px`);
    button.style.setProperty("--fan-angle", `${arcPosition * 24}deg`);
    button.style.setProperty("--fan-z", String(index + 1));
    button.style.setProperty("--card-accent", CARDS[type].color);
    button.addEventListener("click", onClick);
    actionArea.append(button);
    return button;
  }

  function updateTimer() {
    timerValue.textContent = String(state.seconds);
    timer.classList.toggle("is-low", state.seconds <= 10);
    const timedPhases = ["player-play", "player-guess", "setup-guess", "player-joker-select"];
    if (onlineRole) timedPhases.push("ai-play", "ai-guess", "ai-joker-select");
    timer.hidden = !timedPhases.includes(state.phase);
  }

  function drawTable() {
    const ctx = context;
    if (isMobileCanvas()) {
      drawMobileTable(ctx);
      return;
    }
    const width = canvasWidth;
    const height = canvasHeight;
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

    drawPlayerPanel(ctx, 1012, 78, state.players.ai, onlineRole ? state.players.ai.name : "IA", false);
    drawPlayerPanel(ctx, 1012, 568, state.players.player, onlineRole ? state.players.player.name : "VOCÊ", true);
    drawExtraDeck(ctx);
    drawAiHand(ctx);
    drawCenter(ctx, width / 2, 326);
    drawPlayerHand(ctx);
    drawGuessMarkers(ctx);
    drawAttributeAnimations(ctx);
    drawVisualEffect(ctx);

    ctx.fillStyle = "rgba(233, 243, 224, .66)";
    ctx.font = "10px Consolas, monospace";
    ctx.textAlign = "center";
    const phaseText = ["setup-guess", "setup-revealing", "setup-result", "dice-roll"].includes(state.phase)
      ? state.phase === "dice-roll" ? "DESEMPATE" : "PALPITE DE ABERTURA"
      : state.phase === "player-play" ? "SUA VEZ"
        : state.phase === "player-guess" ? "SEU PALPITE"
          : ["result", "game-over"].includes(state.phase) ? "REVELADA"
            : state.phase === "dealing" ? "EMBARALHANDO"
              : onlineRole && ["ai-play", "ai-guess"].includes(state.phase)
                ? state.phase === "ai-play" ? "AGUARDANDO JOGADA" : "AGUARDANDO PALPITE"
                : "A IA PENSA";
    ctx.fillText(phaseText, width / 2, 250);

    if (state.phase === "dice-roll") drawDice(ctx);

  }

  function drawMobileTable(ctx) {
    const width = canvasWidth;
    const height = canvasHeight;
    ctx.clearRect(0, 0, width, height);

    const felt = ctx.createLinearGradient(0, 0, width, height);
    felt.addColorStop(0, "#205347");
    felt.addColorStop(1, "#173d35");
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.strokeStyle = "#d4e4b7";
    ctx.lineWidth = 1;
    for (let x = 18; x < width; x += 38) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(width / 2, height / 2, 45, width / 2, height / 2, height * .62);
    glow.addColorStop(0, "rgba(181, 222, 155, .07)");
    glow.addColorStop(1, "rgba(0, 0, 0, .1)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(207, 231, 183, .12)";
    ctx.lineWidth = 1;
    roundRect(ctx, 10, 10, width - 20, height - 20, 12);
    ctx.stroke();

    ctx.strokeStyle = "rgba(207, 231, 183, .28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width * .46, height * .46, 0, 0, Math.PI * 2);
    ctx.stroke();

    drawMobilePlayerPanel(ctx, 690, 76, state.players.ai, onlineRole ? state.players.ai.name : "IA", false);
    drawMobilePlayerPanel(ctx, 690, 1410, state.players.player, onlineRole ? state.players.player.name : "VOCÊ", true);
    drawExtraDeck(ctx);
    drawAiHand(ctx);
    drawCenter(ctx, width / 2, 650);
    drawPlayerHand(ctx);
    drawGuessMarkers(ctx);
    drawAttributeAnimations(ctx);
    drawVisualEffect(ctx);

    ctx.fillStyle = "rgba(233, 243, 224, .72)";
    ctx.font = "16px Consolas, monospace";
    ctx.textAlign = "center";
    const phaseText = ["setup-guess", "setup-revealing", "setup-result", "dice-roll"].includes(state.phase)
      ? state.phase === "dice-roll" ? "DADOS" : "PALPITE DE ABERTURA"
        : state.phase === "player-play" ? "SUA VEZ"
          : state.phase === "player-guess" ? "SEU PALPITE"
            : ["result", "game-over"].includes(state.phase) ? "REVELADA"
              : state.phase === "dealing" ? "DISTRIBUINDO"
                : onlineRole && ["ai-play", "ai-guess"].includes(state.phase)
                  ? state.phase === "ai-play" ? "AGUARDANDO JOGADA" : "AGUARDANDO PALPITE"
                  : "IA PENSA";
    ctx.fillText(phaseText, width / 2, 480);

    if (state.phase === "dice-roll") drawDice(ctx);
  }

  function drawMobilePlayerPanel(ctx, x, y, player, label, isPlayer) {
    drawPlayerBadge(ctx, x, y, player, label, isPlayer, true);
  }

  function drawPlayerPanel(ctx, x, y, player, label, isPlayer) {
    drawPlayerBadge(ctx, x, y, player, label, isPlayer, false);
  }

  function drawPlayerBadge(ctx, x, y, player, label, isPlayer, mobile) {
    const radius = mobile ? 43 : 35;
    const ringRadius = radius - (mobile ? 6 : 5);
    ctx.save();
    ctx.fillStyle = "rgba(15, 33, 29, .78)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isPlayer ? "rgba(201, 239, 116, .55)" : "rgba(231, 243, 229, .2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(239, 128, 111, .24)";
    ctx.lineWidth = mobile ? 6 : 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.hp / 5);
    ctx.strokeStyle = "#ef806f";
    ctx.lineWidth = mobile ? 6 : 5;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = isPlayer ? "#c9ef74" : "#b5d5c7";
    ctx.font = `${mobile ? 15 : 9}px Consolas, monospace`;
    ctx.fillText(label, x, y - radius - (mobile ? 8 : 7), mobile ? 140 : 160);
    ctx.fillStyle = "#e5eddf";
    ctx.font = `bold ${mobile ? 25 : 19}px 'Segoe UI', sans-serif`;
    ctx.fillText(String(player.hand.length), x, y + (mobile ? 7 : 6));
    ctx.fillStyle = "#a9bdba";
    ctx.font = `${mobile ? 9 : 7}px Consolas, monospace`;
    ctx.fillText("CARTAS", x, y + (mobile ? 20 : 16));
    ctx.fillStyle = "#ef806f";
    ctx.font = `${mobile ? 12 : 8}px Consolas, monospace`;
    ctx.fillText(`♥ ${player.hp}`, x, y + radius + (mobile ? 13 : 11));
    if (player.luck > 0 || player.shields > 0) {
      ctx.fillStyle = "#d9c477";
      ctx.font = `${mobile ? 10 : 8}px Consolas, monospace`;
      ctx.fillText(`✦${player.luck} ⛨${player.shields}`, x, y + radius + (mobile ? 25 : 21));
    }
    ctx.restore();
  }

  function drawAttributeAnimations(ctx) {
    if (!state.attributeAnimations.length) return;
    const mobile = isMobileCanvas();
    const now = performance.now();
    const badgeRadius = mobile ? 43 : 35;
    const positions = mobile
      ? { ai: { x: 690, y: 76 }, player: { x: 690, y: 1410 } }
      : { ai: { x: 1012, y: 78 }, player: { x: 1012, y: 568 } };

    state.attributeAnimations.forEach((animation, index) => {
      const progress = (now - animation.startedAt) / 1100;
      if (progress < 0 || progress >= 1) return;
      const position = positions[animation.playerKey];
      const alpha = 1 - progress;
      const animationPlayer = state.players[animation.playerKey];
      const playerLabel = onlineRole
        ? animationPlayer.name
        : animation.playerKey === "player" ? "VOCÊ" : "IA";
      const label = `${playerLabel} · ${animation.text}`;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = animation.color;
      ctx.lineWidth = mobile ? 3 : 2;
      ctx.beginPath();
      ctx.arc(position.x, position.y, badgeRadius + 5 + progress * 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `bold ${mobile ? 15 : 12}px 'Segoe UI', sans-serif`;
      const width = ctx.measureText(label).width + 22;
      const x = mobile ? canvasWidth / 2 : 860;
      const baseY = mobile
        ? animation.playerKey === "player" ? 1050 : 440
        : animation.playerKey === "player" ? 505 : 150;
      const y = baseY - progress * 42 - index * (mobile ? 24 : 21);
      ctx.fillStyle = "rgba(10, 23, 21, .94)";
      roundRect(ctx, x - width / 2, y - (mobile ? 14 : 12), width, mobile ? 28 : 24, 8);
      ctx.fill();
      ctx.strokeStyle = animation.color;
      ctx.lineWidth = 1;
      roundRect(ctx, x - width / 2, y - (mobile ? 14 : 12), width, mobile ? 28 : 24, 8);
      ctx.stroke();
      ctx.fillStyle = animation.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y);
      ctx.restore();
    });
  }

  function drawVisualEffect(ctx) {
    if (!state.visualEffect || state.visualEffectStartedAt === null) return;
    const progress = (performance.now() - state.visualEffectStartedAt) / 1000;
    if (progress < 0 || progress >= 1) return;
    const mobile = isMobileCanvas();
    const centerX = canvasWidth / 2;
    const centerY = mobile ? 650 : 326;
    const alpha = 1 - progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (state.visualEffect.kind === "swap") {
      const size = (mobile ? 48 : 36) + progress * (mobile ? 36 : 28);
      ctx.fillStyle = "#d9c477";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(size)}px 'Segoe UI Symbol', sans-serif`;
      ctx.fillText("⇄", centerX, centerY);
      ctx.font = `bold ${mobile ? 18 : 13}px 'Segoe UI', sans-serif`;
      ctx.fillText("MÃOS TROCADAS", centerX, centerY + (mobile ? 78 : 58));
    } else if (state.visualEffect.kind === "reveal") {
      const radius = (mobile ? 72 : 54) + progress * (mobile ? 130 : 110);
      ctx.strokeStyle = state.visualEffect.cardType
        ? CARDS[state.visualEffect.cardType].color
        : "#c9ef74";
      ctx.lineWidth = mobile ? 5 : 3;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radius, radius * (mobile ? 0.62 : 0.54), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = state.visualEffect.correct ? "#c9ef74" : "#ff887d";
      ctx.font = `bold ${mobile ? 22 : 17}px 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(state.visualEffect.correct ? "✓" : "!", centerX, centerY - (mobile ? 150 : 116));
    }
    ctx.restore();
  }

  function drawExtraDeck(ctx) {
    const mobile = isMobileCanvas();
    const x = mobile ? 32 : 48;
    const y = mobile ? 520 : 272;
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
    const handSize = state.phase === "dealing" ? state.dealt.ai : state.players.ai.hand.length;
    const layouts = getOpponentCardLayouts();
    const selectable = state.phase === "player-joker-select"
      && state.pendingJokerReveal
      && state.pendingJokerReveal.target === "ai";
    for (const layout of layouts) {
      const selected = selectable && state.pendingJokerReveal.selectedIndices.includes(layout.index);
      const hovered = selectable && layout.index === hoverOpponentCard;
      const y = layout.y - (hovered ? 12 : 0);
      drawCard(
        ctx,
        layout.x - layout.width / 2,
        y - layout.height / 2,
        null,
        layout.width,
        layout.height,
        0,
        selected || hovered
      );
      if (selected) drawSelectedCardMarker(ctx, layout.x, y - layout.height / 2);
    }
    if (handSize > MAX_FACE_DOWN_CARDS) {
      ctx.fillStyle = "#c9ef74";
      ctx.font = `${isMobileCanvas() ? 14 : 9}px Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.fillText(`+${handSize - MAX_FACE_DOWN_CARDS}`, isMobileCanvas() ? canvasWidth / 2 : 550, isMobileCanvas() ? 330 : 170);
    }
  }

  function getOpponentCardLayouts() {
    const handSize = state.phase === "dealing" ? state.dealt.ai : state.players.ai.hand.length;
    const visibleCount = Math.min(handSize, MAX_FACE_DOWN_CARDS);
    const cardWidth = 94;
    const cardHeight = 132;
    const mobile = isMobileCanvas();
    const spacing = visibleCount > 1
      ? Math.min(mobile ? 42 : 30, (mobile ? 460 : 520) / (visibleCount - 1))
      : 0;
    const centerX = mobile ? canvasWidth / 2 : 550;
    const startX = centerX - ((visibleCount - 1) * spacing) / 2;
    const layouts = [];
    for (let index = 0; index < visibleCount; index += 1) {
      const normalized = visibleCount > 1 ? (index / (visibleCount - 1)) * 2 - 1 : 0;
      layouts.push({
        index,
        x: startX + index * spacing,
        y: mobile ? 250 : 88 + Math.abs(normalized) * 9,
        width: cardWidth,
        height: cardHeight
      });
    }
    return layouts;
  }

  function drawSelectedCardMarker(ctx, x, top) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 33, top + 13, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#c9ef74";
    ctx.fill();
    ctx.fillStyle = "#17352f";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✓", x + 33, top + 13);
    ctx.restore();
  }

  function getPlayerCardLayouts() {
    const hand = state.players.player.hand;
    const visibleCount = state.phase === "dealing" ? state.dealt.player : hand.length;
    const layouts = [];
    const mobile = isMobileCanvas();
    const compacted = ["player-guess", "setup-guess"].includes(state.phase);
    if (compacted) {
      const spacing = visibleCount > 1
        ? Math.min(mobile ? 12 : 16, (mobile ? 150 : 210) / (visibleCount - 1))
        : 0;
      const startX = mobile ? 48 : 66;
      for (let index = 0; index < visibleCount; index += 1) {
        const normalized = visibleCount > 1 ? (index / (visibleCount - 1)) * 2 - 1 : 0;
        layouts.push({
          index,
          x: startX + index * spacing,
          y: mobile ? 1050 : 470,
          angle: normalized * 0.1,
          type: hand[index]
        });
      }
      return layouts;
    }

    const centerX = mobile ? canvasWidth / 2 : 550;
    const spacing = visibleCount > 1
      ? Math.min(mobile ? 76 : 76, (mobile ? 440 : 500) / (visibleCount - 1))
      : 0;
    const startX = centerX - ((visibleCount - 1) * spacing) / 2;

    for (let index = 0; index < visibleCount; index += 1) {
      const normalized = visibleCount > 1 ? (index / (visibleCount - 1)) * 2 - 1 : 0;
      layouts.push({
        index,
        x: startX + index * spacing,
        y: mobile ? 1180 + Math.abs(normalized) * 18 : 536 + Math.abs(normalized) * 17,
        angle: normalized * 0.38,
        type: hand[index]
      });
    }
    return layouts;
  }

  function drawPlayerHand(ctx) {
    const canPlay = state.phase === "player-play";
    const mobile = isMobileCanvas();
    const compacted = ["player-guess", "setup-guess"].includes(state.phase);
    const cardWidth = compacted ? mobile ? 72 : 62 : CARD_WIDTH;
    const cardHeight = compacted ? mobile ? 98 : 84 : CARD_HEIGHT;
    const layouts = getPlayerCardLayouts();
    for (const layout of layouts) {
      const hovered = canPlay && layout.index === hoverCard;
      drawCard(
        ctx,
        layout.x - cardWidth / 2,
        layout.y - cardHeight / 2 - (hovered ? 15 : 0),
        layout.type,
        cardWidth,
        cardHeight,
        layout.angle,
        hovered
      );
    }
    if (canPlay && hoverCard >= 0 && layouts[hoverCard]) drawCardTooltip(ctx, layouts[hoverCard]);
    if (state.players.player.hand.length > 0 && !compacted) {
      ctx.fillStyle = "rgba(226, 238, 221, .76)";
      ctx.font = `${mobile ? 14 : 9}px Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.fillText(
        "SUA MÃO · CLIQUE PARA JOGAR",
        canvasWidth / 2,
        mobile ? canvasHeight - 18 : 644
      );
    }
  }

  function drawCardTooltip(ctx, layout) {
    const mobile = isMobileCanvas();
    const width = mobile ? 330 : 224;
    const height = mobile ? 64 : 43;
    const x = Math.max(width / 2 + 8, Math.min(canvasWidth - width / 2 - 8, layout.x));
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
    const y = mobile ? playerKey === "ai" ? 410 : 760 : playerKey === "ai" ? 205 : 407;
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
    const normalVisible = state.lastReveal && [
      "result", "game-over", "player-joker-select", "ai-joker-select"
    ].includes(state.phase);
    const visibleCard = setupVisible
      ? state.setupCard
      : normalVisible ? state.lastReveal.actualType : null;
    const revealProgress = state.visualEffect
      && state.visualEffect.kind === "reveal"
      && state.visualEffectStartedAt !== null
      ? Math.min(1, Math.max(0, (performance.now() - state.visualEffectStartedAt) / 1000))
      : 1;
    const revealScale = normalVisible ? 0.88 + revealProgress * 0.12 : 1;
    const drawnWidth = cardWidth * revealScale;
    const drawnHeight = cardHeight * revealScale;
    drawCard(
      ctx,
      centerX - drawnWidth / 2,
      centerY - drawnHeight / 2,
      visibleCard,
      drawnWidth,
      drawnHeight,
      0,
      normalVisible && revealProgress < 0.8
    );
    ctx.fillStyle = "rgba(226, 238, 221, .72)";
    ctx.font = `${mobile ? 14 : 10}px Consolas, monospace`;
    const openingGuess = ["setup-guess", "setup-revealing"].includes(state.phase);
    const label = setupVisible
      ? "CARTA DO SORTEIO"
      : normalVisible ? CARDS[visibleCard].name.toUpperCase()
        : openingGuess ? "CARTA DE ABERTURA" : "CARTA JOGADA";
    ctx.fillText(label, centerX, centerY + (mobile ? 113 : 91));
    if (normalVisible && state.lastReveal.revealedCards && state.lastReveal.revealedCards.length > 0) {
      const revealWidth = mobile ? 72 : 60;
      const revealHeight = mobile ? 104 : 86;
      const gap = mobile ? 84 : 68;
      state.lastReveal.revealedCards.forEach((card, index) => {
        const revealX = centerX + (mobile ? 140 : 132) + index * gap;
        drawCard(
          ctx,
          revealX - revealWidth / 2,
          centerY - revealHeight / 2,
          card,
          revealWidth,
          revealHeight
        );
        ctx.fillStyle = "rgba(226, 238, 221, .72)";
        ctx.font = `${mobile ? 11 : 8}px Consolas, monospace`;
        ctx.fillText(`REVELADA ${index + 1}`, revealX, centerY + revealHeight / 2 + (mobile ? 16 : 12));
      });
    }
    ctx.restore();
  }

  function drawCard(ctx, x, y, type, width, height, angle = 0, highlighted = false) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(angle);
    ctx.shadowColor = "rgba(0, 0, 0, .35)";
    ctx.shadowBlur = highlighted ? 21 : 13;
    ctx.shadowOffsetY = highlighted ? 10 : 6;
    const face = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
    face.addColorStop(0, type ? "#fffdf4" : "#294a42");
    face.addColorStop(1, type ? "#e5ddcb" : "#17352f");
    ctx.fillStyle = face;
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
      drawDie(ctx, 270, 650, state.dice.player);
      drawDie(ctx, 510, 650, state.dice.ai);
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
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
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

  function getOpponentCardAtPointer(event) {
    if (
      state?.phase !== "player-joker-select"
      || !state.pendingJokerReveal
      || state.pendingJokerReveal.target !== "ai"
    ) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvasWidth / rect.width);
    const y = (event.clientY - rect.top) * (canvasHeight / rect.height);
    const layouts = getOpponentCardLayouts();
    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      const layout = layouts[index];
      if (state.pendingJokerReveal.selectedIndices.includes(layout.index)) continue;
      if (
        Math.abs(x - layout.x) <= layout.width / 2
        && Math.abs(y - layout.y) <= layout.height / 2
      ) return layout.index;
    }
    return -1;
  }

  function handleCanvasPointerMove(event) {
    const selectingJoker = state?.phase === "player-joker-select";
    const nextHover = state?.phase === "player-play" ? getCardAtPointer(event) : -1;
    const nextOpponentHover = selectingJoker ? getOpponentCardAtPointer(event) : -1;
    if (hoverCard === nextHover && hoverOpponentCard === nextOpponentHover) return;
    hoverCard = nextHover;
    hoverOpponentCard = nextOpponentHover;
    canvas.style.cursor = nextHover >= 0 || nextOpponentHover >= 0 ? "pointer" : "default";
    if (state?.phase === "player-play" || selectingJoker) drawTable();
  }

  function handleCanvasClick(event) {
    if (state?.phase === "player-joker-select") {
      const cardIndex = getOpponentCardAtPointer(event);
      if (cardIndex >= 0) submitJokerReveal(cardIndex);
      return;
    }
    if (state?.phase !== "player-play") return;
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
    hoverOpponentCard = -1;
    canvas.style.cursor = "default";
    if (state?.phase === "player-play" || state?.phase === "player-joker-select") drawTable();
  });
  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("keydown", (event) => {
    if (!state || !["player-play", "dealing"].includes(state.phase) || !/^[1-9]$/.test(event.key)) return;
    const cardIndex = Number(event.key) - 1;
    const card = state.players.player.hand[cardIndex];
    if (!card || state.phase !== "player-play") return;
    playCard("player", card);
  });

  document.querySelector("#restart-button").addEventListener("click", startGame);
  useLuckButton.addEventListener("click", useLuck);
  swapHandsButton.addEventListener("click", useSwapHands);
  tableRestartButton.addEventListener("click", requestRematch);
  document.querySelector("#rules-button").addEventListener("click", () => rulesDialog.showModal());
  document.querySelector("#close-rules").addEventListener("click", () => rulesDialog.close());
  rulesDialog.addEventListener("click", (event) => {
    if (event.target === rulesDialog) rulesDialog.close();
  });

  function resizeCanvasForViewport() {
    const mobile = window.innerWidth <= 650;
    const width = mobile ? MOBILE_CANVAS_WIDTH : 1100;
    const height = mobile ? MOBILE_CANVAS_HEIGHT : 660;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvasWidth === width && canvasHeight === height && canvasPixelRatio === pixelRatio) return;
    canvasWidth = width;
    canvasHeight = height;
    canvasPixelRatio = pixelRatio;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (state) render();
  }

  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    soundToggle.textContent = soundEnabled ? "♫ Som ligado" : "♫ Som desligado";
    if (soundEnabled) prepareAudio();
  });
  window.addEventListener("pointerdown", prepareAudio, { once: true, passive: true });
  window.addEventListener("keydown", prepareAudio, { once: true, capture: true });
  window.addEventListener("resize", resizeCanvasForViewport);
  window.BlefeGame = Object.freeze({
    startOffline: startOfflineGame,
    startOnlineHost,
    waitForOnlineGame,
    applyOnlineSnapshot,
    receiveOnlineAction,
    leaveToMenu: showMenuView
  });
  resizeCanvasForViewport();
})();
