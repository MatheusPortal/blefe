(() => {
  "use strict";

  const rankDialog = document.querySelector("#rank-dialog");
  const accountDialog = document.querySelector("#account-dialog");
  const rankList = document.querySelector("#ranking-list");
  const rankStatus = document.querySelector("#ranking-status");
  const accountStatus = document.querySelector("#account-status");
  const form = document.querySelector("#account-form");
  const nickname = document.querySelector("#account-nickname");
  const email = document.querySelector("#account-email");
  const password = document.querySelector("#account-password");
  const signout = document.querySelector("#signout-button");
  let token = "";
  let player = null;
  let config = null;

  async function json(response) {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error_description || body.msg || body.error || `HTTP ${response.status}`);
    return body;
  }

  async function getConfig() {
    if (!config) config = await json(await fetch("/api/ranking/config", { cache: "no-store" }));
    return config;
  }

  async function loadRanking() {
    rankList.replaceChildren();
    rankStatus.textContent = "Carregando ranking...";
    try {
      const { players } = await json(await fetch("/api/ranking", { cache: "no-store" }));
      if (!players.length) rankStatus.textContent = "Nenhuma vitória ranqueada ainda.";
      else {
        rankStatus.textContent = player ? `Conectado como ${player.nickname}.` : "Entre para disputar partidas ranqueadas.";
        players.forEach((entry) => {
          const item = document.createElement("li");
          const name = document.createElement("strong");
          const wins = document.createElement("span");
          name.textContent = entry.nickname;
          wins.textContent = `${entry.wins} ${entry.wins === 1 ? "vitória" : "vitórias"}`;
          item.append(name, wins);
          rankList.append(item);
        });
      }
    } catch (error) {
      rankStatus.textContent = `Ranking indisponível: ${error.message}`;
    }
  }

  async function accountRequest(signup) {
    if (!form.reportValidity()) return;
    accountStatus.textContent = signup ? "Criando conta..." : "Entrando...";
    try {
      const { url, publicKey } = await getConfig();
      const endpoint = signup ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
      const result = await json(await fetch(new URL(endpoint, url), {
        method: "POST",
        headers: { "content-type": "application/json", apikey: publicKey },
        body: JSON.stringify({ email: email.value.trim(), password: password.value })
      }));
      password.value = "";
      if (!result.access_token) {
        accountStatus.textContent = "Confira seu e-mail para confirmar a conta e depois entre.";
        return;
      }
      const profile = await json(await fetch("/api/ranking/profile", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${result.access_token}` },
        body: JSON.stringify({ nickname: nickname.value })
      }));
      token = result.access_token;
      player = profile.player;
      signout.hidden = false;
      accountStatus.textContent = "";
      accountDialog.close();
      if (rankDialog.open) loadRanking();
    } catch (error) {
      accountStatus.textContent = `Não foi possível acessar a conta: ${error.message}`;
    }
  }

  function requireAccount() {
    if (token) return token;
    accountStatus.textContent = "Entre na conta para jogar partidas ranqueadas.";
    accountDialog.showModal();
    return null;
  }

  document.querySelector("#rank-button").addEventListener("click", () => {
    rankDialog.showModal();
    loadRanking();
  });
  document.querySelector("#close-rank").addEventListener("click", () => rankDialog.close());
  document.querySelector("#account-button").addEventListener("click", () => accountDialog.showModal());
  document.querySelector("#close-account").addEventListener("click", () => accountDialog.close());
  document.querySelector("#signup-button").addEventListener("click", () => accountRequest(true));
  form.addEventListener("submit", (event) => { event.preventDefault(); accountRequest(false); });
  signout.addEventListener("click", () => {
    token = "";
    player = null;
    signout.hidden = true;
    loadRanking();
  });
  window.BlefeRanking = Object.freeze({ requireAccount, getPlayer: () => player });
})();
