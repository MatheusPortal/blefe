(() => {
  "use strict";

  const onlineDialog = document.querySelector("#online-dialog");
  const onlineForm = document.querySelector("#online-form");
  const nicknameInput = document.querySelector("#nickname-input");
  const roomNameInput = document.querySelector("#room-name-input");
  const createRoomButton = document.querySelector("#find-match-button");
  const refreshRoomsButton = document.querySelector("#refresh-rooms-button");
  const startRoomButton = document.querySelector("#start-room-button");
  const leaveRoomButton = document.querySelector("#cancel-match-button");
  const roomList = document.querySelector("#room-list");
  const onlineStatus = document.querySelector("#online-status");
  const connectionDialog = document.querySelector("#connection-dialog");
  const connectionLog = document.querySelector("#connection-log");
  const connectionStatusButton = document.querySelector("#connection-log-button");
  const leaveGameButton = document.querySelector("#leave-game-button");
  const onlinePlayerCount = document.querySelector("#online-player-count");
  const chatWidget = document.querySelector("#game-chat-widget");
  const chatPanel = document.querySelector("#game-chat-panel");
  const chatToggleButton = document.querySelector("#chat-toggle-button");
  const chatPeerName = document.querySelector("#chat-peer-name");
  const chatMessages = document.querySelector("#chat-messages");
  const chatForm = document.querySelector("#chat-form");
  const chatInput = document.querySelector("#chat-input");
  const chatSendButton = document.querySelector("#chat-send-button");
  const mobileChatQuery = window.matchMedia("(max-width: 650px)");

  let socket = null;
  let activeRoom = null;
  let activeNickname = "";
  let publicId = null;
  const pendingMessages = [];

  async function updateOnlinePlayerCount() {
    try {
      const response = await fetch("/health", { cache: "no-store" });
      const status = await response.json();
      onlinePlayerCount.textContent = `${status.playersOnline || 0} online`;
      onlinePlayerCount.title = "Jogadores conectados às salas";
    } catch {
      onlinePlayerCount.textContent = "indisponível";
    }
  }

  function send(type, payload = {}) {
    const message = JSON.stringify({ type, ...payload });
    if (socket?.readyState === WebSocket.CONNECTING) {
      pendingMessages.push(message);
      setStatus("Conectando às salas...");
      return true;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("Conexão com as salas indisponível.");
      return false;
    }
    socket.send(message);
    return true;
  }

  function setStatus(message) {
    onlineStatus.textContent = message;
  }

  function logConnection(message) {
    const item = document.createElement("li");
    item.textContent = `${new Date().toLocaleTimeString("pt-BR")} · ${message}`;
    connectionLog.append(item);
    while (connectionLog.children.length > 120) connectionLog.firstElementChild.remove();
    connectionStatusButton.hidden = false;
  }

  function setTopbarStatus(message) {
    connectionStatusButton.textContent = `Salas · ${message}`;
    connectionStatusButton.hidden = false;
  }

  function setChatAvailability(available, allowMessages = true, title = "Chat da sala") {
    chatPanel.hidden = !available;
    chatWidget.hidden = !available;
    chatForm.hidden = !allowMessages;
    chatInput.hidden = !allowMessages;
    chatSendButton.hidden = !allowMessages;
    chatInput.disabled = !available || !allowMessages;
    chatSendButton.disabled = !available || !allowMessages;
    chatPanel.querySelector("h2").textContent = title;
    chatPanel.setAttribute("aria-label", title);
    setChatMinimized(available && mobileChatQuery.matches);
  }

  function showOfflineLog() {
    clearChat();
    chatPeerName.textContent = "contra a IA";
    setChatAvailability(true, false, "Log da partida");
  }

  function clearChat() {
    chatMessages.replaceChildren();
    chatPeerName.textContent = "Sala";
    setChatAvailability(false);
  }

  function setChatMinimized(minimized) {
    chatWidget.classList.toggle("is-minimized", minimized);
    chatToggleButton.setAttribute("aria-expanded", String(!minimized));
    chatToggleButton.setAttribute("aria-label", minimized ? "Expandir chat" : "Minimizar chat");
    chatToggleButton.title = minimized ? "Expandir chat" : "Minimizar chat";
    chatToggleButton.textContent = minimized ? "+" : "−";
  }

  function appendChatMessage(nickname, text, ownMessage = false) {
    const item = document.createElement("li");
    item.className = nickname === "Sistema"
      ? "chat-message chat-system-message"
      : ownMessage ? "chat-message chat-message-own" : "chat-message";
    const author = document.createElement("span");
    author.className = "chat-author";
    author.textContent = nickname === "Sistema" ? "Sistema:" : nickname;
    const content = document.createElement("p");
    content.textContent = text;
    item.append(author, content);
    chatMessages.append(item);
    while (chatMessages.children.length > 100) chatMessages.firstElementChild.remove();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function logGameEvent(message) {
    if (chatPanel.hidden) return;
    if (typeof message === "string") appendChatMessage("Sistema", message);
    else if (message?.kind === "system") appendChatMessage("Sistema", message.text);
  }

  function renderRooms(rooms) {
    roomList.replaceChildren();
    if (!rooms.length) {
      const empty = document.createElement("p");
      empty.className = "room-list-empty";
      empty.textContent = "Nenhuma sala disponível.";
      roomList.append(empty);
      return;
    }
    for (const room of rooms) {
      const row = document.createElement("article");
      row.className = "room-list-item";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = room.name;
      const count = document.createElement("span");
      count.textContent = `${room.playerCount}/${room.maxPlayers} jogadores`;
      info.append(title, count);
      const join = document.createElement("button");
      join.className = "secondary-button";
      join.type = "button";
      join.textContent = "Entrar";
      join.addEventListener("click", () => joinRoom(room.id));
      row.append(info, join);
      roomList.append(row);
    }
  }

  function updateLobby(room) {
    activeRoom = room;
    const players = room.players || [];
    const host = room.hostId === publicId;
    createRoomButton.hidden = true;
    roomNameInput.disabled = true;
    nicknameInput.disabled = true;
    leaveRoomButton.hidden = false;
    startRoomButton.hidden = !host;
    startRoomButton.disabled = players.length < 2 || players.length > 4;
    setStatus(`${room.name} · ${players.map((player) => player.nickname).join(", ")} · ${players.length}/4`);
    logConnection(`Sala ${room.name}: ${players.length} jogador(es).`);
  }

  function joinRoom(roomId) {
    activeNickname = nicknameInput.value.trim().replace(/\s+/g, " ");
    if (activeNickname.length < 2 || activeNickname.length > 18) {
      setStatus("Informe seu nickname antes de entrar.");
      nicknameInput.focus();
      return;
    }
    send("join-room", { roomId, nickname: activeNickname });
  }

  function openSocket() {
    if (socket?.readyState === WebSocket.OPEN) {
      send("list-rooms");
      return;
    }
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/matchmaking`);
    socket.addEventListener("open", () => {
      setTopbarStatus("conectado");
      for (const message of pendingMessages.splice(0)) socket.send(message);
      send("list-rooms");
    });
    socket.addEventListener("message", (event) => handleServerMessage(JSON.parse(event.data)));
    socket.addEventListener("close", () => {
      setTopbarStatus("desconectado");
      if (!activeRoom) setStatus("Conexão das salas encerrada.");
    });
    socket.addEventListener("error", () => setStatus("Não foi possível conectar às salas."));
  }

  function handleServerMessage(message) {
    if (message.type === "room-list") renderRooms(message.rooms);
    else if (message.type === "room-created" || message.type === "room-joined") {
      publicId = message.publicId || publicId;
      updateLobby(message.room);
    } else if (message.type === "lobby-update") {
      updateLobby(message.room);
    } else if (message.type === "room-started") {
      clearChat();
      chatPeerName.textContent = `${message.players.length} jogadores`;
      setChatAvailability(true);
      onlineDialog.close();
      setTopbarStatus("em partida");
      window.BlefeGame.startOnlineRoom({
        sendAction: (payload) => send("room-action", { payload }),
        sendChat: (text) => send("chat-room", { text })
      });
    } else if (message.type === "game-state") {
      publicId = message.state.you;
      window.BlefeGame.applyRoomSnapshot(message.state);
    } else if (message.type === "room-chat") {
      appendChatMessage(message.from.nickname, message.text, message.from.id === publicId);
    } else if (message.type === "game-over") {
      setStatus(message.winner ? `${message.winner.nickname} venceu a sala.` : "A sala terminou.");
    } else if (message.type === "error") {
      setStatus(message.message);
      logConnection(message.message);
    }
  }

  function leaveRoom() {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "leave-room" }));
    activeRoom = null;
    publicId = null;
    createRoomButton.hidden = false;
    nicknameInput.disabled = false;
    roomNameInput.disabled = false;
    leaveRoomButton.hidden = true;
    startRoomButton.hidden = true;
    window.BlefeGame.leaveToMenu();
    clearChat();
  }

  document.querySelector("#online-button").addEventListener("click", () => {
    onlineDialog.showModal();
    openSocket();
    nicknameInput.focus();
  });
  document.querySelector("#offline-button").addEventListener("click", () => {
    leaveRoom();
    window.BlefeGame.startOffline();
  });
  document.querySelector("#menu-rules-button").addEventListener("click", () => document.querySelector("#rules-dialog").showModal());
  document.querySelector("#close-online").addEventListener("click", () => onlineDialog.close());
  document.querySelector("#close-connection-log").addEventListener("click", () => connectionDialog.close());
  connectionStatusButton.addEventListener("click", () => connectionDialog.showModal());
  refreshRoomsButton.addEventListener("click", () => send("list-rooms"));
  startRoomButton.addEventListener("click", () => send("start-room"));
  leaveRoomButton.addEventListener("click", leaveRoom);
  leaveGameButton.addEventListener("click", leaveRoom);

  onlineForm.addEventListener("submit", (event) => {
    event.preventDefault();
    activeNickname = nicknameInput.value.trim().replace(/\s+/g, " ");
    const roomName = roomNameInput.value.trim().replace(/\s+/g, " ");
    if (activeNickname.length < 2 || roomName.length < 2) {
      setStatus("Informe nickname e nome da sala.");
      return;
    }
    send("create-room", { nickname: activeNickname, roomName });
  });

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    send("chat-room", { text });
    chatInput.value = "";
  });
  chatInput.addEventListener("input", () => chatInput.setCustomValidity(""));
  chatInput.addEventListener("focus", () => chatWidget.classList.add("is-chat-focused"));
  chatForm.addEventListener("focusout", (event) => {
    if (!chatForm.contains(event.relatedTarget)) chatWidget.classList.remove("is-chat-focused");
  });
  chatToggleButton.addEventListener("click", () => setChatMinimized(!chatWidget.classList.contains("is-minimized")));
  mobileChatQuery.addEventListener("change", (event) => {
    if (event.matches && !chatWidget.hidden) setChatMinimized(true);
  });

  updateOnlinePlayerCount();
  window.setInterval(updateOnlinePlayerCount, 15_000);
  window.BlefeOnline = Object.freeze({ leaveSession: leaveRoom, logConnection, logGameEvent, showOfflineLog });
})();
