import { readFile } from "node:fs/promises";
import pg from "pg";
import "./avatars.js";

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
      ALTER TABLE blefe.players ADD COLUMN IF NOT EXISTS avatar integer NOT NULL DEFAULT 1;
      ALTER TABLE blefe.players ADD COLUMN IF NOT EXISTS login_email text;
      ALTER TABLE blefe.players ADD COLUMN IF NOT EXISTS pending_at timestamptz;
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
    if (typeof user.email !== "string" || !user.email) throw new Error("Não foi possível verificar o e-mail da conta.");
    return user;
  }

  function normalizeNickname(nickname) {
    if (typeof nickname !== "string") throw new Error("Informe seu apelido.");
    const name = nickname.trim().replace(/\s+/g, " ");
    const key = name.toLocaleLowerCase("pt-BR");
    if (name.length < 2 || name.length > 18 || /[\u0000-\u001f\u007f]/.test(name) || key === "lore") {
      throw new Error("Use um apelido válido de 2 a 18 caracteres, diferente de Lore.");
    }
    return { name, key };
  }

  function validateAvatar(avatar) {
    if (!globalThis.BlefeAvatars.isValid(avatar)) throw new Error("Escolha um avatar válido.");
    return avatar;
  }

  async function profile(token, nickname, avatar) {
    const user = await authenticate(token);
    const { name, key } = normalizeNickname(nickname);
    if (avatar !== undefined) validateAvatar(avatar);
    try {
      const { rows } = await pool.query(
        `INSERT INTO blefe.players (id, nickname, nickname_key, login_email, avatar)
         VALUES ($1, $2, $3, $4, COALESCE($5, 1))
         ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, nickname_key = EXCLUDED.nickname_key,
           login_email = EXCLUDED.login_email, pending_at = NULL,
           avatar = COALESCE($5, players.avatar)
         RETURNING id, nickname, avatar`, [user.id, name, key, user.email, avatar ?? null]
      );
      return rows[0];
    } catch (error) {
      if (error.code === "23505") throw new Error("Esse apelido já pertence a outra conta.");
      console.error("ranking-profile-database-error", error.code || error.name);
      throw new Error("Não foi possível salvar seu apelido. Tente novamente.");
    }
  }

  async function getSessionPlayer(token) {
    const user = await authenticate(token);
    let rows;
    try {
      ({ rows } = await pool.query(
        "UPDATE blefe.players SET login_email = $2, pending_at = NULL WHERE id = $1 RETURNING id, nickname, avatar",
        [user.id, user.email]
      ));
    } catch (error) {
      console.error("ranking-player-database-error", error.code || error.name);
      throw new Error("Não foi possível carregar sua conta. Tente novamente.");
    }
    return rows[0] || null;
  }

  async function getPlayer(token) {
    const player = await getSessionPlayer(token);
    if (!player) throw new Error("Cadastre seu apelido antes de jogar.");
    return player;
  }

  async function authRequest(endpoint, payload) {
    let response;
    try {
      response = await fetch(new URL(endpoint, supabaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", apikey: publicKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.error("account-auth-error", error.name);
      throw new Error("Serviço de autenticação indisponível. Tente novamente.");
    }
    if (!response.ok) throw new Error("Não foi possível acessar a conta. Confira os dados e a confirmação do e-mail.");
    return response.json();
  }

  function validateCredentials(email, password) {
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || typeof password !== "string" || password.length < 8 || password.length > 256) {
      throw new Error("Informe um e-mail válido e uma senha de 8 a 256 caracteres.");
    }
  }

  async function signup(nickname, email, password, avatar) {
    const { name, key } = normalizeNickname(nickname);
    validateAvatar(avatar);
    const address = typeof email === "string" ? email.trim().toLowerCase() : "";
    validateCredentials(address, password);
    try {
      await pool.query("DELETE FROM blefe.players WHERE pending_at < now() - interval '7 days' AND wins = 0");
      const existing = await pool.query("SELECT id FROM blefe.players WHERE nickname_key = $1", [key]);
      if (existing.rows.length) throw new Error("Esse apelido já pertence a outra conta.");
    } catch (error) {
      if (error.message === "Esse apelido já pertence a outra conta.") throw error;
      console.error("account-signup-database-error", error.code || error.name);
      throw new Error("Não foi possível verificar o apelido. Tente novamente.");
    }
    const result = await authRequest("/auth/v1/signup", { email: address, password });
    if (result.access_token) {
      return { accessToken: result.access_token, player: await profile(result.access_token, name, avatar) };
    }
    const id = result.user?.id || result.id;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Não foi possível concluir o cadastro. Tente entrar com seu e-mail.");
    }
    try {
      await pool.query(
        `INSERT INTO blefe.players (id, nickname, nickname_key, login_email, avatar, pending_at)
         VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (id) DO NOTHING`,
        [id, name, key, address, avatar]
      );
    } catch (error) {
      if (error.code === "23505") throw new Error("Esse apelido já pertence a outra conta. Entre com seu e-mail para escolher outro.");
      console.error("account-signup-database-error", error.code || error.name);
      throw new Error("Conta criada, mas não foi possível salvar o perfil. Entre com seu e-mail para finalizar.");
    }
    return { confirmationRequired: true };
  }

  async function login(identifier, password) {
    if (typeof identifier !== "string" || identifier.length > 254 || typeof password !== "string" || password.length > 256) {
      throw new Error("Não foi possível acessar a conta. Confira os dados e a confirmação do e-mail.");
    }
    const input = identifier.trim();
    let address = input.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
      const key = input.replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
      let rows;
      try {
        ({ rows } = await pool.query("SELECT login_email FROM blefe.players WHERE nickname_key = $1", [key]));
      } catch (error) {
        console.error("account-login-database-error", error.code || error.name);
        throw new Error("Não foi possível acessar a conta. Tente novamente.");
      }
      address = rows[0]?.login_email || "";
    }
    if (!address) throw new Error("Não foi possível acessar a conta. Confira os dados e a confirmação do e-mail.");
    const result = await authRequest("/auth/v1/token?grant_type=password", { email: address, password });
    if (typeof result.access_token !== "string") throw new Error("Não foi possível acessar a conta.");
    return { accessToken: result.access_token, player: await getSessionPlayer(result.access_token) };
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

  return { profile, getPlayer, getSessionPlayer, signup, login, recordWin, leaderboard, close: () => pool.end(), supabaseUrl, publicKey };
}
