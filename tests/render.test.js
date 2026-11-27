import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const pileCode = source.slice(source.indexOf("  function drawDiscardPile("), source.indexOf("  function drawCardDetails("));
const geometryCode = source.slice(source.indexOf("  function handCardGeometry("), source.indexOf("  function drawHandCard("));

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
