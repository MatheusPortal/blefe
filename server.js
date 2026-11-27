import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import "./ai-policy.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 10000);
const rooms = new Map();
const peers = new Map();
const socketPeers = new WeakMap();
const cardTypes = globalThis.BlefeAI.types;
const aiLearningFile = process.env.AI_LEARNING_FILE || path.join(root, ".data", "ai-learning.json");
const learningWriteOrigin = new Map();
let saveLearningPromise = Promise.resolve();
let aiLearning = newLearningModel();
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/ai-policy.js", ["ai-policy.js", "text/javascript; charset=utf-8"]],
  ["/online.js", ["online.js", "text/javascript; charset=utf-8"]],
  ["/version-check.js", ["version-check.js", "text/javascript; charset=utf-8"]]
]);

function logEvent(event, details = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...details }));
}

function newLearningModel() {
  return globalThis.BlefeAI.createModel();
}

function sanitizeLearningModel(candidate) {
  return globalThis.BlefeAI.sanitizeModel(candidate);
}

async function loadLearningModel() {
  try {
    aiLearning = sanitizeLearningModel(JSON.parse(await readFile(aiLearningFile, "utf8")));
    logEvent("ai-learning-loaded", { observations: aiLearning.observations });
  } catch (error) {
    if (error.code !== "ENOENT") logEvent("ai-learning-load-error", { message: error.message });
  }
}

function saveLearningModel() {
  saveLearningPromise = saveLearningPromise.catch(() => {})
    .then(async () => {
      const snapshot = JSON.stringify(aiLearning);
      await mkdir(path.dirname(aiLearningFile), { recursive: true });
      const temporaryFile = `${aiLearningFile}.${process.pid}.tmp`;
      await writeFile(temporaryFile, snapshot, "utf8");
      await rename(temporaryFile, aiLearningFile);
    })
    .catch((error) => {
      logEvent("ai-learning-save-error", { message: error.message });
      throw error;
    });
  return saveLearningPromise;
}

function learningResponse(response, body, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4_096) throw new Error("Payload excede o limite.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function sendError(peer, message) {
  send(peer.socket, { type: "error", message });
}

function normalizeNickname(value) {
  if (typeof value !== "string") return null;
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 18 || /[\u0000-\u001f\u007f]/.test(nickname)) return null;
  return nickname;
}

function normalizeRoomName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 32 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function roomSummary(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    playerCount: room.players.size,
    maxPlayers: 2,
    status: room.status
  };
}

function lobbyPlayer(peer) {
  return { id: peer.publicId, nickname: peer.nickname };
}

function broadcastRooms() {
  const list = [...rooms.values()]
    .filter((room) => room.status === "lobby" && room.players.size < 2)
    .map(roomSummary);
  for (const peer of peers.values()) {
    if (!peer.room) send(peer.socket, { type: "room-list", rooms: list });
  }
}

function broadcastRoom(room, payload) {
  for (const peer of room.players.values()) send(peer.socket, payload);
}

function relayLobby(room) {
  broadcastRoom(room, {
    type: "lobby-update",
    room: {
      ...roomSummary(room),
      players: [...room.players.values()].map(lobbyPlayer)
    }
  });
}

function finishRoom(room, winner) {
  if (room.timer) clearTimeout(room.timer);
  if (room.game) clearDeadlineTimer(room.game);
  room.timer = null;
  room.status = "finished";
  room.rematchRequests = new Set();
  if (room.game) room.game.winnerId = winner?.publicId || null;
  broadcastRoom(room, {
    type: "game-over",
    winner: winner ? lobbyPlayer(winner) : null,
    roomId: room.id
  });
  broadcastGame(room, "finished");
  logEvent("game-finished", { roomId: room.id, winnerId: winner?.publicId || null });
}

function detachPeer(room, peer, reason) {
  if (!room) return;
  room.players.delete(peer.publicId);
  peer.room = null;
  if (room.game?.players.has(peer.publicId)) {
    const player = room.game.players.get(peer.publicId);
    player.alive = false;
    player.peer = null;
  }
  if (room.hostId === peer.publicId) {
    const nextHost = room.players.values().next().value;
    room.hostId = nextHost?.publicId || null;
  }
  if (room.status === "lobby") {
    if (room.players.size === 0) rooms.delete(room.id);
    else relayLobby(room);
    broadcastRooms();
    return;
  }
  if (room.players.size === 0) {
    if (room.timer) clearTimeout(room.timer);
    if (room.game) clearDeadlineTimer(room.game);
    rooms.delete(room.id);
  } else {
    checkEliminationsAndWinner(room);
    if (room.status !== "finished") advanceIfNeeded(room);
    logEvent("room-player-left", { roomId: room.id, playerId: peer.publicId, reason });
  }
}

