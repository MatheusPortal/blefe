import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import "../ai-policy.js";

const AI = globalThis.BlefeAI;

test("avalia efeitos conforme vidas, escudos, baralho e condição de vitória", () => {
  const owner = { hp: 4, shields: 0, luck: 0, cards: 3 };
  const target = { hp: 3, shields: 0, luck: 0, cards: 3 };
  assert.ok(AI.effectValue("macaco", owner, target, false, 5) > AI.effectValue("macaco", owner, target, true, 5));
  assert.ok(AI.effectValue("leao", owner, target, false, 5) > AI.effectValue("leao", owner, { ...target, shields: 2 }, false, 5));
  assert.ok(AI.effectValue("coelho", owner, target, false, 5) > AI.effectValue("coelho", owner, target, false, 0));
  assert.ok(AI.effectValue("leao", { ...owner, cards: 0 }, target, true, 5) >= 12);
  assert.ok(AI.effectValue("coringa", { ...owner, cards: 0 }, target, false, 5) >= 12);
  assert.equal(AI.effectValue("coringa", owner, { ...target, cards: 1 }, false, 5),
    AI.effectValue("coringa", owner, target, false, 5));
});

test("IA não atribui valor a escudos acima do limite", () => {
  const owner = { hp: 5, shields: 5, luck: 0, cards: 3 };
  const target = { hp: 5, shields: 5, luck: 0, cards: 3 };
  assert.equal(AI.effectValue("vaca", owner, target, false, 0), 0);
  assert.equal(AI.effectValue("elefante", owner, target, true, 0), 0);
});

test("IA considera Troca obrigatória mesmo quando é desfavorável", () => {
  const owner = { hp: 5, shields: 0, luck: 0, cards: 1 };
  const target = { hp: 5, shields: 0, luck: 0, cards: 4 };
  assert.ok(AI.effectValue("troca", owner, target, false, 5) < 0);
  assert.equal(AI.effectValue("troca", owner, target, true, 5), 0);
  assert.ok(AI.effectValue("troca", { ...owner, cards: 0 }, target, false, 5) >= 12);
});

test("recompensas atualizam somente a ação realizada e preservam estatísticas antigas", () => {
  const old = AI.createModel();
  old.version = 1;
  old.observations = 4;
  old.humanPlays.vaca = 3;
  const model = AI.sanitizeModel(old);
  assert.equal(model.version, 2);
  assert.equal(model.humanPlays.vaca, 3);
  AI.addObservation(model, { played: "leao", guessed: null, reward: { action: "guess", card: "leao", value: 8 } });
  assert.equal(model.aiRewards.guess.leao.total, 8);
  assert.equal(model.aiRewards.guess.leao.count, 1);
  assert.equal(model.aiRewards.play.leao.count, 0);
  assert.ok(AI.learnedValue(model, "guess", "leao") > 0);
  assert.throws(() => AI.addObservation(model, { played: "leao", guessed: null, reward: { action: "guess", card: "leao", value: 21 } }));
  assert.equal(AI.reward({ ai: { hp: 3, shields: 0, luck: 0, cards: 3 }, player: { hp: 3, shields: 0, luck: 0, cards: 3 } },
    { ai: { hp: 4, shields: 0, luck: 0, cards: 2 }, player: { hp: 2, shields: 0, luck: 0, cards: 3 } }, "ai"), 19);
});

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port, file) {
  const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port), AI_LEARNING_FILE: file, BLEFE_RANKING_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 5000;
  while (!output.includes('"server-ready"')) {
    if (server.exitCode !== null || Date.now() > deadline) {
      server.kill();
      throw new Error("Servidor de teste não iniciou.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return server;
}

test("servidor compartilha e persiste recompensas de jogadores diferentes", { timeout: 15000 }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "blefe-learning-"));
  const file = path.join(dir, "model.json");
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) {
      server.kill();
      await once(server, "exit");
    }
    await rm(file, { force: true });
    await rmdir(dir);
  });
  const old = AI.createModel();
  old.version = 1;
  old.observations = 2;
  old.humanGuesses.vaca = 2;
  await writeFile(file, JSON.stringify(old));
  const port = await availablePort();
  server = await startServer(port, file);
  const url = `http://127.0.0.1:${port}/api/ai-learning`;
  const post = (value) => fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ played: null, guessed: "vaca", reward: { action: "play", card: "leao", value } })
  });
  const responses = await Promise.all([post(5), post(-2)]);
  assert.ok(responses.every((response) => response.ok));
  const model = await (await fetch(url)).json();
  assert.equal(model.version, 2);
  assert.equal(model.observations, 4);
  assert.equal(model.humanGuesses.vaca, 4);
  assert.deepEqual(model.aiRewards.play.leao, { count: 2, total: 3 });
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).aiRewards.play.leao, { count: 2, total: 3 });
  const invalid = await post(21);
  assert.equal(invalid.status, 400);
  server.kill();
  await once(server, "exit");
  server = await startServer(port, file);
  const reloaded = await (await fetch(url)).json();
  assert.equal(reloaded.observations, 4);
  assert.deepEqual(reloaded.aiRewards.play.leao, { count: 2, total: 3 });
});
