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
      if (sql.includes("INSERT INTO blefe.players")) {
        const [id, nickname, key] = values;
        if ([...players.values()].some((p) => p.id !== id && p.key === key)) {
          const error = new Error("duplicate");
          error.code = "23505";
          throw error;
        }
        const player = { id, nickname, key, wins: players.get(id)?.wins || 0 };
        players.set(id, player);
        return { rows: [{ id, nickname }] };
      }
      if (sql.startsWith("SELECT id, nickname")) {
        const player = players.get(values[0]);
        return { rows: player ? [{ id: player.id, nickname: player.nickname }] : [] };
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
  globalThis.fetch = async (_url, options) => {
    const token = options.headers.authorization.replace("Bearer ", "");
    return { ok: token !== "invalid", json: async () => ({ id: token, email_confirmed_at: token !== "unconfirmed" ? "yes" : null }) };
  };
  t.after(() => { pg.Pool = OriginalPool; globalThis.fetch = originalFetch; });
  const ranking = await createRanking({
    databaseUrl: "postgresql://test:test@localhost/test", supabaseUrl: "https://example.test",
    publicKey: "test", caFile: new URL("../supabase-ca.crt", import.meta.url)
  });
  await assert.rejects(() => ranking.profile("one", "Lore"), /diferente de Lore/);
  await assert.rejects(() => ranking.profile("unconfirmed", "Outro"), /Confirme/);
  await assert.rejects(() => ranking.profile("invalid", "Outro"), /inválida/);
  await ranking.profile("one", "Ana");
  await assert.rejects(() => ranking.profile("two", "ANA"), /outra conta/);
  await ranking.profile("two", "Bia");
  await ranking.recordWin("match-a", "one");
  await ranking.recordWin("match-a", "one");
  await ranking.recordWin("match-b", null);
  await ranking.recordWin("match-c", null);
  assert.deepEqual(await ranking.leaderboard(), [{ nickname: "Lore", wins: 2 }, { nickname: "Ana", wins: 1 }]);
  assert.equal((await ranking.getPlayer("one")).nickname, "Ana");
});
