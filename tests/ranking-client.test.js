import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import "../avatars.js";

class Element {
  constructor() {
    this.listeners = {};
    this.children = [];
    this.attributes = {};
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.open = false;
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  reportValidity() { return true; }
  focus() {}
}

test("entrada, seleção de avatar e conta preservam o perfil", async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() { return new Element(); }
  };
  const window = { BlefeAvatars: globalThis.BlefeAvatars };
  const requests = [];
  const fetch = async (url, options = {}) => {
    const target = String(url);
    const payload = options.body ? JSON.parse(options.body) : null;
    requests.push({ target, payload });
    let body;
    if (target === "/api/ranking") body = { players: [{ nickname: "Lore", wins: 3 }] };
    else if (target === "/api/account/signup") body = { confirmationRequired: true };
    else if (target === "/api/account/login") body = { accessToken: "token", player: { nickname: "Ana", avatar: 8 } };
    else if (target === "/api/ranking/profile") {
      assert.equal(options.headers.authorization, "Bearer token");
      body = { player: { nickname: "Ana", avatar: payload.avatar } };
    } else throw new Error("URL inesperada");
    return { ok: true, json: async () => body };
  };
  vm.runInNewContext(await readFile(new URL("../ranking-client.js", import.meta.url), "utf8"), { document, window, fetch });
  const grid = elements.get("#avatar-grid");
  assert.equal(grid.children.length, 50);
  assert.equal(new Set(grid.children.map((button) => button.innerHTML)).size, 50);
  elements.get("#entry-avatar-button").listeners.click();
  grid.children[11].listeners.click();
  await elements.get("#save-avatar").listeners.click();
  document.querySelector("#nickname-input").value = "Visitante";
  elements.get("#entry-form").listeners.submit({ preventDefault() {} });
  assert.equal(window.BlefeProfile.get().nickname, "Visitante");
  assert.equal(window.BlefeProfile.get().avatar, 12);
  assert.equal(elements.get("#entry-screen").hidden, true);
  assert.equal(elements.get("#main-menu").hidden, false);

  elements.get("#rank-button").listeners.click();
  await new Promise(setImmediate);
  assert.equal(elements.get("#ranking-list").children[0].children[0].textContent, "Lore");
  assert.equal(window.BlefeRanking.requireAccount(), null);
  elements.get("#signup-button").listeners.click();
  elements.get("#account-nickname").value = "Ana";
  elements.get("#account-email").value = "ana@example.test";
  elements.get("#account-password").value = "password";
  elements.get("#account-form").listeners.submit({ preventDefault() {} });
  let cancelled = false;
  elements.get("#account-dialog").listeners.cancel({ preventDefault() { cancelled = true; } });
  assert.equal(cancelled, true);
  assert.equal(elements.get("#close-account").disabled, true);
  await new Promise(setImmediate);
  assert.equal(requests.find((request) => request.target === "/api/account/signup").payload.avatar, 12);
  assert.match(elements.get("#account-status").textContent, /confirmar/);
  assert.equal(elements.get("#account-identifier").value, "Ana");
  elements.get("#account-password").value = "password";
  elements.get("#account-form").listeners.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(requests.find((request) => request.target === "/api/account/login").payload.identifier, "Ana");
  assert.equal(window.BlefeRanking.requireAccount(), "token");
  assert.equal(window.BlefeProfile.get().avatar, 8);
  elements.get("#profile-button").listeners.click();
  grid.children[49].listeners.click();
  const saving = elements.get("#save-avatar").listeners.click();
  cancelled = false;
  elements.get("#avatar-dialog").listeners.cancel({ preventDefault() { cancelled = true; } });
  assert.equal(cancelled, true);
  await saving;
  assert.equal(window.BlefeProfile.get().avatar, 50);
  assert.equal(requests.at(-1).payload.avatar, 50);
  elements.get("#account-password").value = "password";
  elements.get("#account-dialog").listeners.close();
  assert.equal(elements.get("#account-password").value, "");
  elements.get("#signout-button").listeners.click();
  assert.equal(window.BlefeProfile.get(), null);
  assert.equal(elements.get("#entry-screen").hidden, false);
});

