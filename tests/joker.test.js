import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import "../ai-policy.js";

const source = await readFile(new URL("../server.js", import.meta.url), "utf8");
const rules = source.slice(source.indexOf("function logEvent"), source.indexOf("async function handleMessage"));
const clientSource = await readFile(new URL("../game.js", import.meta.url), "utf8");
const offlineRules = clientSource.slice(clientSource.indexOf("  function resolveGuess("), clientSource.indexOf("  function endGame("));

function fixture(ownerHand, targetHand) {
  const context = {
    cardTypes: globalThis.BlefeAI.types,
    WebSocket: { OPEN: 1 },
    globalThis: { BlefeAI: globalThis.BlefeAI },
    aiLearning: globalThis.BlefeAI.createModel(),
    console: { log() {} },
    setTimeout: (callback, delay) => ({ callback, delay }),
    clearTimeout: () => {}
  };
  const api = vm.runInNewContext(`${rules}\n({ resolveRound, resolveOpening, handleRoomAction, scheduleLoreAction, getLearning: () => aiLearning, setLearningSaver: (fn) => { saveLearningModel = fn; } })`, context);
  const peers = ["a", "b"].map((id) => {
    const messages = [];
    return {
      id, publicId: id, nickname: id.toUpperCase(), messages,
      socket: { readyState: 1, send: (message) => messages.push(JSON.parse(message)) }
    };
  });
  const players = peers.map((peer, index) => ({
    id: peer.publicId, nickname: peer.nickname, peer,
    hand: [...(index === 0 ? ownerHand : targetHand)],
    hp: 4, shields: 0, luck: 0, alive: true
  }));
  const room = {
    id: "test", status: "playing", hostId: "a",
    players: new Map(peers.map((peer) => [peer.publicId, peer])),
    game: {
      players: new Map(players.map((player) => [player.id, player])),
      turnOrder: ["a", "b"], turnPlayerId: "a", round: 1, tableTheme: 0,
      phase: "guess", activeCard: "coringa", tableCard: null,
      publicDiscards: ["leao"], guesses: new Map([["b", "vaca"]]),
      deck: [], opening: false, lastResult: null, jokerSelection: null,
      deadlineTimer: null, eliminated: [], winnerId: null
    }
  };
  peers.forEach((peer) => { peer.room = room; });
  return { ...api, room, owner: players[0], target: players[1], ownerPeer: peers[0], targetPeer: peers[1] };
}

test("Lore joga no servidor apenas quando é sua vez", () => {
  const f = fixture(["leao", "vaca"], ["peixe"]);
  f.room.lore = f.ownerPeer;
  f.room.game.phase = "play";
  f.room.game.activeCard = null;
  f.room.game.guesses.clear();
  f.scheduleLoreAction(f.room);
  assert.ok(f.room.loreTimer);
  f.room.loreTimer.callback();
  assert.equal(f.room.game.phase, "guess");
  assert.equal(f.owner.hand.length, 1);
  assert.ok(["leao", "vaca"].includes(f.room.game.activeCard));
  assert.equal(f.room.loreTimer, null);
});

test("Lore palpita no servidor e aprende com o resultado da rodada", () => {
  const f = fixture(["vaca"], ["peixe"]);
  f.setLearningSaver(() => Promise.resolve());
  f.room.lore = f.targetPeer;
  f.room.game.activeCard = "leao";
  f.room.game.guesses.clear();
  f.scheduleLoreAction(f.room);
  f.room.loreTimer.callback();
  assert.equal(f.room.game.guesses.size, 1);
  assert.equal(f.room.game.phase, "result");
  assert.equal(f.room.game.lastResult.card, "leao");
  assert.ok(f.room.game.lastResult.guesses.b);
  assert.equal(f.getLearning().humanPlays.leao, 1);
  assert.equal(f.getLearning().aiRewards.guess[f.room.game.lastResult.guesses.b].count, 1);
});

function snapshot(peer) {
  return peer.messages.filter((message) => message.type === "game-state").at(-1).state;
}

