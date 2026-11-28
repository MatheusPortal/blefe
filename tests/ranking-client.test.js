import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class Element {
  constructor() { this.listeners = {}; this.children = []; this.textContent = ""; this.value = ""; this.hidden = false; this.open = false; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  reportValidity() { return true; }
}

test("ranking mostra vitórias e exige conta para partida ranqueada", async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() { return new Element(); }
  };
  const window = {};
  const fetch = async (url, options = {}) => {
    const target = String(url);
    let body;
    if (target === "/api/ranking") body = { players: [{ nickname: "Lore", wins: 3 }] };
    else if (target === "/api/ranking/config") body = { url: "https://example.test", publicKey: "public" };
    else if (target.includes("/auth/v1/token")) body = { access_token: "token" };
    else if (target.includes("/auth/v1/signup")) body = {};
    else if (target === "/api/ranking/profile") {
      assert.equal(options.headers.authorization, "Bearer token");
      body = { player: { nickname: "Ana" } };
    } else throw new Error("URL inesperada");
    return { ok: true, json: async () => body };
  };
  vm.runInNewContext(await readFile(new URL("../ranking-client.js", import.meta.url), "utf8"), { document, window, fetch, URL });
  elements.get("#rank-button").listeners.click();
  await new Promise(setImmediate);
  assert.equal(elements.get("#rank-dialog").open, true);
  assert.equal(elements.get("#ranking-list").children[0].children[0].textContent, "Lore");
  assert.equal(elements.get("#ranking-list").children[0].children[1].textContent, "3 vitórias");
  assert.equal(window.BlefeRanking.requireAccount(), null);
  assert.equal(elements.get("#account-dialog").open, true);
  elements.get("#account-nickname").value = "Ana";
  elements.get("#account-email").value = "example@example.test";
  elements.get("#account-password").value = "password";
  elements.get("#signup-button").listeners.click();
  await new Promise(setImmediate);
  assert.match(elements.get("#account-status").textContent, /confirmar/);
  assert.equal(window.BlefeRanking.requireAccount(), null);
  elements.get("#account-password").value = "password";
  elements.get("#account-form").listeners.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(window.BlefeRanking.requireAccount(), "token");
  assert.equal(window.BlefeRanking.getPlayer().nickname, "Ana");
  assert.equal(elements.get("#account-password").value, "");
  elements.get("#signout-button").listeners.click();
  assert.equal(window.BlefeRanking.requireAccount(), null);
});
