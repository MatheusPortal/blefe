import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createRanking } from "../ranking.js";

test("ranking aceita contas confirmadas, reserva Lore e registra vitórias uma só vez", async (t) => {
  const OriginalPool = pg.Pool;
  const originalFetch = globalThis.fetch;
  const players = new Map();
  const matches = new Map();
  class FakePool {
    async query(sql, values = []) {
      if (sql.includes("CREATE SCHEMA")) return {};
      if (sql.startsWith("DELETE FROM blefe.players")) return {};
      if (sql.startsWith("SELECT id FROM blefe.players WHERE nickname_key")) {
        const found = [...players.values()].find((p) => p.key === values[0]);
        return { rows: found ? [{ id: found.id }] : [] };
      }
      if (sql.startsWith("SELECT login_email FROM blefe.players")) {
        const found = [...players.values()].find((p) => p.key === values[0]);
        return { rows: found ? [{ login_email: found.email }] : [] };
      }
      if (sql.includes("INSERT INTO blefe.players")) {
        const [id, nickname, key, email, avatar] = values;
        if ([...players.values()].some((p) => p.id !== id && p.key === key)) {
          const error = new Error("duplicate");
          error.code = "23505";
          throw error;
        }
        const player = { id, nickname, key, email, avatar: avatar ?? players.get(id)?.avatar ?? 1, wins: players.get(id)?.wins || 0 };
        players.set(id, player);
        return { rows: [{ id, nickname, avatar: player.avatar }] };
      }
      if (sql.startsWith("UPDATE blefe.players SET login_email")) {
        const player = players.get(values[0]);
        if (player) player.email = values[1];
        return { rows: player ? [{ id: player.id, nickname: player.nickname, avatar: player.avatar }] : [] };
      }
      if (sql.includes("INSERT INTO blefe.matches")) {
        const [id, winner, lore] = values;
        if (matches.has(id)) return { rowCount: 0 };
        matches.set(id, { winner, lore });
        return { rowCount: 1 };
      }
      if (sql.startsWith("UPDATE blefe.players")) {
        players.get(values[0]).wins += 1;
        return {};
      }
      if (sql.includes("SELECT nickname, wins FROM")) {
        const rows = [...players.values()].filter((p) => p.wins).map(({ nickname, wins }) => ({ nickname, wins }));
        const wins = [...matches.values()].filter((match) => match.lore).length;
        if (wins) rows.push({ nickname: "Lore", wins });
        return { rows: rows.sort((a, b) => b.wins - a.wins || a.nickname.localeCompare(b.nickname)) };
      }
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return {};
      throw new Error("Consulta inesperada no teste.");
    }
    async connect() { return { query: this.query.bind(this), release() {} }; }
    async end() {}
  }
  pg.Pool = FakePool;
  const signupId = "00000000-0000-4000-8000-000000000003";
  const loginEmails = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/auth/v1/signup")) return { ok: true, json: async () => ({ user: { id: signupId } }) };
    if (String(url).includes("/auth/v1/token")) {
      const body = JSON.parse(options.body);
      loginEmails.push(body.email);
      return { ok: body.password === "password", json: async () => ({ access_token: body.email === "cara@example.test" ? signupId : "one" }) };
    }
    const token = options.headers.authorization.replace("Bearer ", "");
    const email = token === signupId ? "cara@example.test" : `${token}@example.test`;
    return { ok: token !== "invalid", json: async () => ({ id: token, email, email_confirmed_at: token !== "unconfirmed" ? "yes" : null }) };
  };
  t.after(() => { pg.Pool = OriginalPool; globalThis.fetch = originalFetch; });
  const ranking = await createRanking({
    databaseUrl: "postgresql://test:test@localhost/test", supabaseUrl: "https://example.test",
    publicKey: "test", caFile: new URL("../supabase-ca.crt", import.meta.url)
  });
  await assert.rejects(() => ranking.profile("one", "Lore"), /diferente de Lore/);
  await assert.rejects(() => ranking.profile("unconfirmed", "Outro"), /Confirme/);
  await assert.rejects(() => ranking.profile("invalid", "Outro"), /inválida/);
  await ranking.profile("one", "Ana", 42);
  await ranking.profile("one", "Ana");
  await assert.rejects(() => ranking.profile("two", "ANA"), /outra conta/);
  await ranking.profile("two", "Bia");
  assert.equal((await ranking.getPlayer("one")).avatar, 42);
  assert.equal((await ranking.login("aNA", "password")).player.avatar, 42);
  assert.equal(loginEmails.at(-1), "one@example.test");
  players.get("one").email = null;
  assert.equal((await ranking.login("one@example.test", "password")).player.nickname, "Ana");
  assert.equal(players.get("one").email, "one@example.test");
  await assert.rejects(() => ranking.login("desconhecido", "password"), /Confira os dados/);
  assert.deepEqual(await ranking.signup("Cara", "cara@example.test", "password", 50), { confirmationRequired: true });
  assert.equal((await ranking.getSessionPlayer(signupId)).avatar, 50);
  assert.equal(await ranking.getSessionPlayer("new-user"), null);
  await assert.rejects(() => ranking.getSessionPlayer("unconfirmed"), /Confirme/);
  await assert.rejects(() => ranking.getSessionPlayer("invalid"), /inválida/);
  assert.equal((await ranking.login("Cara", "password")).player.avatar, 50);
  await assert.rejects(() => ranking.signup("Cara", "other@example.test", "password", 1), /outra conta/);
  await assert.rejects(() => ranking.profile("one", "Ana", 51), /avatar válido/);
  await ranking.recordWin("match-a", "one");
  await ranking.recordWin("match-a", "one");
  await ranking.recordWin("match-b", null);
  await ranking.recordWin("match-c", null);
  assert.deepEqual(await ranking.leaderboard(), [{ nickname: "Lore", wins: 2 }, { nickname: "Ana", wins: 1 }]);
  assert.equal((await ranking.getPlayer("one")).nickname, "Ana");
});
