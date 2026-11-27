import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const luckCode = source.slice(source.indexOf("  function applyLuck("), source.indexOf("  function advanceAfterResult("));
const validationCode = source.slice(source.indexOf("  function isValidOnlineSnapshot("), source.indexOf("  function getCanvasDescription("));
const types = ["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga", "troca", "coringa"];

test("sorte offline elimina três opções sem eliminar a carta jogada", () => {
  for (const card of types) {
    const state = { players: { player: { name: "Você", luck: 2 } }, pending: { type: card }, hintUsed: false };
    const events = [];
    const apply = vm.runInNewContext(`${luckCode}\napplyLuck`, {
      state, CARD_TYPES: types, LUCK_ELIMINATIONS: 3, shuffle: (items) => items,
      CARDS: Object.fromEntries(types.map((type) => [type, { name: type }])),
      playLuckSound() {}, render() {}, recordSystemEvent: (event) => events.push(event)
    });
    apply("player");
    assert.equal(state.eliminated.length, 3);
    assert.equal(new Set(state.eliminated).size, 3);
    assert.ok(!state.eliminated.includes(card));
    assert.equal(state.players.player.luck, 1);
    assert.match(events[0], /três opções/);
    apply("player");
    assert.equal(state.players.player.luck, 1);
  }
});

test("snapshot aceita três opções eliminadas, mas rejeita quatro", () => {
  const validate = vm.runInNewContext(`${validationCode}\nisValidOnlineSnapshot`, {
    CARD_TYPES: types, SPECIAL_CARDS: ["troca", "coringa"], MAX_LUCK: 5, LUCK_ELIMINATIONS: 3,
    DECK_SIZE: 42, TURN_SECONDS: 40, RESULT_PAUSE_SECONDS: 4
  });
  const player = { name: "Nina", hp: 5, luck: 0, shields: 0, extraDrawBlocks: 0, hand: ["leao"] };
  const snapshot = {
    phase: "player-guess", players: { player, ai: player }, rematch: { player: false, ai: false },
    jokerDistributed: false, round: 1, seconds: 40, message: "", extraDeck: [], extraDiscard: [],
    publicDiscards: [], pendingJokerReveal: null, pauseSeconds: 0, resultSequence: 0,
    visualEffectSequence: 0, visualEffect: null, swapAbility: null, systemEvents: [], setupCard: null,
    eliminated: ["vaca", "peixe", "tigre"], guesses: {}, setupGuesses: {}, pending: null,
    lastReveal: null, dice: { player: 1, ai: 1 }, dealt: { player: 0, ai: 0 }
  };
  assert.equal(validate(snapshot), true);
  snapshot.eliminated.push("coelho");
  assert.equal(validate(snapshot), false);
});
