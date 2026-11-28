import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { WebSocket } from "ws";

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function connect(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/matchmaking`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(data)));
  await once(socket, "open");
  return {
    socket,
    send: (type, payload = {}) => socket.send(JSON.stringify({ type, ...payload })),
    async next(predicate, timeout = 12000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const index = messages.findIndex(predicate);
        if (index >= 0) return messages.splice(0, index + 1)[index];
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Tempo esgotado aguardando mensagem do servidor.");
    }
  };
}

test("sala mantém cartas ocultas, cronômetros e vitória ao esvaziar a mão", { timeout: 75000 }, async (t) => {
  const port = await availablePort();
  const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port), BLEFE_RANKING_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => server.kill());
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  const readyBy = Date.now() + 5000;
  while (!output.includes('"server-ready"')) {
    if (server.exitCode !== null || Date.now() > readyBy) throw new Error("Servidor de teste não iniciou.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const host = await connect(port);
  const guest = await connect(port);
  t.after(() => { host.socket.terminate(); guest.socket.terminate(); });
  host.send("create-room", { nickname: "Host", roomName: "Teste" });
  const created = await host.next((message) => message.type === "room-created");
  guest.send("join-room", { nickname: "Visitante", roomId: created.room.id });
  await guest.next((message) => message.type === "room-joined");
  host.send("start-room");
  const opening = await host.next((message) => message.type === "game-state" && message.state.phase === "setup-guess");
  const guestOpening = await guest.next((message) => message.type === "game-state" && message.state.phase === "setup-guess");
  assert.ok(opening.state.deadlineAt > Date.now());
  assert.equal(opening.state.activeCard, null);
  assert.deepEqual(opening.state.publicDiscards, []);
  assert.ok([0, 1, 2].includes(opening.state.tableTheme));
  assert.equal(guestOpening.state.tableTheme, opening.state.tableTheme);
  assert.equal(opening.state.players.find((player) => player.id !== opening.state.you).hand, undefined);
  for (const client of [host, guest]) client.send("room-action", { payload: { action: "setup-guess", guess: "leao" } });

  const clients = new Map([[opening.state.you, host], [guestOpening.state.you, guest]]);
  for (let round = 1; round <= 13; round += 1) {
    const snapshot = (await host.next((message) => message.type === "game-state" && message.state.phase === "play" && message.state.round === round)).state;
    assert.ok(snapshot.deadlineAt > Date.now());
    assert.equal(snapshot.tableTheme, opening.state.tableTheme);
    const owner = clients.get(snapshot.turnPlayerId);
    const guesser = owner === host ? guest : host;
    const ownerState = owner === host ? snapshot : (await guest.next((message) => message.type === "game-state" && message.state.phase === "play" && message.state.round === round)).state;
    const card = ownerState.players.find((player) => player.id === ownerState.you).hand[0];
    owner.send("room-action", { payload: { action: "play", cardIndex: 0 } });
    const pending = (await guesser.next((message) => message.type === "game-state" && message.state.phase === "guess" && message.state.round === round)).state;
    assert.equal(pending.activeCard, null);
    assert.equal(pending.tableCard, null);
    assert.equal(pending.publicDiscards.length, round);
    assert.ok(pending.deadlineAt > Date.now());
    guesser.send("room-action", { payload: { action: "guess", guess: card } });
    if (round === 13) {
      const finished = (await host.next((message) => message.type === "game-state" && message.state.phase === "finished")).state;
      assert.equal(finished.winnerId, snapshot.turnPlayerId);
      assert.equal(finished.players.find((player) => player.id === finished.winnerId).handCount, 0);
      assert.equal(finished.publicDiscards.length, round + 1);
    }
  }
});