test("Coringa revela individualmente e troca sem alterar a quantidade de cartas", () => {
  const f = fixture(["tigre", "vaca"], ["leao", "peixe"]);
  f.resolveRound(f.room);
  assert.equal(f.room.game.phase, "joker-reveal");
  assert.deepEqual(snapshot(f.ownerPeer).publicDiscards, ["leao", "coringa"]);
  assert.throws(() => f.handleRoomAction(f.targetPeer, { action: "joker-reveal", index: 0 }));
  f.handleRoomAction(f.ownerPeer, { action: "joker-reveal", index: 1 });
  assert.deepEqual(snapshot(f.ownerPeer).jokerSelection.cards, ["peixe"]);
  assert.deepEqual(snapshot(f.targetPeer).jokerSelection.cards, []);
  assert.throws(() => f.handleRoomAction(f.ownerPeer, { action: "joker-reveal", index: 1 }));
  f.handleRoomAction(f.ownerPeer, { action: "joker-reveal", index: 0 });
  assert.equal(f.room.game.phase, "joker-select");
  assert.deepEqual(snapshot(f.ownerPeer).jokerSelection.cards, ["peixe", "leao"]);
  assert.throws(() => f.handleRoomAction(f.ownerPeer, { action: "joker-pick", index: 2 }));
  f.handleRoomAction(f.ownerPeer, { action: "joker-pick", index: 1 });
  assert.equal(f.room.game.phase, "joker-swap");
  assert.throws(() => f.handleRoomAction(f.targetPeer, { action: "joker-swap", index: 0 }));
  assert.throws(() => f.handleRoomAction(f.ownerPeer, { action: "joker-swap", index: 2 }));
  f.handleRoomAction(f.ownerPeer, { action: "joker-swap", index: 0 });
  assert.deepEqual(f.owner.hand, ["peixe", "vaca"]);
  assert.deepEqual(f.target.hand, ["leao", "tigre"]);
  assert.equal(f.room.status, "playing");
  assert.equal(snapshot(f.ownerPeer).lastResult.jokerSwap, true);
});

test("adversário com uma carta mantém a carta após troca e último Coringa vence", () => {
  const f = fixture(["tigre"], ["peixe"]);
  f.resolveRound(f.room);
  f.handleRoomAction(f.ownerPeer, { action: "joker-reveal", index: 0 });
  assert.equal(f.room.game.phase, "joker-select");
  f.handleRoomAction(f.ownerPeer, { action: "joker-pick", index: 0 });
  f.handleRoomAction(f.ownerPeer, { action: "joker-swap", index: 0 });
  assert.deepEqual(f.owner.hand, ["peixe"]);
  assert.deepEqual(f.target.hand, ["tigre"]);
  assert.equal(f.room.status, "playing");

  const last = fixture([], ["peixe"]);
  last.resolveRound(last.room);
  assert.equal(last.room.status, "finished");
  assert.equal(last.room.game.winnerId, "a");
  assert.equal(last.room.game.jokerSelection, null);
});

test("prazos completam as três etapas e abertura repetida não duplica a pilha", () => {
  const f = fixture(["tigre"], ["peixe", "vaca"]);
  f.resolveRound(f.room);
  for (const phase of ["joker-reveal", "joker-select", "joker-swap"]) {
    assert.equal(f.room.game.phase, phase);
    assert.equal(f.room.game.deadlineTimer.delay, 40_000);
    f.room.game.deadlineTimer.callback();
  }
  assert.equal(f.room.game.phase, "result");
  assert.equal(f.owner.hand.length, 1);
  assert.equal(f.target.hand.length, 2);
  assert.equal(f.room.status, "playing");

  const opening = fixture(["tigre"], ["peixe"]);
  opening.room.game.publicDiscards = [];
  opening.room.game.activeCard = "leao";
  opening.room.game.guesses = new Map([["a", "vaca"], ["b", "vaca"]]);
  opening.resolveOpening(opening.room);
  opening.resolveOpening(opening.room);
  assert.deepEqual(opening.room.game.publicDiscards, ["leao"]);
});