test("entrada oferece login e cadastro separados", async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() { return new Element(); }
  };
  const window = { BlefeAvatars: globalThis.BlefeAvatars };
  vm.runInNewContext(await readFile(new URL("../ranking-client.js", import.meta.url), "utf8"), { document, window });
  elements.get("#entry-signup-button").listeners.click();
  assert.equal(elements.get("#account-title").textContent, "Criar conta");
  assert.equal(elements.get("#account-signup-fields").hidden, false);
  elements.get("#entry-account-button").listeners.click();
  assert.equal(elements.get("#account-title").textContent, "Entrar na conta");
  assert.equal(elements.get("#account-login-fields").hidden, false);
});

test("confirmação por e-mail remove tokens da URL e entra ou solicita perfil", async () => {
  const code = await readFile(new URL("../ranking-client.js", import.meta.url), "utf8");
  for (const account of [{ nickname: "Ana", avatar: 8 }, null]) {
    const elements = new Map();
    const document = {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, new Element());
        return elements.get(selector);
      },
      createElement() { return new Element(); }
    };
    const replaced = [];
    const window = {
      BlefeAvatars: globalThis.BlefeAvatars,
      location: { hash: "#access_token=confirmed&refresh_token=secret&type=signup", pathname: "/", search: "?source=email" },
      history: { replaceState: (...args) => replaced.push(args) }
    };
    let authorization;
    const fetch = async (url, options) => {
      authorization = options.headers.authorization;
      if (url === "/api/account/session") return { ok: true, json: async () => ({ player: account }) };
      assert.equal(url, "/api/ranking/profile");
      return { ok: true, json: async () => ({ player: { nickname: "Nova", avatar: 1 } }) };
    };
    vm.runInNewContext(code, { document, window, fetch, URLSearchParams });
    await new Promise(setImmediate);
    assert.equal(replaced[0][2], "/?source=email");
    assert.equal(authorization, "Bearer confirmed");
    if (account) {
      assert.equal(window.BlefeProfile.get().nickname, "Ana");
      assert.equal(window.BlefeRanking.requireAccount(), "confirmed");
    } else {
      assert.equal(window.BlefeProfile.get(), null);
      assert.equal(elements.get("#account-dialog").open, true);
      assert.equal(elements.get("#account-title").textContent, "Complete seu perfil");
      elements.get("#account-nickname").value = "Nova";
      elements.get("#account-form").listeners.submit({ preventDefault() {} });
      await new Promise(setImmediate);
      assert.equal(authorization, "Bearer confirmed");
      assert.equal(window.BlefeProfile.get().nickname, "Nova");
    }
  }
});

test("falha ao recuperar sessão confirmada é exibida sem autenticar", async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() { return new Element(); }
  };
  const window = {
    BlefeAvatars: globalThis.BlefeAvatars,
    location: { hash: "#access_token=invalid&type=signup", pathname: "/", search: "" },
    history: { replaceState() {} }
  };
  const fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: "Sessão inválida" }) });
  vm.runInNewContext(await readFile(new URL("../ranking-client.js", import.meta.url), "utf8"), { document, window, fetch, URLSearchParams });
  await new Promise(setImmediate);
  assert.equal(window.BlefeProfile.get(), null);
  assert.match(elements.get("#entry-status").textContent, /Sessão inválida/);
});

test("link de confirmação expirado informa erro e remove o fragmento", async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() { return new Element(); }
  };
  let cleaned;
  const window = {
    BlefeAvatars: globalThis.BlefeAvatars,
    location: { hash: "#error=access_denied&error_code=otp_expired", pathname: "/", search: "" },
    history: { replaceState: (_state, _title, url) => { cleaned = url; } }
  };
  vm.runInNewContext(await readFile(new URL("../ranking-client.js", import.meta.url), "utf8"), { document, window, URLSearchParams });
  assert.equal(cleaned, "/");
  assert.match(elements.get("#entry-status").textContent, /expirado/);
});
