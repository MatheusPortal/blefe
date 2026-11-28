import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const pileCode = source.slice(source.indexOf("  function drawDiscardPile("), source.indexOf("  function drawCardDetails("));
const geometryCode = source.slice(source.indexOf("  function handCardGeometry("), source.indexOf("  function drawHandCard("));
const roundCode = source.slice(source.indexOf("  function updateRoundIndicator("), source.indexOf("  function renderRoom("));
const hudCode = source.slice(source.indexOf("  function updatePlayerHud("), source.indexOf("  function renderRoom("));
const tableLayoutCode = source.slice(source.indexOf("  function getTableLayout("), source.indexOf("  function drawRoomTable("));
const visualEffectCode = source.slice(source.indexOf("  function drawVisualEffect("), source.indexOf("  function drawExtraDeck("));
const accessibleCardsCode = source.slice(source.indexOf("  function renderAccessibleCards("), source.indexOf("  function renderActions("));

test("ícone de som alterna estado e nome acessível", () => {
  const code = source.slice(source.indexOf('  soundToggle.addEventListener("click"'), source.indexOf('  window.addEventListener("pointerdown"'));
  const attributes = {};
  const soundToggle = {
    addEventListener(_type, handler) { this.click = handler; },
    setAttribute(name, value) { attributes[name] = value; }
  };
  vm.runInNewContext(`let soundEnabled = true; let audioOutput = null;\n${code}`, {
    soundToggle, prepareAudio() {}, startBackgroundMusic() {}, stopBackgroundMusic() {}
  });
  soundToggle.click();
  assert.equal(attributes["aria-pressed"], "false");
  assert.equal(attributes["aria-label"], "Ligar som");
  assert.equal(soundToggle.title, "Ligar som");
  soundToggle.click();
  assert.equal(attributes["aria-pressed"], "true");
  assert.equal(attributes["aria-label"], "Desligar som");
  assert.equal(soundToggle.title, "Desligar som");
});

test("carta jogada permanece no centro ao ser revelada, sobre a pilha", () => {
  for (const mobile of [false, true]) {
    const calls = [];
    const drawPile = vm.runInNewContext(`${pileCode}\ndrawDiscardPile`, {
      isMobileCanvas: () => mobile,
      drawCard: (_ctx, x, y, card, width, height) => calls.push({ x, y, card, width, height })
    });

    const x = mobile ? 390 : 550;
    const y = mobile ? 650 : 326;
    drawPile(null, x, y, ["leao", "vaca"], true);
    const hidden = calls.at(-1);
    assert.equal(hidden.card, null);
    assert.equal(hidden.x + hidden.width / 2, x);
    assert.equal(hidden.y + hidden.height / 2, y);
    assert.deepEqual(calls.map((call) => call.card), ["leao", "vaca", null]);

    calls.length = 0;
    drawPile(null, x, y, ["leao", "vaca", "peixe"], false);
    const revealed = calls.at(-1);
    assert.equal(revealed.card, "peixe");
    assert.equal(revealed.x, hidden.x);
    assert.equal(revealed.y, hidden.y);
    assert.deepEqual(calls.map((call) => call.card), ["leao", "vaca", "peixe"]);
  }
});

test("carta ampliada não encobre a carta central", () => {
  for (const mobile of [false, true]) {
    const centerX = mobile ? 390 : 550;
    const centerY = mobile ? 650 : 326;
    const centralHeight = mobile ? 176 : 144;
    const geometry = vm.runInNewContext(`${geometryCode}\nhandCardGeometry`, {
      isMobileCanvas: () => mobile,
      CARD_WIDTH: 116,
      CARD_HEIGHT: 160,
      canvasWidth: centerX * 2
    });

    const hovered = geometry({ x: centerX, y: mobile ? 1180 : 536, angle: 0 }, 1);
    assert.ok(hovered.y - hovered.height / 2 >= centerY + centralHeight / 2);
  }
});

test("indicador mostra somente a abertura ou a rodada atual", () => {
  const roundLabel = {};
  const roundValue = {};
  const indicator = { setAttribute(_name, value) { this.label = value; } };
  const update = vm.runInNewContext(`${roundCode}\nupdateRoundIndicator`, {
    roundLabel, roundValue, roundIndicator: indicator
  });
  update(1, true);
  assert.equal(roundLabel.textContent, "Abertura");
  assert.equal(roundValue.hidden, true);
  assert.equal(indicator.label, "Abertura");
  update(2, false);
  assert.equal(roundLabel.textContent, "Rodada");
  assert.equal(roundValue.textContent, "2");
  assert.equal(roundValue.hidden, false);
  assert.equal(indicator.label, "Rodada 2");
});

test("monte extra e palpites preservam as laterais e não ficam sob os dados", () => {
  const layoutFor = vm.runInNewContext(`${tableLayoutCode}\ngetTableLayout`);
  const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const [mobile, width] of [[false, 1100], [true, 780]]) {
    const layout = layoutFor(mobile);
    const extra = { ...layout.extra, width: layout.extra.width + 14, height: layout.extra.height + 14 };
    const guesses = [layout.guesses.player, layout.guesses.opponent]
      .map((position) => ({ ...position, width: layout.guesses.width, height: layout.guesses.height }));
    const dice = [layout.dice.player, layout.dice.opponent]
      .map((position) => ({ x: position.x - 36, y: position.y - 36, width: 72, height: 72 }));
    for (const card of [extra, ...guesses]) {
      assert.ok(card.x >= width * .18 && card.x + card.width <= width * .82);
      for (const die of dice) assert.equal(overlap(card, die), false);
    }
    assert.ok(extra.y + extra.height < (mobile ? 860 : 401));
    for (const guess of guesses) assert.equal(overlap(extra, guess), false);
    assert.equal(overlap(guesses[0], guesses[1]), false);
  }
});

