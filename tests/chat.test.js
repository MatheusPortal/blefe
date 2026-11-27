import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
    this.style = {};
    this.hidden = false;
    this.textContent = "";
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...children);
  }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  get firstElementChild() { return this.children[0]; }
  get isConnected() { return Boolean(this.parent); }
  get innerText() { return [this.textContent, ...this.children.map((child) => child.innerText)].join(" "); }
  setAttribute() {}
  querySelector() { return new Element(); }
  showModal() {}
  close() {}
  focus() {}
}

async function setup() {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() { return new Element(); }
  };
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor() { this.readyState = 1; this.listeners = {}; Socket.instance = this; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    send() {}
    emit(message) { this.listeners.message({ data: JSON.stringify(message) }); }
  }
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setInterval() {},
    BlefeGame: { startOnlineRoom() {}, applyRoomSnapshot() {}, leaveToMenu() {} }
  };
  const context = vm.createContext({
    document, window, WebSocket: Socket,
    fetch: async () => ({ json: async () => ({ playersOnline: 0 }) }),
    location: { protocol: "http:", host: "localhost" }, Date
  });
  vm.runInContext(await readFile(new URL("../online.js", import.meta.url), "utf8"), context);
  return { elements, window, Socket };
}

test("eventos offline aparecem em cards com resultado e efeitos", async () => {
  const { elements, window } = await setup();
  window.BlefeOnline.showOfflineLog("Nina");
  assert.equal(elements.get("#chat-peer-name").textContent, "contra Nina");
  window.BlefeOnline.logGameEvent("Partida iniciada");
  window.BlefeOnline.logGameEvent({
    kind: "round-result", round: 1, cardType: "leao", playedBy: "Você", guesser: "IA",
    guess: "vaca", correct: false, attributes: [
      { playerName: "IA", attribute: "hp", value: -2 },
      { playerName: "IA", attribute: "cards", value: 1 }
    ],
    effectSummary: "−2 vidas; compra +1 carta; 1 dano bloqueado por escudo"
  });
  const messages = elements.get("#chat-messages").children;
  assert.equal(messages.length, 2);
  assert.match(messages[0].className, /chat-system-message/);
  assert.match(messages[1].className, /chat-round-result-message/);
  for (const text of ["Leão", "IA palpitou Vaca", "ERRO", "−2", "Vidas"]) {
    assert.ok(messages[1].innerText.includes(text), text);
  }
  assert.equal(messages[1].innerText.split("−2").length - 1, 1);
  assert.equal(messages[1].innerText.split("+1").length - 1, 1);
  assert.match(messages[1].innerText, /dano bloqueado por escudo/);
  const attributes = messages[1].children[1].children[1];
  assert.equal(attributes.children.filter((child) => child.className === "chat-result-change-group").length, 1);
});

test("card preserva ação especial sem repetir alterações", async () => {
  const { elements, window } = await setup();
  window.BlefeOnline.showOfflineLog("Nina");
  window.BlefeOnline.logGameEvent({
    kind: "round-result", round: 2, cardType: "troca", playedBy: "Você", guesser: "IA",
    guess: "vaca", correct: false, attributes: [],
    effectSummary: "Você pode trocar as mãos durante as 2 próximas rodadas"
  });
  const card = elements.get("#chat-messages").children[0];
  assert.match(card.innerText, /pode trocar as mãos durante as 2 próximas rodadas/);
  assert.doesNotMatch(card.innerText, /Sem alterações de atributos/);

  window.BlefeOnline.logGameEvent({
    kind: "round-result", round: 3, cardType: "coringa", playedBy: "Você", guesser: "IA",
    guess: "vaca", correct: false, attributes: [{ playerName: "Você", attribute: "shields", value: 1 }],
    effectSummary: "Você +1 escudo; revela até 2 cartas e troca 1 por uma carta própria"
  });
  const jokerCard = elements.get("#chat-messages").children[1];
  assert.match(jokerCard.innerText, /revela até 2 cartas e troca 1 por uma carta própria/);
  assert.equal(jokerCard.innerText.split("+1").length - 1, 1);
});

test("resultado online final e atualizações permanecem em um único card", async () => {
  const { elements, Socket } = await setup();
  elements.get("#online-button").listeners.click();
  const socket = Socket.instance;
  socket.emit({ type: "room-started", players: [{}, {}] });
  const result = {
    card: "coringa", ownerId: "a", guesses: { b: "vaca" },
    outcomes: [{ guesserId: "b", correct: false }],
    attributes: [{ playerName: "Ana", attribute: "shields", value: 1 }]
  };
  const state = {
    you: "a", phase: "finished", round: 1,
    players: [{ id: "a", nickname: "Ana" }, { id: "b", nickname: "Bia" }],
    lastResult: result
  };
  socket.emit({ type: "game-state", state });
  socket.emit({ type: "game-state", state: { ...state, lastResult: { ...result, jokerSwap: true } } });
  const messages = elements.get("#chat-messages").children;
  assert.equal(messages.length, 1);
  for (const text of ["Coringa", "Bia palpitou Vaca", "ERRO", "+1", "Escudo", "Coringa trocou uma carta"]) {
    assert.ok(messages[0].innerText.includes(text), text);
  }
});
