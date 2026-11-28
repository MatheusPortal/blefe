import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../version-check.js", import.meta.url), "utf8");

function setup(protocol = "https:") {
  const elements = Object.fromEntries(["#app-version", "#version-status", "#version-update", "#game-shell"]
    .map((key) => [key, { hidden: key !== "#game-shell", textContent: "", listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; } }]));
  elements["#game-shell"].hidden = true;
  const listeners = {};
  const document = {
    visibilityState: "visible",
    querySelector(selector) {
      return selector === 'meta[name="application-version"]' ? { content: "1.1.0" } : elements[selector];
    },
    addEventListener(type, callback) { listeners[type] = callback; }
  };
  let published = "1.1.0";
  let failure = false;
  let reloads = 0;
  let confirm = false;
  let interval;
  const window = {
    location: { protocol, href: `${protocol}//example.test/index.html`, reload() { reloads += 1; } },
    confirm: () => confirm,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval(callback) { interval = callback; },
    addEventListener(type, callback) { listeners[type] = callback; }
  };
  class DOMParser {
    parseFromString(html) {
      return { querySelector: () => html ? { content: html } : null };
    }
  }
  const context = {
    document, window, DOMParser, AbortController, URL, console: { warn() {}, error() {} },
    fetch: async (_url, options) => {
      assert.equal(options.cache, "no-store");
      if (failure) throw new Error("offline");
      return { ok: true, text: async () => published };
    }
  };
  vm.runInNewContext(source, context);
  return {
    elements, listeners,
    setPublished(value) { published = value; },
    setFailure(value) { failure = value; },
    setConfirm(value) { confirm = value; },
    reloads: () => reloads,
    check: () => interval()
  };
}

test("versão da página, arquivos e pacotes permanecem sincronizados", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  const version = html.match(/<meta name="application-version" content="([^"]+)">/)[1];
  assert.equal(version, manifest.version);
  assert.equal(version, lock.version);
  assert.equal(version, lock.packages[""].version);
  const assets = [...html.matchAll(/(?:href|src)="([^"]+\.(?:js|css))\?v=([^"]+)"/g)];
  assert.deepEqual(assets.map((match) => match[1]).sort(), [
    "ai-policy.js", "game.js", "online.js", "ranking-client.js", "style.css", "version-check.js"
  ]);
  for (const asset of assets) assert.equal(asset[2], version);
});

test("avisa apenas sobre versões mais recentes e confirma atualização durante a partida", async () => {
  const fixture = setup();
  await new Promise(setImmediate);
  const { elements } = fixture;
  assert.equal(elements["#app-version"].textContent, "v1.1.0");
  assert.equal(elements["#version-update"].hidden, true);

  fixture.setPublished("1.0.9");
  await fixture.check();
  assert.equal(elements["#version-update"].hidden, true);
  fixture.setPublished("1.2.0");
  await fixture.check();
  assert.equal(elements["#version-update"].hidden, false);
  assert.match(elements["#version-update"].textContent, /v1\.2\.0/);

  elements["#game-shell"].hidden = false;
  elements["#version-update"].listeners.click();
  assert.equal(fixture.reloads(), 0);
  fixture.setConfirm(true);
  elements["#version-update"].listeners.click();
  assert.equal(fixture.reloads(), 1);
  elements["#game-shell"].hidden = true;
  fixture.setConfirm(false);
  elements["#version-update"].listeners.click();
  assert.equal(fixture.reloads(), 2);
});

test("falhas de verificação são informadas e podem ser recuperadas", async () => {
  const fixture = setup();
  await new Promise(setImmediate);
  fixture.setFailure(true);
  await fixture.check();
  assert.match(fixture.elements["#version-status"].textContent, /Não foi possível/);
  fixture.setFailure(false);
  fixture.setPublished("2.0.0");
  await fixture.check();
  assert.equal(fixture.elements["#version-status"].textContent, "");
  assert.equal(fixture.elements["#version-update"].hidden, false);
  fixture.setPublished("");
  await fixture.check();
  assert.match(fixture.elements["#version-status"].textContent, /Não foi possível/);
  assert.equal(fixture.elements["#version-update"].hidden, false);
});

test("versão permanece visível quando o jogo é aberto como arquivo offline", () => {
  const fixture = setup("file:");
  assert.equal(fixture.elements["#app-version"].textContent, "v1.1.0");
  assert.match(fixture.elements["#version-status"].textContent, /offline/);
});