function offlineFixture(owner, ownerHand, targetHand) {
  const target = owner === "player" ? "ai" : "player";
  const state = {
    gameOver: false, pending: { owner, type: "coringa" }, pendingJokerReveal: null,
    players: {
      [owner]: { name: owner, hp: 4, hand: [...ownerHand] },
      [target]: { name: target, hp: 4, hand: [...targetHand] }
    },
    playerGuessHistory: { vaca: 0 }, publicDiscards: ["leao"], resultSequence: 0
  };
  const context = {
    state, window: { clearInterval() {} }, clockInterval: null,
    playResultSound() {}, resolveCardEffect: () => "Coringa",
    getPlayerAttributes: (player) => ({ hp: player.hp, cards: player.hand.length }),
    createAttributeAnimations: () => [], animateAttributeChanges() {}, triggerVisualEffect() {},
    recordResolvedGuess() {}, recordSystemEvent() {}, render() {}, beginTimedPhase() {},
    beginRoundPause() {}, advanceAfterResult() {}, isOnlineGuest: () => false,
    isOnlineHost: () => false, shuffle: (items) => items,
    scoreAiCard: (card) => ({ peixe: 5, leao: 3, vaca: 1 }[card] || 0),
    endGame: (winner) => { state.gameOver = true; state.winner = winner; }
  };
  const api = vm.runInNewContext(`${offlineRules}\n({ resolveGuess, submitJokerReveal })`, context);
  return { ...api, state, target };
}

test("offline revela no leque, troca uma carta e reconhece o último Coringa", () => {
  const f = offlineFixture("player", ["vaca"], ["leao"]);
  f.resolveGuess(f.target, "vaca");
  assert.equal(f.state.pendingJokerReveal.stage, "reveal");
  f.submitJokerReveal(0);
  assert.equal(f.state.pendingJokerReveal.stage, "select");
  f.submitJokerReveal(0);
  assert.equal(f.state.pendingJokerReveal.stage, "swap");
  f.submitJokerReveal(0);
  assert.deepEqual(f.state.players.player.hand, ["leao"]);
  assert.deepEqual(f.state.players.ai.hand, ["vaca"]);
  assert.equal(f.state.gameOver, false);
  assert.deepEqual(f.state.publicDiscards, ["leao", "coringa"]);

  const last = offlineFixture("player", [], ["leao"]);
  last.resolveGuess(last.target, "vaca");
  assert.equal(last.state.winner, "player");
  assert.equal(last.state.pendingJokerReveal, null);
});

test("IA troca a melhor carta revelada por uma própria", () => {
  const f = offlineFixture("ai", ["vaca", "leao"], ["leao", "peixe"]);
  f.resolveGuess(f.target, "vaca");
  assert.deepEqual(f.state.players.ai.hand, ["peixe", "leao"]);
  assert.deepEqual(f.state.players.player.hand, ["leao", "vaca"]);
  assert.equal(f.state.gameOver, false);
  assert.equal(f.state.pendingJokerReveal, null);
});

test("sorte online elimina três opções erradas e só pode ser usada uma vez", () => {
  const f = fixture(["tigre"], ["peixe"]);
  f.target.luck = 2;
  f.handleRoomAction(f.targetPeer, { action: "use-luck" });
  const eliminated = f.room.game.eliminated;
  assert.equal(eliminated.length, 3);
  assert.equal(new Set(eliminated).size, 3);
  assert.ok(!eliminated.includes(f.room.game.activeCard));
  assert.equal(f.target.luck, 1);
  assert.deepEqual(snapshot(f.targetPeer).eliminated, eliminated);
  assert.throws(() => f.handleRoomAction(f.targetPeer, { action: "use-luck" }));
  assert.throws(() => f.handleRoomAction(f.targetPeer, { action: "guess", guess: eliminated[0] }));
});
