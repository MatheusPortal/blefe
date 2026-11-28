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

async function setup(healthResponse = { ok: true, json: async () => ({ playersOnline: 0 }) }, connecting = false) {
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
    constructor() { this.readyState = connecting ? 0 : 1; this.listeners = {}; this.sent = []; Socket.instance = this; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    send(message) { this.sent.push(JSON.parse(message)); }
    emit(message) { this.listeners.message({ data: JSON.stringify(message) }); }
  }
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setInterval() { return 1; },
    clearInterval() {},
    BlefeGame: { startOnlineRoom() {}, startOffline() {}, applyRoomSnapshot() {}, leaveToMenu() {} },
    BlefeRanking: { getPlayer: () => null, requireAccount: () => null }
  };
  const context = vm.createContext({
    document, window, WebSocket: Socket,
    fetch: async () => healthResponse,
    location: { protocol: "http:", host: "localhost" }, Date
  });
  vm.runInContext(await readFile(new URL("../online.js", import.meta.url), "utf8"), context);
  return { elements, window, Socket };
}

test("contagem online mostra conexões ou informa indisponibilidade", async () => {
  const available = await setup({ ok: true, json: async () => ({ playersOnline: 3 }) });
  await new Promise(setImmediate);
  assert.equal(available.elements.get("#online-player-count").textContent, "3 online");

  const unavailable = await setup({ ok: false, status: 503 });
  await new Promise(setImmediate);
  assert.equal(unavailable.elements.get("#online-player-count").textContent, "Contagem indisponível");
});

test("offline com conta solicita partida validada e oferece alternativa se houver erro", async () => {
  const { elements, window, Socket } = await setup();
  window.BlefeRanking = { getPlayer: () => ({ nickname: "Ana" }), requireAccount: () => "token" };
  let startedOffline = false;
  window.BlefeGame.startOffline = () => { startedOffline = true; };
  elements.get("#offline-button").listeners.click();
  assert.ok(Socket.instance.sent.some((message) => message.type === "play-ranked-lore" && message.token === "token"));
  Socket.instance.emit({ type: "error", message: "Ranking indisponível." });
  assert.equal(elements.get("#offline-unranked-button").hidden, false);
  elements.get("#offline-unranked-button").listeners.click();
  assert.equal(startedOffline, true);
});

test("falha de conexão não repete partida pendente ao reconectar", async () => {
  const { elements, window, Socket } = await setup(undefined, true);
  window.BlefeRanking = { getPlayer: () => ({ nickname: "Ana" }), requireAccount: () => "token" };
  elements.get("#offline-button").listeners.click();
  Socket.instance.readyState = 3;
  Socket.instance.listeners.close();
  assert.equal(elements.get("#offline-unranked-button").hidden, false);
  assert.equal(elements.get("#close-online").disabled, false);
  elements.get("#online-button").listeners.click();
  Socket.instance.readyState = 1;
  Socket.instance.listeners.open();
  assert.ok(Socket.instance.sent.every((message) => message.type !== "play-ranked-lore"));
});

test("mesa de espera mostra adversário e cancela a contagem quando ele sai", async () => {
  const { elements, Socket } = await setup();
  elements.get("#online-button").listeners.click();
  const socket = Socket.instance;
  const own = { id: "a", nickname: "Ana" };
  const opponent = { id: "b", nickname: "Bia" };
  socket.emit({ type: "room-created", publicId: "a", room: { name: "Mesa", players: [own] } });
  assert.equal(elements.get("#waiting-room").hidden, false);
  assert.equal(elements.get("#waiting-peer-name").textContent, "Aguardando adversário");
  socket.emit({ type: "lobby-update", room: { name: "Mesa", players: [own, opponent], startsAt: Date.now() + 5000, serverTime: Date.now() } });
  assert.equal(elements.get("#waiting-peer-name").textContent, "Bia");
  assert.match(elements.get("#waiting-status").textContent, /5 s/);
  socket.emit({ type: "lobby-update", room: { name: "Mesa", players: [own] } });
  assert.match(elements.get("#waiting-status").textContent, /outro jogador/);
});

test("eventos de conexão anteriores e posteriores ao início aparecem uma vez no chat", async () => {
  const { elements, Socket } = await setup();
  elements.get("#online-button").listeners.click();
  const socket = Socket.instance;
  socket.listeners.open();
  const room = { name: "Mesa", players: [{ id: "a", nickname: "Ana" }] };
  socket.emit({ type: "room-created", publicId: "a", room });
  socket.emit({ type: "lobby-update", room });
  socket.emit({ type: "room-started", players: [{}, {}] });
  socket.emit({ type: "error", message: "Erro de conexão de teste." });
  socket.listeners.close();
  const messages = elements.get("#chat-messages").children;
  for (const text of ["Conectado ao servidor.", "Sala Mesa: 1 jogador(es).", "Partida online iniciada.", "Erro de conexão de teste.", "Conexão perdida."]) {
    assert.equal(messages.filter((message) => message.innerText.includes(text)).length, 1, text);
  }
  assert.ok(messages.every((message) => message.className.includes("chat-system-message")));
  assert.equal(elements.get("#chat-toggle-button").title, "Minimizar chat");
});

test("chat diferencia abandono de desconexão e informa o vencedor", async () => {
  for (const [reason, action] of [["socket-closed", "se desconectou"], ["player-left", "saiu"]]) {
    const { elements, Socket } = await setup();
    elements.get("#online-button").listeners.click();
    const socket = Socket.instance;
    socket.emit({ type: "room-started", players: [{}, {}] });
    socket.emit({
      type: "game-over",
      winner: { id: "a", nickname: "Ana" },
      departure: { player: { id: "b", nickname: "Bia" }, reason }
    });
    const messages = elements.get("#chat-messages").children;
    assert.equal(messages.filter((message) => message.innerText.includes(`Bia ${action} da partida. Ana venceu por abandono.`)).length, 1);
    socket.emit({ type: "game-over", winner: { nickname: "Ana" }, departure: null });
    assert.equal(messages.filter((message) => message.innerText.includes("por abandono")).length, 1);
  }
});

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

test("chat informa quando não é possível ganhar escudo acima do limite", async () => {
  const { elements, window } = await setup();
  window.BlefeOnline.showOfflineLog("Lore");
  window.BlefeOnline.logGameEvent({
    kind: "round-result", round: 1, cardType: "elefante", playedBy: "Lore",
    guesser: "Você", guess: "elefante", correct: true, attributes: [],
    effectSummary: "escudo já está cheio"
  });
  assert.match(elements.get("#chat-messages").children[0].innerText, /escudo já está cheio/);
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
  const resultCards = messages.filter((message) => message.className.includes("chat-round-result-message"));
  assert.equal(resultCards.length, 1);
  for (const text of ["Coringa", "Bia palpitou Vaca", "ERRO", "+1", "Escudo", "Coringa trocou uma carta"]) {
    assert.ok(resultCards[0].innerText.includes(text), text);
  }
});