function disconnectPeer(peer, reason) {
  if (!peers.has(peer.id)) return;
  const room = peer.room;
  peers.delete(peer.id);
  detachPeer(room, peer, reason);
  logEvent("peer-disconnected", { peerId: peer.publicId, reason });
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

function makeInitialHands(count) {
  const common = ["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga"];
  const fullDeck = shuffle([...common.flatMap((type) => Array(5).fill(type)), "troca", "coringa"]);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const deck = [...fullDeck];
    shuffle(deck);
    const hands = Array.from({ length: count }, () => []);
    for (let round = 0; round < 7; round += 1) {
      for (let playerIndex = 0; playerIndex < count; playerIndex += 1) {
        const counts = hands[playerIndex].reduce((result, type) => {
          result[type] = (result[type] || 0) + 1;
          return result;
        }, {});
        const cardIndex = deck.findIndex((type) => (counts[type] || 0) < 3 || type === "troca" || type === "coringa");
        if (cardIndex < 0) break;
        hands[playerIndex].push(deck.splice(cardIndex, 1)[0]);
      }
    }
    if (hands.every((hand) => hand.length === 7)) return { hands, deck };
  }
  throw new Error("Não foi possível distribuir o baralho.");
}

function startRoomGame(room) {
  const players = [...room.players.values()];
  const { hands, deck } = makeInitialHands(players.length);
  const gamePlayers = new Map(players.map((peer, index) => [peer.publicId, {
    id: peer.publicId,
    nickname: peer.nickname,
    peer,
    hand: hands[index],
    hp: 5,
    shields: 0,
    luck: 0,
    alive: true
  }]));
  room.game = {
    players: gamePlayers,
    deck,
    turnOrder: players.map((peer) => peer.publicId),
    turnIndex: 0,
    turnPlayerId: null,
    round: 1,
    tableTheme: Math.floor(Math.random() * 3),
    phase: "setup-guess",
    activeCard: deck.splice(deck.findIndex((card) => !["troca", "coringa"].includes(card)), 1)[0],
    guesses: new Map(),
    opening: true,
    lastResult: null,
    tableCard: null,
    publicDiscards: [],
    winnerId: null,
    swapOwnerId: null,
    jokerSelection: null,
    deadlineTimer: null,
    eliminated: []
  };
  room.status = "playing";
  broadcastRoom(room, {
    type: "room-started",
    roomId: room.id,
    players: players.map(lobbyPlayer)
  });
  scheduleDeadline(room);
  broadcastGame(room);
  broadcastRooms();
  logEvent("room-started", { roomId: room.id, players: players.length });
}

function gamePlayerList(game, recipientId) {
  return game.turnOrder.map((id) => game.players.get(id)).map((player) => ({
    id: player.id,
    nickname: player.nickname,
    hp: player.hp,
    shields: player.shields,
    luck: player.luck,
    handCount: player.hand.length,
    hand: player.id === recipientId ? [...player.hand] : undefined,
    eliminated: !player.alive
  }));
}

