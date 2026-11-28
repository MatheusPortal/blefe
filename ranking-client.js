(() => {
  "use strict";

  const rankDialog = document.querySelector("#rank-dialog");
  const accountDialog = document.querySelector("#account-dialog");
  const avatarDialog = document.querySelector("#avatar-dialog");
  const entryScreen = document.querySelector("#entry-screen");
  const mainMenu = document.querySelector("#main-menu");
  const rankList = document.querySelector("#ranking-list");
  const rankStatus = document.querySelector("#ranking-status");
  const accountStatus = document.querySelector("#account-status");
  const avatarStatus = document.querySelector("#avatar-status");
  const form = document.querySelector("#account-form");
  const identifier = document.querySelector("#account-identifier");
  const nickname = document.querySelector("#account-nickname");
  const email = document.querySelector("#account-email");
  const password = document.querySelector("#account-password");
  const signout = document.querySelector("#signout-button");
  const avatarGrid = document.querySelector("#avatar-grid");
  const saveAvatar = document.querySelector("#save-avatar");
  const closeAvatar = document.querySelector("#close-avatar");
  const closeAccount = document.querySelector("#close-account");
  const signupButton = document.querySelector("#signup-button");
  const avatarOptions = [];
  let token = "";
  let pendingToken = "";
  let player = null;
  let identity = null;
  let avatar = 1;
  let selectedAvatar = 1;
  let accountMode = "login";
  let accountPending = false;

  async function json(response) {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error_description || body.msg || body.error || `HTTP ${response.status}`);
    return body;
  }

  function showIdentity() {
    const currentAvatar = identity?.avatar || avatar;
    window.BlefeAvatars.render(document.querySelector("#entry-avatar-button"), currentAvatar);
    window.BlefeAvatars.render(document.querySelector("#profile-avatar"), currentAvatar);
    window.BlefeAvatars.render(document.querySelector("#online-profile-avatar"), currentAvatar);
    document.querySelector("#profile-name").textContent = identity?.nickname || "";
    document.querySelector("#online-profile-name").textContent = identity?.nickname || "";
  }

  function showMenu() {
    entryScreen.hidden = true;
    mainMenu.hidden = false;
    showIdentity();
  }

  function resetIdentity() {
    token = "";
    pendingToken = "";
    player = null;
    identity = null;
    signout.hidden = true;
    mainMenu.hidden = true;
    entryScreen.hidden = false;
    showIdentity();
    document.querySelector("#nickname-input").focus();
  }

  function setAccountMode(mode) {
    accountMode = mode;
    const login = mode === "login";
    const profile = mode === "profile";
    document.querySelector("#account-login-fields").hidden = !login;
    document.querySelector("#account-signup-fields").hidden = login;
    email.hidden = profile;
    document.querySelector('label[for="account-email"]').hidden = profile;
    document.querySelector("#account-password-fields").hidden = profile;
    identifier.required = login;
    nickname.required = !login;
    email.required = mode === "signup";
    password.required = !profile;
    password.autocomplete = mode === "signup" ? "new-password" : "current-password";
    document.querySelector("#account-title").textContent = login ? "Entrar na conta" : profile ? "Complete seu perfil" : "Criar conta";
    document.querySelector("#account-submit").textContent = login ? "Entrar" : profile ? "Salvar perfil" : "Criar conta";
    document.querySelector("#signup-button").textContent = login ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar";
  }

  function openAccount(message = "", mode = "login") {
    pendingToken = "";
    setAccountMode(mode);
    accountStatus.textContent = message;
    accountDialog.showModal();
    (mode === "signup" ? nickname : identifier).focus();
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

  function finishAccount(accessToken, account) {
    token = accessToken;
    pendingToken = "";
    player = account;
    identity = { nickname: account.nickname, avatar: account.avatar };
    avatar = account.avatar;
    signout.hidden = false;
    accountStatus.textContent = "";
    accountDialog.close();
    if (!entryScreen.hidden) showMenu();
    else showIdentity();
    if (rankDialog.open) loadRanking();
  }

  async function accountRequest() {
    if (!form.reportValidity()) return;
    accountStatus.textContent = accountMode === "login" ? "Entrando..." : "Salvando...";
    const submit = document.querySelector("#account-submit");
    accountPending = true;
    submit.disabled = true;
    closeAccount.disabled = true;
    signupButton.disabled = true;
    try {
      if (accountMode === "profile") {
        const result = await json(await fetch("/api/ranking/profile", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${pendingToken}` },
          body: JSON.stringify({ nickname: nickname.value, avatar })
        }));
        finishAccount(pendingToken, result.player);
        return;
      }
      const signup = accountMode === "signup";
      const payload = signup
        ? { nickname: nickname.value, email: email.value.trim(), password: password.value, avatar }
        : { identifier: identifier.value.trim(), password: password.value };
      const result = await json(await fetch(signup ? "/api/account/signup" : "/api/account/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }));
      password.value = "";
      if (result.confirmationRequired) {
        identifier.value = nickname.value;
        setAccountMode("login");
        accountStatus.textContent = "Confira seu e-mail e abra o link para confirmar e entrar. Seu nickname fica reservado por 7 dias.";
      } else if (result.player) {
        finishAccount(result.accessToken, result.player);
      } else {
        pendingToken = result.accessToken;
        setAccountMode("profile");
        accountStatus.textContent = "Escolha um nickname para concluir seu perfil.";
        nickname.focus();
      }
    } catch (error) {
      accountStatus.textContent = `Não foi possível acessar a conta: ${error.message}`;
    } finally {
      accountPending = false;
      submit.disabled = false;
      closeAccount.disabled = false;
      signupButton.disabled = false;
    }
  }

  function requireAccount() {
    if (token) return token;
    openAccount("Entre na conta para jogar partidas ranqueadas.");
    return null;
  }

  function selectAvatar(id, focus = false) {
    selectedAvatar = id;
    avatarOptions.forEach((button, index) => {
      const selected = index + 1 === id;
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (focus) avatarOptions[id - 1].focus();
  }

  function openAvatar() {
    avatarStatus.textContent = "";
    selectAvatar(identity?.avatar || avatar);
    avatarDialog.showModal();
    avatarOptions[selectedAvatar - 1].focus();
  }

  for (let id = 1; id <= window.BlefeAvatars.count; id += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-option";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", window.BlefeAvatars.name(id));
    window.BlefeAvatars.render(button, id);
    button.addEventListener("click", () => selectAvatar(id));
    button.addEventListener("keydown", (event) => {
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (!delta && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const next = event.key === "Home" ? 1 : event.key === "End" ? avatarOptions.length
        : (selectedAvatar - 1 + delta + avatarOptions.length) % avatarOptions.length + 1;
      selectAvatar(next, true);
    });
    avatarOptions.push(button);
    avatarGrid.append(button);
  }

  document.querySelector("#entry-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#nickname-input");
    const name = input.value.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 18 || /[\u0000-\u001f\u007f]/.test(name)) {
      document.querySelector("#entry-status").textContent = "Informe um nickname válido de 2 a 18 caracteres.";
      input.focus();
      return;
    }
    identity = { nickname: name, avatar };
    document.querySelector("#entry-status").textContent = "";
    showMenu();
  });
  document.querySelector("#entry-account-button").addEventListener("click", () => openAccount());
  document.querySelector("#entry-signup-button").addEventListener("click", () => openAccount("", "signup"));
  document.querySelector("#entry-avatar-button").addEventListener("click", openAvatar);
  document.querySelector("#profile-button").addEventListener("click", openAvatar);
  document.querySelector("#online-profile-button").addEventListener("click", openAvatar);
  closeAvatar.addEventListener("click", () => avatarDialog.close());
  avatarDialog.addEventListener("cancel", (event) => {
    if (saveAvatar.disabled) event.preventDefault();
  });
  saveAvatar.addEventListener("click", async () => {
    saveAvatar.disabled = true;
    closeAvatar.disabled = true;
    try {
      if (player) {
        const result = await json(await fetch("/api/ranking/profile", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ nickname: player.nickname, avatar: selectedAvatar })
        }));
        player = result.player;
        identity = { nickname: player.nickname, avatar: player.avatar };
      }
      avatar = selectedAvatar;
      if (identity && !player) identity.avatar = avatar;
      showIdentity();
      avatarDialog.close();
    } catch (error) {
      avatarStatus.textContent = `Não foi possível salvar o avatar: ${error.message}`;
    } finally {
      saveAvatar.disabled = false;
      closeAvatar.disabled = false;
    }
  });
  document.querySelector("#change-identity-button").addEventListener("click", resetIdentity);
  document.querySelector("#rank-button").addEventListener("click", () => {
    rankDialog.showModal();
    loadRanking();
  });
  document.querySelector("#close-rank").addEventListener("click", () => rankDialog.close());
  document.querySelector("#account-button").addEventListener("click", () => openAccount());
  closeAccount.addEventListener("click", () => accountDialog.close());
  accountDialog.addEventListener("cancel", (event) => {
    if (accountPending) event.preventDefault();
  });
  accountDialog.addEventListener("close", () => {
    password.value = "";
    pendingToken = "";
  });
  signupButton.addEventListener("click", () => {
    setAccountMode(accountMode === "login" ? "signup" : "login");
    accountStatus.textContent = "";
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); accountRequest(); });
  signout.addEventListener("click", () => {
    rankDialog.close();
    resetIdentity();
  });
  showIdentity();
  window.BlefeProfile = Object.freeze({ get: () => identity, getToken: () => token });
  window.BlefeRanking = Object.freeze({ requireAccount, getPlayer: () => player });

  async function completeEmailConfirmation() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("type") !== "signup" && !params.has("error_code")) return;
    const accessToken = params.get("access_token");
    const failed = params.has("error") || !accessToken;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const status = document.querySelector("#entry-status");
    if (failed) {
      status.textContent = "Não foi possível confirmar o e-mail. O link pode ter expirado; tente entrar na conta.";
      return;
    }
    status.textContent = "Confirmando sua conta...";
    try {
      const result = await json(await fetch("/api/account/session", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` }
      }));
      status.textContent = "";
      if (result.player) {
        finishAccount(accessToken, result.player);
      } else {
        pendingToken = accessToken;
        setAccountMode("profile");
        accountStatus.textContent = "Escolha um nickname para concluir seu perfil.";
        accountDialog.showModal();
        nickname.focus();
      }
    } catch (error) {
      status.textContent = `Não foi possível entrar após a confirmação: ${error.message}`;
    }
  }
  if (window.location && window.history) completeEmailConfirmation();
})();
