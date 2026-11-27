import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const pileCode = source.slice(source.indexOf("  function drawDiscardPile("), source.indexOf("  function drawCardDetails("));
const geometryCode = source.slice(source.indexOf("  function handCardGeometry("), source.indexOf("  function drawHandCard("));
const roundCode = source.slice(source.indexOf("  function updateRoundIndicator("), source.indexOf("  function renderRoom("));
const hudCode = source.slice(source.indexOf("  function updatePlayerHud("), source.indexOf("  function renderRoom("));

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

test("indicador distingue abertura, rodadas concluídas e Coringa pendente", () => {
  const roundLabel = {};
  const roundValue = {};
  const roundCompleted = {};
  const indicator = { setAttribute(_name, value) { this.label = value; } };
  const update = vm.runInNewContext(`${roundCode}\nupdateRoundIndicator`, {
    roundLabel, roundValue, roundCompleted, roundIndicator: indicator
  });
  update(1, [], true, false);
  assert.equal(roundLabel.textContent, "Abertura");
  assert.equal(roundValue.hidden, true);
  assert.equal(roundCompleted.textContent, "0 concluídas");
  update(2, ["leao", "peixe"], false, false);
  assert.equal(roundLabel.textContent, "Rodada");
  assert.equal(roundValue.textContent, "2");
  assert.equal(roundCompleted.textContent, "1 concluída");
  update(2, ["leao", "peixe", "coringa"], false, true);
  assert.equal(roundCompleted.textContent, "1 concluída");
  update(2, ["leao", "peixe", "coringa"], false, false);
  assert.equal(roundCompleted.textContent, "2 concluídas");
  assert.match(indicator.label, /Rodada 2, 2 rodadas concluídas/);
});

test("HUD mostra atributos e contagem pública do jogador e atualiza mudanças", () => {
  const elements = Object.fromEntries([".player-hud-name", ".player-hud-turn", ...["hp", "shields", "luck", "cards"].map((stat) => `[data-stat="${stat}"]`)]
    .map((selector) => [selector, { textContent: "" }]));
  const hud = { querySelector: (selector) => elements[selector] };
  const update = vm.runInNewContext(`${hudCode}\nupdatePlayerHud`, {
    window: { matchMedia: () => ({ matches: true }) }
  });
  update(hud, { nickname: "Bia", hp: 4, shields: 2, luck: 1 }, 7, true);
  assert.equal(hud.hidden, false);
  assert.equal(elements[".player-hud-name"].textContent, "Bia");
  assert.equal(elements[".player-hud-turn"].hidden, false);
  assert.equal(elements['[data-stat="cards"]'].textContent, "7");
  update(hud, { name: "IA", hp: 2, shields: 0, luck: 3 }, 3, false);
  assert.equal(elements[".player-hud-name"].textContent, "IA");
  assert.equal(elements['[data-stat="hp"]'].textContent, "2");
  assert.equal(elements['[data-stat="shields"]'].textContent, "0");
  assert.equal(elements['[data-stat="luck"]'].textContent, "3");
  assert.equal(elements['[data-stat="cards"]'].textContent, "3");
  assert.equal(elements[".player-hud-turn"].hidden, true);
  update(hud, null, undefined, false);
  assert.equal(hud.hidden, true);
});