function broadcastGame(room, phase = room.game?.phase) {
  const game = room.game;
  if (!game) return;
  for (const peer of room.players.values()) {
    const snapshot = {
      roomId: room.id,
      phase,
      round: game.round,
      tableTheme: game.tableTheme,
      turnPlayerId: game.turnPlayerId,
      activeCard: ["setup-result", "dice-roll", "result", "finished", "joker-select"].includes(phase) ? game.activeCard : null,
      tableCard: game.tableCard,
      publicDiscards: [...game.publicDiscards],
      hasActiveCard: Boolean(game.activeCard),
      guessCount: ["guess", "setup-guess"].includes(phase) ? game.guesses.size : undefined,
      guessed: ["guess", "setup-guess"].includes(phase) ? game.guesses.has(peer.publicId) : false,
      seconds: game.deadlineTimer ? Math.max(0, Math.ceil((game.deadlineAt - Date.now()) / 1000)) : null,
      deadlineAt: game.deadlineAt || null,
      opening: game.opening,
      setupGuesses: phase === "setup-result" || phase === "dice-roll"
        ? Object.fromEntries(game.guesses)
        : undefined,
      dice: game.dice,
      guesses: phase === "guess" || phase === "result" || phase === "finished"
        ? Object.fromEntries(game.guesses)
        : undefined,
      lastResult: game.lastResult && ["result", "finished", "joker-reveal", "joker-select", "joker-swap"].includes(phase) ? {
        ...game.lastResult,
        outcomes: game.lastResult.outcomes.map(({ cards, ...outcome }) => ({
          ...outcome,
          cardsDrawn: cards.length
        }))
      } : null,
      swapOwnerId: game.swapOwnerId,
      jokerSelection: game.jokerSelection ? {
        ownerId: game.jokerSelection.ownerId,
        targetId: game.jokerSelection.targetId,
        stage: game.jokerSelection.stage,
        selectedIndices: [...game.jokerSelection.selectedIndices],
        chosenIndex: game.jokerSelection.chosenIndex,
        cards: game.jokerSelection.ownerId === peer.publicId
          ? [...game.jokerSelection.cards]
          : []
      } : null,
      eliminated: [...(game.eliminated || [])],
      nextTurnAt: game.nextTurnAt || null,
      winnerId: game.winnerId,
      rematchRequests: [...(room.rematchRequests || [])],
      extraDeckCount: game.deck.length,
      players: gamePlayerList(game, peer.publicId),
      you: peer.publicId
    };
    send(peer.socket, { type: "game-state", state: snapshot });
  }
}

function clearDeadlineTimer(game) {
    if (game?.deadlineTimer) clearTimeout(game.deadlineTimer);
    if (game) {
      game.deadlineTimer = null;
      game.deadlineAt = null;
    }
  }

function scheduleDeadline(room) {
    const game = room.game;
    clearDeadlineTimer(game);
    if (!game || room.status !== "playing") return;
    game.deadlineAt = Date.now() + 40_000;
    game.deadlineTimer = setTimeout(() => {
      if (room.status !== "playing" || !game.deadlineAt) return;
      const expected = [...game.players.values()].filter((player) => player.alive);
      if (game.phase === "play") {
        const owner = game.players.get(game.turnPlayerId);
        if (owner?.alive && owner.hand.length) {
          const index = Math.floor(Math.random() * owner.hand.length);
          game.activeCard = owner.hand.splice(index, 1)[0];
          game.tableCard = null;
          game.guesses.clear();
          game.phase = "guess";
          scheduleDeadline(room);
          broadcastGame(room);
        }
      } else if (["joker-reveal", "joker-select", "joker-swap"].includes(game.phase)) {
        const selection = game.jokerSelection;
        if (game.phase === "joker-reveal" && selection) {
          const target = game.players.get(selection.targetId);
          for (const index of shuffle(target.hand.map((_, cardIndex) => cardIndex))) {
            if (selection.selectedIndices.length >= Math.min(2, target.hand.length)) break;
            if (!selection.selectedIndices.includes(index)) selection.selectedIndices.push(index);
          }
          selection.cards = selection.selectedIndices.map((index) => target.hand[index]);
          selection.stage = "select";
          game.phase = "joker-select";
          scheduleDeadline(room);
          broadcastGame(room);
        } else if (game.phase === "joker-select" && selection) {
          selection.chosenIndex = selection.selectedIndices[Math.floor(Math.random() * selection.selectedIndices.length)];
          selection.stage = "swap";
          game.phase = "joker-swap";
          scheduleDeadline(room);
          broadcastGame(room);
        } else if (selection) {
          const owner = game.players.get(selection.ownerId);
          finishJokerSwap(room, Math.floor(Math.random() * owner.hand.length));
        }
      } else if (game.phase === "setup-guess") {
        const available = ["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga"];
        for (const player of expected) {
          if (!game.guesses.has(player.id)) {
            game.guesses.set(player.id, available[Math.floor(Math.random() * available.length)]);
          }
        }
        resolveOpening(room);
      } else if (game.phase === "guess") {
        const available = cardTypes.filter((type) => !(game.eliminated || []).includes(type));
        for (const player of expected) {
          if (player.id !== game.turnPlayerId && !game.guesses.has(player.id)) {
            game.guesses.set(player.id, available[Math.floor(Math.random() * available.length)]);
          }
        }
        resolveRound(room);
      }
    }, 40_000);
  }

