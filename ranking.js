import { readFile } from "node:fs/promises";
import pg from "pg";

export async function createRanking({ databaseUrl, supabaseUrl, publicKey, caFile }) {
  if (!databaseUrl || !supabaseUrl || !publicKey || !caFile) return null;
  const parsedUrl = new URL(databaseUrl);
  if ([...parsedUrl.searchParams.keys()].some((key) => key.toLowerCase().startsWith("ssl"))) {
    throw new Error("Não inclua parâmetros SSL na URL do banco; o certificado é configurado pelo servidor.");
  }
  const authUrl = new URL(supabaseUrl);
  if (authUrl.protocol !== "https:" && !(authUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(authUrl.hostname))) {
    throw new Error("A URL de autenticação precisa usar HTTPS.");
  }
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { ca: await readFile(caFile, "utf8"), rejectUnauthorized: true },
    connectionTimeoutMillis: 10000
  });
  try {
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS blefe;
      CREATE TABLE IF NOT EXISTS blefe.players (
        id uuid PRIMARY KEY,
        nickname text NOT NULL,
        nickname_key text NOT NULL UNIQUE,
        wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0)
      );
      CREATE TABLE IF NOT EXISTS blefe.matches (
        id uuid PRIMARY KEY,
        winner_id uuid REFERENCES blefe.players(id),
        lore_won boolean NOT NULL DEFAULT false,
        finished_at timestamptz NOT NULL DEFAULT now(),
        CHECK ((winner_id IS NOT NULL) <> lore_won)
      );
      REVOKE ALL ON SCHEMA blefe FROM PUBLIC;
      REVOKE ALL ON ALL TABLES IN SCHEMA blefe FROM PUBLIC;
      REVOKE ALL ON SCHEMA blefe FROM anon, authenticated;
      REVOKE ALL ON ALL TABLES IN SCHEMA blefe FROM anon, authenticated;
    `);
  } catch (error) {
    await pool.end();
    throw error;
  }

  async function authenticate(token) {
    if (typeof token !== "string" || token.length > 8192) throw new Error("Entre na sua conta.");
    let response;
    try {
      response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
        headers: { apikey: publicKey, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.error("ranking-auth-error", error.name);
      throw new Error("Serviço de autenticação indisponível. Tente novamente.");
    }
    if (!response.ok) throw new Error("Sessão inválida ou expirada. Entre novamente.");
    const user = await response.json();
    if (typeof user.id !== "string" || !user.email_confirmed_at) throw new Error("Confirme seu e-mail antes de jogar no ranking.");
    return user.id;
  }

  async function profile(token, nickname) {
    const id = await authenticate(token);
    if (typeof nickname !== "string") throw new Error("Informe seu apelido.");
    const name = nickname.trim().replace(/\s+/g, " ");
    const key = name.toLocaleLowerCase("pt-BR");
    if (name.length < 2 || name.length > 18 || /[\u0000-\u001f\u007f]/.test(name) || key === "lore") {
      throw new Error("Use um apelido válido de 2 a 18 caracteres, diferente de Lore.");
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO blefe.players (id, nickname, nickname_key) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, nickname_key = EXCLUDED.nickname_key
         RETURNING id, nickname`, [id, name, key]
      );
      return rows[0];
    } catch (error) {
      if (error.code === "23505") throw new Error("Esse apelido já pertence a outra conta.");
      console.error("ranking-profile-database-error", error.code || error.name);
      throw new Error("Não foi possível salvar seu apelido. Tente novamente.");
    }
  }

  async function getPlayer(token) {
    const id = await authenticate(token);
    let rows;
    try {
      ({ rows } = await pool.query("SELECT id, nickname FROM blefe.players WHERE id = $1", [id]));
    } catch (error) {
      console.error("ranking-player-database-error", error.code || error.name);
      throw new Error("Não foi possível carregar sua conta. Tente novamente.");
    }
    if (!rows.length) throw new Error("Cadastre seu apelido antes de jogar.");
    return rows[0];
  }

  async function recordWin(matchId, winnerId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "INSERT INTO blefe.matches (id, winner_id, lore_won) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id",
        [matchId, winnerId || null, !winnerId]
      );
      if (result.rowCount && winnerId) {
        await client.query("UPDATE blefe.players SET wins = wins + 1 WHERE id = $1", [winnerId]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function leaderboard() {
    const { rows } = await pool.query(`
      SELECT nickname, wins FROM (
        SELECT nickname, wins FROM blefe.players WHERE wins > 0
        UNION ALL
        SELECT 'Lore' AS nickname, COUNT(*)::integer AS wins FROM blefe.matches WHERE lore_won
      ) ranking WHERE wins > 0 ORDER BY wins DESC, nickname ASC LIMIT 100
    `);
    return rows;
  }

  return { profile, getPlayer, recordWin, leaderboard, close: () => pool.end(), supabaseUrl, publicKey };
}
