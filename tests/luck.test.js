import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const luckCode = source.slice(source.indexOf("  function applyLuck("), source.indexOf("  function advanceAfterResult("));
const validationCode = source.slice(source.indexOf("  function isValidOnlineSnapshot("), source.indexOf("  function getCanvasDescription("));
const types = ["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga", "troca", "coringa"];
const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

test("controle de sorte mantém o ícone e só habilita quando a ação está disponível", () => {
  const code = source.slice(source.indexOf("  function updateTurnTools("), source.indexOf("  function createOnlineSnapshot("));
  const button = {
    setAttribute(_name, value) { this.label = value; },
    set textContent(_value) { throw new Error("O ícone não deve ser substituído."); }
  };
  const state = { phase: "player-guess", players: { player: { luck: 2 } }, hintUsed: false };
  const update = vm.runInNewContext(`${code}\nupdateTurnTools`, {
    state, roomState: null, onlineRole: null, useLuckButton: button,
    swapHandsButton: { setAttribute() {} }, isSwapAvailable: () => false, swapRequestPending: false
  });
  update();
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.match(button.label, /Usar sorte: 2/);
  assert.match(button.title, /três opções/);
  state.hintUsed = true;
  update();
  assert.equal(button.disabled, true);
  state.phase = "player-play";
  update();
  assert.equal(button.hidden, true);
});

test("ganhos de escudo respeitam o limite no offline e no servidor", () => {
  const offlineCode = source.slice(source.indexOf("  function gainLuck("), source.indexOf("  function triggerVisualEffect("));
  const serverCode = serverSource.slice(serverSource.indexOf("function damage("), serverSource.indexOf("function checkEliminationsAndWinner("));
  for (const [type, correct, recipient, amount] of [
    ["tigre", true, "guesser", 1], ["tartaruga", true, "guesser", 1],
    ["elefante", true, "guesser", 1], ["vaca", false, "owner", 2],
    ["macaco", false, "owner", 2], ["tartaruga", false, "owner", 1],
    ["coringa", false, "owner", 1]
  ]) {
    for (const initial of [3, 4, 5]) {
      const owner = { id: "owner", name: "Dono", hp: 5, shields: 0, luck: 5, hand: [] };
      const guesser = { id: "guesser", name: "Palpite", hp: 5, shields: 0, luck: 5, hand: [] };
      (recipient === "owner" ? owner : guesser).shields = initial;
      const serverOwner = { ...owner };
      const serverGuesser = { ...guesser };
      const offline = vm.runInNewContext(`${offlineCode}\nresolveCardEffect`, {
        state: { players: { owner, guesser } }, MAX_LUCK: 5,
        drawBonusCards: () => ({}), describeCardDraw: () => "", describeDamage: () => "",
        applyDamage: () => ({})
      });
      const server = vm.runInNewContext(`${serverCode}\nresolveEffect`, { drawCards: () => [] });
      offline(type, "owner", "guesser", correct);
      const result = server({}, type, serverOwner, serverGuesser, correct);
      const expected = Math.min(5, initial + amount);
      assert.equal((recipient === "owner" ? owner : guesser).shields, expected, `offline ${type} ${initial}`);
      assert.equal((recipient === "owner" ? serverOwner : serverGuesser).shields, expected, `servidor ${type} ${initial}`);
      assert.equal(recipient === "owner" ? result.ownerShields : result.shields, expected - initial);
    }
  }
});

test("ganhos de vida e sorte param em cinco no offline e no servidor", () => {
  const offlineCode = source.slice(source.indexOf("  function gainLuck("), source.indexOf("  function triggerVisualEffect("));
  const serverCode = serverSource.slice(serverSource.indexOf("function damage("), serverSource.indexOf("function checkEliminationsAndWinner("));
  for (const initial of [4, 5]) {
    const owner = { id: "owner", name: "Dono", hp: initial, shields: 0, luck: initial, hand: [] };
    const guesser = { id: "guesser", name: "Palpite", hp: 5, shields: 0, luck: 0, hand: [] };
    const serverOwner = { ...owner };
    const serverGuesser = { ...guesser };
    const offline = vm.runInNewContext(`${offlineCode}\nresolveCardEffect`, {
      state: { players: { owner, guesser } }, MAX_LUCK: 5,
      drawBonusCards: () => ({}), describeCardDraw: () => ""
    });
    const server = vm.runInNewContext(`${serverCode}\nresolveEffect`, { drawCards: () => [] });
    offline("peixe", "owner", "guesser", false);
    const result = server({}, "peixe", serverOwner, serverGuesser, false);
    assert.equal(owner.hp, 5);
    assert.equal(owner.luck, 5);
    assert.equal(serverOwner.hp, 5);
    assert.equal(serverOwner.luck, 5);
    assert.equal(result.ownerHp, 5 - initial);
    assert.equal(result.ownerLuck, 5 - initial);
  }
});

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
  player.shields = 6;
  assert.equal(validate(snapshot), false);
  player.shields = 0;
  snapshot.eliminated.push("coelho");
  assert.equal(validate(snapshot), false);
});