function drawCards(game, player, count) {
  const drawn = [];
  for (let index = 0; index < count && game.deck.length > 0; index += 1) {
    const card = game.deck.pop();
    player.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

function damage(gamePlayer, amount) {
  const blocked = Math.min(gamePlayer.shields, amount);
  gamePlayer.shields -= blocked;
  const hpLost = Math.min(gamePlayer.hp, amount - blocked);
  gamePlayer.hp -= hpLost;
  return { blocked, hpLost };
}

function gainLuck(player, amount) {
  const gained = Math.min(amount, 5 - player.luck);
  player.luck += gained;
  return gained;
}

function resolveEffect(game, type, owner, guesser, correct) {
  const result = { guesserId: guesser.id, correct, hp: 0, shields: 0, cards: [], ownerHp: 0, ownerShields: 0, ownerLuck: 0 };
  if (correct) {
    if (type === "tigre" || type === "tartaruga") {
      if (guesser.hp < 5) {
        guesser.hp += 1;
        result.hp = 1;
      } else {
        guesser.shields += 1;
        result.shields = 1;
      }
    } else if (type === "peixe" && guesser.hp < 5) {
      guesser.hp += 1;
      result.hp = 1;
    } else if (["macaco", "vaca", "coelho"].includes(type)) {
      result.luck = gainLuck(guesser, 1);
    } else if (type === "elefante") {
      guesser.shields += 1;
      result.shields = 1;
    }
    return result;
  }

  if (type === "leao") {
    Object.assign(result, damage(guesser, 2), { cards: drawCards(game, guesser, 1) });
    result.ownerLuck = gainLuck(owner, 1);
  } else if (type === "coelho") {
    result.cards = drawCards(game, guesser, 3);
    result.ownerLuck = gainLuck(owner, 2);
  } else if (type === "vaca") {
    result.cards = drawCards(game, guesser, 2);
    owner.shields += 2;
    result.ownerShields = 2;
  } else if (type === "peixe") {
    result.cards = drawCards(game, guesser, 2);
    const lost = Math.min(3, guesser.shields);
    guesser.shields -= lost;
    result.shieldsLost = lost;
    const healed = Math.min(1, 5 - owner.hp);
    owner.hp += healed;
    result.ownerHp = healed;
    result.ownerLuck = gainLuck(owner, 1);
  } else if (type === "tigre") {
    Object.assign(result, damage(guesser, 1), { cards: drawCards(game, guesser, 2) });
  } else if (type === "macaco") {
    Object.assign(result, damage(guesser, 3), { cards: drawCards(game, guesser, 1) });
    owner.shields += 2;
    result.ownerShields = 2;
  } else if (type === "elefante") {
    const hpLost = Math.min(1, guesser.hp);
    const shieldsLost = Math.min(2, guesser.shields);
    guesser.hp -= hpLost;
    guesser.shields -= shieldsLost;
    result.hpLost = hpLost;
    result.shieldsLost = shieldsLost;
  } else if (type === "tartaruga") {
    result.cards = drawCards(game, guesser, 1);
    const lost = Math.min(1, guesser.shields);
    guesser.shields -= lost;
    result.shieldsLost = lost;
    owner.shields += 1;
    result.ownerShields = 1;
  } else if (type === "troca") {
    game.swapOwnerId = owner.id;
  } else if (type === "coringa") {
    const healed = Math.min(1, 5 - owner.hp);
    owner.hp += healed;
    owner.shields += 1;
    result.ownerHp = healed;
    result.ownerShields = 1;
    if (guesser.hand.length > 0 && owner.hand.length > 0) {
      result.jokerPending = true;
      game.jokerSelection = {
        ownerId: owner.id,
        targetId: guesser.id,
        stage: "reveal",
        selectedIndices: [],
        cards: [],
        chosenIndex: null
      };
    }
  }
  return result;
}

function nextAliveId(game, afterId) {
  const start = game.turnOrder.indexOf(afterId);
  for (let step = 1; step <= game.turnOrder.length; step += 1) {
    const id = game.turnOrder[(start + step) % game.turnOrder.length];
    if (game.players.get(id).alive) return id;
  }
  return null;
}

function checkEliminationsAndWinner(room) {
  const game = room.game;
  if (!game || game.winnerId) return;
  for (const player of game.players.values()) {
    if (player.alive && player.hp <= 0) player.alive = false;
  }
  const alive = [...game.players.values()].filter((player) => player.alive);
  if (alive.length <= 1) {
    finishRoom(room, alive[0]?.peer || null);
    return;
  }
  const owner = game.players.get(game.turnPlayerId);
  if (owner?.alive && owner.hand.length === 0) {
    finishRoom(room, owner.peer);
  }
}

function scheduleNextTurn(room) {
  if (room.timer) clearTimeout(room.timer);
  room.game.nextTurnAt = Date.now() + 3_000;
  broadcastGame(room, room.game.phase);
  room.timer = setTimeout(() => {
    room.timer = null;
    if (room.status !== "playing") return;
    room.game.swapOwnerId = null;
    startNextTurn(room);
  }, 3_000);
}

function startNextTurn(room) {
  const game = room.game;
  if (game.phase !== "result") return;
  checkEliminationsAndWinner(room);
  if (room.status !== "playing") return;
  const nextId = nextAliveId(game, game.turnPlayerId);
  if (!nextId) return finishRoom(room, null);
  game.turnPlayerId = nextId;
  game.turnIndex = game.turnOrder.indexOf(nextId);
  game.round += 1;
  game.phase = "play";
  game.activeCard = null;
  game.guesses.clear();
  game.lastResult = null;
  game.swapOwnerId = null;
  game.eliminated = [];
  game.nextTurnAt = null;
  scheduleDeadline(room);
  broadcastGame(room);
}

function resolveRound(room) {
  const game = room.game;
  clearDeadlineTimer(game);
  const owner = game.players.get(game.turnPlayerId);
  const before = Object.fromEntries([...game.players.values()].map((player) => [player.id, {
    hp: player.hp,
    shields: player.shields,
    luck: player.luck,
    cards: player.hand.length
  }]));
  const outcomes = [];
  for (const [id, guess] of game.guesses) {
    const guesser = game.players.get(id);
    if (guesser?.alive) outcomes.push(resolveEffect(game, game.activeCard, owner, guesser, guess === game.activeCard));
  }

  game.lastResult = {
    card: game.activeCard,
    ownerId: owner.id,
    guesses: Object.fromEntries(game.guesses),
    outcomes,
    attributes: [...game.players.values()].flatMap((player) => {
      const previous = before[player.id];
      return [
        ["hp", player.hp - previous.hp],
        ["shields", player.shields - previous.shields],
        ["luck", player.luck - previous.luck],
        ["cards", player.hand.length - previous.cards]
      ].filter(([, value]) => value !== 0).map(([attribute, value]) => ({
        playerId: player.id,
        playerName: player.nickname,
        attribute,
        value
      }));
    })
  };
  game.publicDiscards.push(game.activeCard);
  game.tableCard = game.activeCard;
  game.phase = "result";
  if (game.jokerSelection) game.phase = "joker-reveal";
  if (!game.jokerSelection) checkEliminationsAndWinner(room);
  if (room.status === "playing") {
    if (game.phase === "result") {
      broadcastGame(room, game.phase);
      scheduleNextTurn(room);
    } else {
      scheduleDeadline(room);
      broadcastGame(room, game.phase);
    }
  }
}

function resolveOpening(room) {
  const game = room.game;
  clearDeadlineTimer(game);
  if (!game.publicDiscards.length) game.publicDiscards.push(game.activeCard);
  const correct = [...game.players.values()].filter((player) => game.guesses.get(player.id) === game.activeCard);
  if (correct.length === 1) {
    game.turnPlayerId = correct[0].id;
    game.phase = "setup-result";
    game.lastResult = { card: game.activeCard, ownerId: correct[0].id, guesses: Object.fromEntries(game.guesses), outcomes: [] };
    game.tableCard = game.activeCard;
    broadcastGame(room, "setup-result");
    room.timer = setTimeout(() => {
      if (room.status !== "playing") return;
      game.phase = "play";
      game.opening = false;
      game.activeCard = null;
      game.guesses.clear();
      game.lastResult = null;
      scheduleDeadline(room);
      broadcastGame(room);
    }, 3_000);
    return;
  }
  game.phase = "dice-roll";
  game.tableCard = game.activeCard;
  game.dice = Object.fromEntries([...game.players.values()].map((player) => [player.id, 1 + Math.floor(Math.random() * 6)]));
  const values = Object.values(game.dice);
  if (values[0] === values[1]) {
    broadcastGame(room, "dice-roll");
    room.timer = setTimeout(() => resolveOpening(room), 700);
    return;
  }
  const winnerIndex = values[0] > values[1] ? 0 : 1;
  game.turnPlayerId = game.turnOrder[winnerIndex];
  broadcastGame(room, "dice-roll");
  room.timer = setTimeout(() => {
    if (room.status !== "playing") return;
    game.phase = "play";
    game.opening = false;
    game.activeCard = null;
    game.guesses.clear();
    scheduleDeadline(room);
    broadcastGame(room);
  }, 3_000);
}

function advanceIfNeeded(room) {
  const game = room.game;
  if (!game || room.status !== "playing") return;
  if (game.phase === "setup-guess") {
    const expected = [...game.players.values()].filter((player) => player.alive);
    if (expected.every((player) => game.guesses.has(player.id))) resolveOpening(room);
  } else if (game.phase === "guess") {
    const expected = [...game.players.values()].filter((player) => player.alive && player.id !== game.turnPlayerId);
    if (expected.length === 0 || expected.every((player) => game.guesses.has(player.id))) resolveRound(room);
  } else if (game.phase === "play" && !game.players.get(game.turnPlayerId)?.alive) {
    const nextId = nextAliveId(game, game.turnPlayerId);
    if (nextId) {
      game.turnPlayerId = nextId;
      broadcastGame(room);
    }
  }
}

function handleRoomAction(peer, action) {
  const room = peer.room;
  if (!room || !action || typeof action !== "object") throw new Error("A sala não está ativa.");
  if (action.action === "rematch") {
    if (room.status !== "finished") throw new Error("A partida ainda não terminou.");
    room.rematchRequests ||= new Set();
    room.rematchRequests.add(peer.publicId);
    if (room.rematchRequests.size === room.players.size && room.players.size === 2) {
      room.rematchRequests.clear();
      startRoomGame(room);
      return;
    }
    broadcastGame(room, "finished");
    return;
  }
  if (room.status !== "playing") throw new Error("A partida não está ativa.");
  const game = room.game;
  const player = game.players.get(peer.publicId);
  if (!player?.alive) throw new Error("Você não está ativo nesta partida.");

  if (action.action === "play") {
    if (game.phase !== "play" || game.turnPlayerId !== player.id) throw new Error("Não é a sua vez de jogar.");
    if (!Number.isInteger(action.cardIndex) || action.cardIndex < 0 || action.cardIndex >= player.hand.length) throw new Error("Índice de carta inválido.");
    game.activeCard = player.hand.splice(action.cardIndex, 1)[0];
    game.tableCard = null;
    game.guesses.clear();
    game.phase = "guess";
    scheduleDeadline(room);
    broadcastGame(room);
    advanceIfNeeded(room);
    return;
  }
  if (action.action === "setup-guess") {
    if (game.phase !== "setup-guess") throw new Error("A abertura já foi concluída.");
    if (!["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga"].includes(action.guess)) throw new Error("Palpite inválido.");
    if (game.guesses.has(player.id)) throw new Error("Seu palpite inicial já foi registrado.");
    game.guesses.set(player.id, action.guess);
    broadcastGame(room);
    advanceIfNeeded(room);
    return;
  }
  if (action.action === "guess") {
    if (game.phase !== "guess" || game.turnPlayerId === player.id) throw new Error("Você não pode adivinhar nesta fase.");
    if (!cardTypes.includes(action.guess)) throw new Error("Palpite inválido.");
    if ((game.eliminated || []).includes(action.guess)) throw new Error("Essa opção foi eliminada pela sorte.");
    if (game.guesses.has(player.id)) throw new Error("Seu palpite já foi registrado.");
    game.guesses.set(player.id, action.guess);
    broadcastGame(room);
    advanceIfNeeded(room);
    return;
  }
  if (action.action === "swap") {
    if (game.phase !== "result" || game.swapOwnerId !== player.id) throw new Error("A troca não está disponível.");
    const targetId = nextAliveId(game, player.id);
    const target = targetId && game.players.get(targetId);
    if (!target) throw new Error("Não há jogador para trocar.");
    [player.hand, target.hand] = [target.hand, player.hand];
    game.swapOwnerId = null;
    game.lastResult.swappedWith = target.id;
    broadcastGame(room, "result");
    return;
  }
  if (action.action === "use-luck") {
    if (game.phase !== "guess" || game.turnPlayerId === player.id) throw new Error("A sorte só pode ser usada ao adivinhar.");
    if (player.luck < 1 || (game.eliminated || []).length) throw new Error("Sorte indisponível.");
    game.eliminated = shuffle(cardTypes.filter((type) => type !== game.activeCard)).slice(0, 3);
    player.luck -= 1;
    broadcastGame(room);
    return;
  }
  if (action.action === "joker-reveal") {
    const selection = game.jokerSelection;
    const target = selection && game.players.get(selection.targetId);
    if (
      game.phase !== "joker-reveal"
      || !selection
      || selection.ownerId !== player.id
      || !target
      || !Number.isInteger(action.index)
      || action.index < 0
      || action.index >= target.hand.length
      || selection.selectedIndices.includes(action.index)
    ) throw new Error("Carta inválida para revelar.");
    selection.selectedIndices.push(action.index);
    selection.cards.push(target.hand[action.index]);
    if (selection.selectedIndices.length === Math.min(2, target.hand.length)) {
      selection.stage = "select";
      game.phase = "joker-select";
      scheduleDeadline(room);
    }
    broadcastGame(room);
    return;
  }
  if (action.action === "joker-pick") {
    const selection = game.jokerSelection;
    if (
      game.phase !== "joker-select"
      || !selection
      || selection.ownerId !== player.id
      || !Number.isInteger(action.index)
      || !selection.selectedIndices.includes(action.index)
    ) throw new Error("A escolha do Coringa não está disponível.");
    selection.chosenIndex = action.index;
    selection.stage = "swap";
    game.phase = "joker-swap";
    scheduleDeadline(room);
    broadcastGame(room);
    return;
  }
  if (action.action === "joker-swap") {
    const selection = game.jokerSelection;
    if (game.phase !== "joker-swap" || !selection || selection.ownerId !== player.id
      || !Number.isInteger(action.index) || action.index < 0 || action.index >= player.hand.length) {
      throw new Error("Carta inválida para trocar.");
    }
    finishJokerSwap(room, action.index);
    return;
  }
  throw new Error("Ação de sala inválida.");
}

function finishJokerSwap(room, ownIndex) {
  const game = room.game;
  const selection = game.jokerSelection;
  const owner = game.players.get(selection.ownerId);
  const target = game.players.get(selection.targetId);
  [owner.hand[ownIndex], target.hand[selection.chosenIndex]] = [target.hand[selection.chosenIndex], owner.hand[ownIndex]];
  game.lastResult.jokerSwap = true;
  game.jokerSelection = null;
  game.phase = "result";
  clearDeadlineTimer(game);
  checkEliminationsAndWinner(room);
  if (room.status === "finished") return;
  scheduleNextTurn(room);
}

function handleMessage(peer, message) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    sendError(peer, "Mensagem inválida.");
    return;
  }

  if (message.type === "list-rooms") {
    if (!peer.room) send(peer.socket, {
      type: "room-list",
      rooms: [...rooms.values()].filter((room) => room.status === "lobby").map(roomSummary)
    });
    return;
  }

  if (message.type === "create-room") {
    const nickname = normalizeNickname(message.nickname);
    const name = normalizeRoomName(message.roomName);
    if (!nickname || !name) throw new Error("Informe um nickname e nome de sala válidos.");
    if (peer.room) throw new Error("Você já está em uma sala.");
    const room = {
      id: randomUUID(),
      name,
      hostId: peer.publicId,
      players: new Map([[peer.publicId, peer]]),
      status: "lobby",
      createdAt: Date.now(),
      game: null,
      timer: null
    };
    peer.nickname = nickname;
    peer.room = room;
    rooms.set(room.id, room);
    send(peer.socket, { type: "room-created", publicId: peer.publicId, room: { ...roomSummary(room), players: [lobbyPlayer(peer)] } });
    relayLobby(room);
    broadcastRooms();
    logEvent("room-created", { roomId: room.id });
    return;
  }

  if (message.type === "join-room") {
    const nickname = normalizeNickname(message.nickname);
    if (!nickname) throw new Error("Use um nickname de 2 a 18 caracteres.");
    if (peer.room) throw new Error("Você já está em uma sala.");
    if (typeof message.roomId !== "string") throw new Error("Sala inválida.");
    const room = rooms.get(message.roomId);
    if (!room || room.status !== "lobby") throw new Error("Sala indisponível.");
    if (room.players.size >= 2) throw new Error("A sala está cheia.");
    if ([...room.players.values()].some((member) => member.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new Error("Esse nickname já está em uso na sala.");
    }
    peer.nickname = nickname;
    peer.room = room;
    room.players.set(peer.publicId, peer);
    send(peer.socket, { type: "room-joined", publicId: peer.publicId, room: { ...roomSummary(room), players: [...room.players.values()].map(lobbyPlayer) } });
    relayLobby(room);
    broadcastRooms();
    return;
  }

  if (message.type === "start-room") {
    const room = peer.room;
    if (!room || room.status !== "lobby") throw new Error("Sala inválida para iniciar.");
    if (room.hostId !== peer.publicId) throw new Error("Somente o host pode iniciar a partida.");
    if (room.players.size !== 2) throw new Error("São necessários exatamente 2 jogadores.");
    startRoomGame(room);
    return;
  }

  if (message.type === "leave-room") {
    const room = peer.room;
    detachPeer(room, peer, "player-left");
    send(peer.socket, { type: "room-left" });
    send(peer.socket, { type: "room-list", rooms: [...rooms.values()].filter((candidate) => candidate.status === "lobby").map(roomSummary) });
    return;
  }

  if (message.type === "room-action") {
    handleRoomAction(peer, message.payload);
    return;
  }

  if (message.type === "chat-room") {
    const room = peer.room;
    if (!room) throw new Error("Você não está em uma sala.");
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (text.length < 1 || text.length > 240 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      throw new Error("Mensagem de chat inválida.");
    }
    broadcastRoom(room, {
      type: "room-chat",
      roomId: room.id,
      from: lobbyPlayer(peer),
      text,
      at: new Date().toISOString()
    });
    return;
  }

  sendError(peer, "Tipo de mensagem desconhecido.");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({
      status: "ok",
      waiting: 0,
      rooms: rooms.size,
      playersOnline: peers.size
    }));
    return;
  }

  if (url.pathname === "/api/ai-learning" && request.method === "GET") {
    learningResponse(response, aiLearning);
    return;
  }

  if (url.pathname === "/api/ai-learning" && request.method === "POST") {
    const origin = request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const window = learningWriteOrigin.get(origin) || { startedAt: now, count: 0 };
    if (now - window.startedAt >= 60_000) {
      window.startedAt = now;
      window.count = 0;
    }
    window.count += 1;
    learningWriteOrigin.set(origin, window);
    if (window.count > 120) {
      learningResponse(response, { error: "Muitas observações em pouco tempo." }, 429);
      return;
    }
    try {
      const observation = await readJsonBody(request);
      if (!globalThis.BlefeAI.validObservation(observation)) {
        learningResponse(response, { error: "Observação inválida." }, 400);
        return;
      }
      globalThis.BlefeAI.addObservation(aiLearning, observation);
      await saveLearningModel();
      learningResponse(response, aiLearning);
    } catch (error) {
      learningResponse(response, { error: error.message }, 400);
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const file = staticFiles.get(url.pathname);
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(root, file[0]);
  try {
    const details = await stat(filePath);
    response.writeHead(200, {
      "content-type": file[1],
      "content-length": details.size,
      "cache-control": "no-cache"
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch (error) {
    logEvent("static-file-error", { file: file[0], message: error.message });
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Unable to read application file");
  }
});

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", "http://localhost");
  const origin = request.headers.origin;
  if (url.pathname !== "/matchmaking") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  if (origin && origin !== "null") {
    try {
      if (new URL(origin).host !== request.headers.host) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
  }

  webSocketServer.handleUpgrade(request, socket, head, (client) => {
    webSocketServer.emit("connection", client, request);
  });
});

webSocketServer.on("connection", (socket) => {
  const peer = {
    id: randomUUID(),
    publicId: randomUUID(),
    socket,
    nickname: null,
    room: null,
    messageWindowAt: Date.now(),
    messageCount: 0,
    isAlive: true
  };
  peers.set(peer.id, peer);
  socketPeers.set(socket, peer);
  socket.on("pong", () => { peer.isAlive = true; });
  logEvent("peer-connected", { peerId: peer.id });

  socket.on("message", (raw) => {
    const now = Date.now();
    if (now - peer.messageWindowAt >= 1_000) {
      peer.messageWindowAt = now;
      peer.messageCount = 0;
    }
    peer.messageCount += 1;
    if (peer.messageCount > 40) {
      socket.close(1008, "Rate limit exceeded");
      return;
    }
    try {
      handleMessage(peer, JSON.parse(raw.toString()));
    } catch (error) {
      logEvent("message-error", { peerId: peer.id, message: error.message });
      sendError(peer, "Não foi possível processar a mensagem.");
    }
  });

  socket.on("close", () => disconnectPeer(peer, "socket-closed"));
  socket.on("error", (error) => logEvent("socket-error", { peerId: peer.id, message: error.message }));
});

const heartbeat = setInterval(() => {
  for (const socket of webSocketServer.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const peer = socketPeers.get(socket);
    if (!peer) continue;
    if (!peer.isAlive) {
      socket.terminate();
      continue;
    }
    peer.isAlive = false;
    socket.ping();
  }
}, 25_000);

server.on("close", () => clearInterval(heartbeat));
await loadLearningModel();
server.listen(port, "0.0.0.0", () => logEvent("server-ready", { port }));