test("HUD mostra cinco segmentos por atributo e descreve os valores para leitores de tela", () => {
  const elements = Object.fromEntries([".hud-avatar", ...["hp", "shields", "luck"].map((stat) => `[data-stat="${stat}"]`)]
    .map((selector) => [selector, { textContent: "", setAttribute(_name, value) { this.dashes = value; } }]));
  const hud = {
    querySelector: (selector) => elements[selector],
    classList: { toggle(_name, active) { hud.active = active; } },
    setAttribute(_name, value) { this.label = value; }
  };
  const update = vm.runInNewContext(`${hudCode}\nupdatePlayerHud`);
  update(hud, { nickname: "Bia", hp: 4, shields: 2, luck: 1 }, true);
  assert.equal(hud.hidden, false);
  assert.equal(elements[".hud-avatar"].textContent, "B");
  assert.equal(hud.active, true);
  assert.match(hud.label, /Bia: vida 4 de 5, escudo 2 de 5, sorte 1 de 5/);
  for (const [stat, expected] of [["hp", 4], ["shields", 2], ["luck", 1]]) {
    assert.equal(elements[`[data-stat="${stat}"]`].dashes.split("16 4").length - 1, expected);
  }
  update(hud, { name: "Nina", hp: 0, shields: 5, luck: 3 }, false);
  assert.equal(elements[".hud-avatar"].textContent, "N");
  assert.equal(elements['[data-stat="hp"]'].dashes.split("16 4").length - 1, 0);
  assert.equal(elements['[data-stat="shields"]'].dashes.split("16 4").length - 1, 5);
  assert.equal(hud.active, false);
  update(hud, null, false);
  assert.equal(hud.hidden, true);
});

test("cartas acessíveis permitem jogar e completar a escolha do Coringa sem revelar cartas ocultas", () => {
  class Element {
    constructor() { this.children = []; this.attributes = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener(_type, callback) { this.click = callback; }
    contains() { return false; }
  }
  const accessibleCards = new Element();
  const state = {
    phase: "player-play",
    players: { player: { hand: ["leao", "vaca"] }, ai: { hand: ["peixe", "vaca"] } }
  };
  const actions = [];
  const context = {
    accessibleCards,
    document: { activeElement: null, createElement: () => new Element() },
    canvas: {},
    state, onlineRole: null, roomState: null, roomSession: null,
    CARDS: {
      leao: { name: "Leão", effect: "Efeito do leão" },
      vaca: { name: "Vaca", effect: "Efeito da vaca" },
      peixe: { name: "Peixe", effect: "Efeito do peixe" }
    },
    playCard: (player, card) => actions.push([player, card]),
    submitJokerReveal: (index) => actions.push(["joker", index])
  };
  const render = vm.runInNewContext(`let accessibleCardsKey = "";\n${accessibleCardsCode}\nrenderAccessibleCards`, context);
  render();
  assert.match(accessibleCards.children[0].children[0].attributes["aria-label"], /Leão.*Efeito do leão/);
  accessibleCards.children[0].children[1].click();
  assert.deepEqual(actions.pop(), ["player", "vaca"]);

  state.phase = "player-joker-select";
  state.pendingJokerReveal = { target: "ai", stage: "reveal", selectedIndices: [0], revealedCards: ["peixe"] };
  render();
  const opponent = accessibleCards.children[1].children;
  assert.equal(opponent[0].disabled, true);
  assert.match(opponent[0].attributes["aria-label"], /Peixe/);
  assert.match(opponent[1].attributes["aria-label"], /virada/);
  assert.doesNotMatch(opponent[1].attributes["aria-label"], /Vaca/);
  opponent[1].click();
  assert.deepEqual(actions.pop(), ["joker", 1]);

  state.pendingJokerReveal.stage = "swap";
  render();
  accessibleCards.children[0].children[0].click();
  assert.deepEqual(actions.pop(), ["joker", 0]);

  context.onlineRole = "room";
  context.roomState = {
    you: "a", turnPlayerId: "a", phase: "play",
    players: [{ id: "a", hand: ["leao", "vaca"] }, { id: "b", handCount: 2 }]
  };
  context.getRoomPlayer = () => context.roomState.players[0];
  context.playRoomCard = (index) => actions.push(["play", index]);
  context.roomSession = { sendAction: (action) => actions.push(action) };
  render();
  accessibleCards.children[0].children[1].click();
  assert.deepEqual(actions.pop(), ["play", 1]);
  context.roomState.phase = "joker-select";
  context.roomState.jokerSelection = { ownerId: "a", targetId: "b", stage: "select", selectedIndices: [1], cards: ["peixe"] };
  render();
  assert.match(accessibleCards.children[1].children[0].attributes["aria-label"], /Peixe/);
  accessibleCards.children[1].children[0].click();
  assert.equal(actions.pop().action, "joker-pick");
});

test("revelação não desenha círculo ou exclamação, mas troca mantém animação", () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_target, key) { return (...args) => calls.push([key, ...args]); },
    set() { return true; }
  });
  const state = { visualEffect: { kind: "reveal", correct: false }, visualEffectStartedAt: 0 };
  const draw = vm.runInNewContext(`${visualEffectCode}\ndrawVisualEffect`, {
    state, performance: { now: () => 500 }, isMobileCanvas: () => false, canvasWidth: 1100,
    roundRect() {}
  });
  draw(ctx);
  assert.ok(!calls.some(([method]) => method === "ellipse" || method === "fillText"));
  state.visualEffect.kind = "swap";
  draw(ctx);
  assert.ok(calls.some(([method, text]) => method === "fillText" && text === "MÃOS TROCADAS"));
});
