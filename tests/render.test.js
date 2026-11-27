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

test("HUD atualiza vida, escudo sem limite e sorte", () => {
  const elements = Object.fromEntries([".player-hud-name", ".player-hud-turn", ...["hp", "shields", "luck"].map((stat) => `[data-stat="${stat}"]`), ...["hp", "shields"].map((stat) => `[data-bar="${stat}"]`)]
    .map((selector) => [selector, { textContent: "", style: {} }]));
  const hud = { querySelector: (selector) => elements[selector] };
  const update = vm.runInNewContext(`${hudCode}\nupdatePlayerHud`, {
    window: { matchMedia: () => ({ matches: true }) }
  });
  update(hud, { nickname: "Bia", hp: 4, shields: 2, luck: 1 }, true);
  assert.equal(hud.hidden, false);
  assert.equal(elements[".player-hud-name"].textContent, "Bia");
  assert.equal(elements[".player-hud-turn"].hidden, false);
  assert.equal(elements['[data-bar="hp"]'].style.width, "80%");
  assert.equal(elements['[data-bar="shields"]'].style.width, "40%");
  update(hud, { name: "Nina", hp: 2, shields: 8, luck: 3 }, false);
  assert.equal(elements[".player-hud-name"].textContent, "Nina");
  assert.equal(elements['[data-stat="hp"]'].textContent, "2");
  assert.equal(elements['[data-stat="shields"]'].textContent, "8");
  assert.equal(elements['[data-stat="luck"]'].textContent, "3");
  assert.equal(elements['[data-bar="hp"]'].style.width, "40%");
  assert.equal(elements['[data-bar="shields"]'].style.width, "100%");
  assert.equal(elements[".player-hud-turn"].hidden, true);
  update(hud, null, false);
  assert.equal(hud.hidden, true);
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
