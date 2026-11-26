(() => {
  "use strict";

  const onlineDialog = document.querySelector("#online-dialog");
  const onlineForm = document.querySelector("#online-form");
  const nicknameInput = document.querySelector("#nickname-input");
  const findMatchButton = document.querySelector("#find-match-button");
  const cancelMatchButton = document.querySelector("#cancel-match-button");
  const onlineStatus = document.querySelector("#online-status");
  const connectionDialog = document.querySelector("#connection-dialog");
  const connectionLog = document.querySelector("#connection-log");
  const connectionStatusButton = document.querySelector("#connection-log-button");
  const leaveGameButton = document.querySelector("#leave-game-button");
  const onlinePlayerCount = document.querySelector("#online-player-count");
  const chatOpenButton = document.querySelector("#chat-open-button");
  const chatDialog = document.querySelector("#chat-dialog");
  const chatTitle = document.querySelector("#chat-title");
  const chatMessages = document.querySelector("#chat-messages");
  const chatForm = document.querySelector("#chat-form");
  const chatInput = document.querySelector("#chat-input");
  const chatSendButton = document.querySelector("#chat-send-button");
  const chatStatus = document.querySelector("#chat-status");

  let signalingSocket = null;
  let peerConnection = null;
  let dataChannel = null;
  let activeNickname = "";
  let opponentNickname = "";
  let peerRole = null;
  let queueing = false;
  let intentionallyLeaving = false;
  let roomId = "";
  let lastRemotePhase = "";

  async function updateOnlinePlayerCount() {
    try {
      const response = await fetch("/health", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const status = await response.json();
      if (!Number.isSafeInteger(status.playersOnline) || status.playersOnline < 0) {
        throw new Error("Contagem de jogadores inválida");
      }
      onlinePlayerCount.textContent = `${status.playersOnline} jogando`;
      onlinePlayerCount.title = `${status.playersOnline} jogador(es) em partidas online`;
    } catch {
      onlinePlayerCount.textContent = "indisponível";
      onlinePlayerCount.title = "Não foi possível consultar os jogadores online.";
    }
  }

  function setChatAvailability(available) {
    chatOpenButton.hidden = !available;
    chatInput.disabled = !available;
    chatSendButton.disabled = !available;
    if (!available && chatDialog.open) chatDialog.close();
  }

  function clearChat() {
    chatMessages.replaceChildren();
    chatTitle.textContent = "Conversa";
    chatStatus.textContent = "O chat estará disponível quando a conexão P2P estiver ativa.";
    setChatAvailability(false);
  }

  function appendChatMessage(nickname, text, ownMessage) {
    const item = document.createElement("li");
    item.className = ownMessage ? "chat-message chat-message-own" : "chat-message";
    const author = document.createElement("span");
    author.className = "chat-author";
    author.textContent = `${nickname} · ${new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
    const content = document.createElement("p");
    content.textContent = text;
    item.append(author, content);
    chatMessages.append(item);
    while (chatMessages.children.length > 100) chatMessages.firstElementChild.remove();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function logConnection(message) {
    const item = document.createElement("li");
    const time = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    item.textContent = `${time} · ${message}`;
    connectionLog.append(item);
    while (connectionLog.children.length > 120) connectionLog.firstElementChild.remove();
    connectionLog.scrollTop = connectionLog.scrollHeight;
    connectionStatusButton.hidden = false;
  }

  function setStatus(message) {
    onlineStatus.textContent = message;
  }

  function setTopbarStatus(message) {
    connectionStatusButton.textContent = `Logs · ${message}`;
    connectionStatusButton.hidden = false;
  }

  function setQueueControls(searching) {
    queueing = searching;
    findMatchButton.hidden = searching;
    cancelMatchButton.hidden = !searching;
    cancelMatchButton.textContent = searching ? "Cancelar busca" : "Cancelar conexão";
    nicknameInput.disabled = searching;
  }

  function sendSignal(signal) {
    if (!signalingSocket || signalingSocket.readyState !== WebSocket.OPEN) {
      logConnection("Sinalização indisponível; não foi possível enviar a negociação P2P.");
      return;
    }
    signalingSocket.send(JSON.stringify({ type: "signal", signal }));
  }

  function sendData(payload) {
    if (!dataChannel || dataChannel.readyState !== "open") {
      logConnection("Canal P2P fechado; a ação não foi enviada.");
      setStatus("A conexão direta foi interrompida.");
      return false;
    }
    if (dataChannel.bufferedAmount > 512 * 1024) {
      logConnection("Fila P2P cheia; a mensagem foi recusada.");
      setStatus("A conexão está lenta; tente novamente em instantes.");
      return false;
    }
    try {
      const serialized = JSON.stringify(payload);
      if (serialized.length > 64 * 1024) {
        logConnection("Mensagem P2P excedeu o limite de tamanho.");
        return false;
      }
      dataChannel.send(serialized);
      return true;
    } catch (error) {
      logConnection(`Falha ao enviar pelo canal P2P: ${error.message}`);
      setStatus("Não foi possível enviar a ação pela conexão direta.");
      return false;
    }
  }

  function makeGameSession() {
    return { send: sendData };
  }

  function attachDataChannel(channel) {
    dataChannel = channel;
    channel.onopen = () => {
      logConnection("Canal de dados P2P aberto; a partida não depende do servidor de sinalização.");
      setStatus("Conexão direta estabelecida. Iniciando partida...");
      setTopbarStatus("P2P conectado");
      clearChat();
      chatTitle.textContent = `Com ${opponentNickname}`;
      chatStatus.textContent = `Conectado diretamente com ${opponentNickname}.`;
      setChatAvailability(true);
      const session = makeGameSession();
      const names = { local: activeNickname, remote: opponentNickname };
      if (peerRole === "host") window.BlefeGame.startOnlineHost(session, names);
      else window.BlefeGame.waitForOnlineGame(session, names);
      onlineDialog.close();
    };
    channel.onclose = () => {
      logConnection("Canal de dados P2P fechado.");
      setChatAvailability(false);
      chatStatus.textContent = "Chat indisponível: a conexão com o adversário foi encerrada.";
      setTopbarStatus("desconectado");
      setStatus("A conexão com o adversário foi encerrada.");
    };
    channel.onerror = () => {
      logConnection("O canal de dados P2P reportou um erro.");
      setStatus("Ocorreu um erro na conexão direta.");
    };
    channel.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > 64 * 1024) {
        logConnection("Mensagem P2P inválida ou acima do limite de tamanho.");
        return;
      }
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        logConnection("Mensagem inválida recebida pelo canal P2P.");
        return;
      }

      if (message.kind === "chat-message") {
        if (
          typeof message.text !== "string"
          || message.text.length > 500
          || !message.text.trim()
          || /[\u0000-\u001f\u007f]/.test(message.text)
        ) {
          logConnection("Mensagem de chat inválida recebida; ignorada.");
          return;
        }
        appendChatMessage(opponentNickname, message.text.trim(), false);
      } else if (message.kind === "game-state" && peerRole === "guest") {
        if (message.snapshot && message.snapshot.phase !== lastRemotePhase) {
          lastRemotePhase = message.snapshot.phase;
          logConnection(`Estado da partida atualizado: ${lastRemotePhase}.`);
        }
        if (!window.BlefeGame.applyOnlineSnapshot(message.snapshot)) {
          logConnection("Estado de partida inválido recebido; ignorado.");
        }
      } else if (message.kind === "game-action" && peerRole === "host") {
        logConnection(`Ação recebida do adversário: ${message.action}.`);
        window.BlefeGame.receiveOnlineAction(message);
      } else {
        logConnection("Mensagem P2P desconhecida ignorada.");
      }
    };
  }

  function createPeerConnection() {
    if (!window.RTCPeerConnection) {
      setStatus("Este navegador não oferece suporte a WebRTC.");
      logConnection("WebRTC indisponível neste navegador.");
      return null;
    }

    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    const connection = peerConnection;
    let remoteDescriptionReady = false;
    const pendingCandidates = [];

    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ type: "candidate", candidate: event.candidate.toJSON() });
    };
    connection.onicecandidateerror = (event) => {
      logConnection(`ICE não encontrou rota (${event.errorCode || "erro de rede"}).`);
    };
    connection.onconnectionstatechange = () => {
      logConnection(`WebRTC: ${connection.connectionState}.`);
      setTopbarStatus(connection.connectionState);
      if (connection.connectionState === "failed") {
        setStatus("A conexão direta falhou. Esta rede pode exigir um servidor TURN.");
      } else if (connection.connectionState === "connected") {
        setStatus("Conexão P2P estabelecida.");
      } else if (connection.connectionState === "disconnected") {
        setStatus("Conexão P2P instável; aguardando reconexão.");
      }
    };
    connection.oniceconnectionstatechange = () => {
      logConnection(`ICE: ${connection.iceConnectionState}.`);
    };
    connection.ondatachannel = (event) => {
      if (peerRole === "guest") attachDataChannel(event.channel);
    };

    if (peerRole === "host") {
      attachDataChannel(connection.createDataChannel("blefe-game", { ordered: true }));
    }

    async function applySignal(signal) {
      if (!signal || peerConnection !== connection) return;
      try {
        if (signal.type === "offer" && peerRole === "guest") {
          await connection.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          remoteDescriptionReady = true;
          for (const candidate of pendingCandidates.splice(0)) await connection.addIceCandidate(candidate);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          sendSignal({ type: "answer", sdp: connection.localDescription.sdp });
          logConnection("Oferta recebida e resposta SDP enviada.");
        } else if (signal.type === "answer" && peerRole === "host") {
          await connection.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          remoteDescriptionReady = true;
          for (const candidate of pendingCandidates.splice(0)) await connection.addIceCandidate(candidate);
          logConnection("Resposta SDP recebida.");
        } else if (signal.type === "candidate" && signal.candidate) {
          if (remoteDescriptionReady) await connection.addIceCandidate(signal.candidate);
          else pendingCandidates.push(signal.candidate);
        }
      } catch (error) {
        logConnection(`Falha na negociação WebRTC: ${error.message}`);
        setStatus("A negociação P2P falhou. Consulte o log de conexão.");
      }
    }

    connection.applySignal = applySignal;
    return connection;
  }

  async function createOffer() {
    if (!peerConnection || peerRole !== "host") return;
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      sendSignal({ type: "offer", sdp: peerConnection.localDescription.sdp });
      logConnection("Oferta SDP criada e enviada ao outro jogador.");
    } catch (error) {
      logConnection(`Não foi possível criar a oferta WebRTC: ${error.message}`);
      setStatus("Falha ao iniciar a conexão P2P.");
    }
  }

  function sendQueueRequest() {
    if (!signalingSocket || signalingSocket.readyState !== WebSocket.OPEN) return;
    signalingSocket.send(JSON.stringify({ type: "queue", nickname: activeNickname }));
  }

  function handleMatched(message) {
    peerRole = message.role;
    roomId = message.roomId;
    opponentNickname = message.opponentNickname;
    logConnection(`Sala ${roomId.slice(0, 8)} criada. Papel: ${peerRole === "host" ? "anfitrião" : "convidado"}.`);
    logConnection(`Adversário encontrado: ${opponentNickname}.`);
    setStatus("Jogador encontrado. Negociando a conexão direta...");
    setTopbarStatus("negociando P2P");
    cancelMatchButton.textContent = "Cancelar conexão";
    if (!createPeerConnection()) {
      if (signalingSocket) signalingSocket.close();
      setQueueControls(false);
      return;
    }
    if (peerRole === "host") createOffer();
  }

  function handleSocketMessage(message) {
    if (message.type === "waiting") {
      setStatus("Sala criada. Você é o anfitrião; aguardando outro jogador...");
      setTopbarStatus("aguardando jogador");
      logConnection("Sala de espera criada; aguardando um adversário.");
    } else if (message.type === "matched") {
      handleMatched(message);
    } else if (message.type === "signal") {
      if (!peerConnection) {
        logConnection("Sinal recebido antes da conexão WebRTC; ignorado.");
        return;
      }
      peerConnection.applySignal(message.signal);
    } else if (message.type === "peer-left") {
      logConnection(`${message.nickname} saiu da sala.`);
      closePeerConnection();
      setQueueControls(false);
      setStatus("O adversário saiu. Você pode buscar outra partida.");
      setTopbarStatus("adversário saiu");
      if (!onlineDialog.open) onlineDialog.showModal();
    } else if (message.type === "queue-cancelled") {
      logConnection("Busca de partida cancelada.");
      setQueueControls(false);
      setStatus("Busca cancelada.");
    } else if (message.type === "error") {
      logConnection(`Servidor: ${message.message}`);
      setStatus(message.message);
    }
  }

  function openSignalingSocket() {
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      setStatus("Abra o jogo pelo endereço do Render ou por um servidor local para jogar online.");
      logConnection("A partida online precisa de uma página HTTP/HTTPS; file:// não permite sinalização.");
      setQueueControls(false);
      return;
    }
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    intentionallyLeaving = false;
    setStatus("Conectando ao serviço de salas...");
    setTopbarStatus("conectando");
    logConnection("Abrindo WebSocket com o serviço de matchmaking.");
    signalingSocket = new WebSocket(`${protocol}//${location.host}/matchmaking`);

    signalingSocket.addEventListener("open", () => {
      logConnection("WebSocket de sinalização conectado.");
      sendQueueRequest();
    });
    signalingSocket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        logConnection("Resposta inválida do servidor de salas.");
        return;
      }
      handleSocketMessage(message);
    });
    signalingSocket.addEventListener("error", () => {
      logConnection("Erro na conexão com o servidor de salas.");
      setStatus("Não foi possível conectar ao servidor de salas.");
      setTopbarStatus("erro no servidor");
    });
    signalingSocket.addEventListener("close", () => {
      logConnection("Conexão com o servidor de sinalização encerrada.");
      if (intentionallyLeaving) return;
      if (!dataChannel || dataChannel.readyState !== "open") {
        setQueueControls(false);
        setStatus("Servidor de salas desconectado. Tente novamente.");
        setTopbarStatus("sinalização offline");
      } else {
        setTopbarStatus("P2P ativo");
      }
    });
  }

  function closePeerConnection() {
    setChatAvailability(false);
    chatStatus.textContent = "Chat indisponível: a partida não está conectada.";
    if (dataChannel) {
      dataChannel.onopen = null;
      dataChannel.onclose = null;
      dataChannel.onmessage = null;
      dataChannel.onerror = null;
      dataChannel.close();
      dataChannel = null;
    }
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onicecandidateerror = null;
      peerConnection.ondatachannel = null;
      peerConnection.close();
      peerConnection = null;
    }
    peerRole = null;
    roomId = "";
    lastRemotePhase = "";
  }

  function leaveSession() {
    intentionallyLeaving = true;
    if (signalingSocket) {
      if (queueing && !roomId && signalingSocket.readyState === WebSocket.OPEN) {
        signalingSocket.send(JSON.stringify({ type: "cancel-queue" }));
      }
      if (signalingSocket.readyState < WebSocket.CLOSING) signalingSocket.close();
    }
    signalingSocket = null;
    closePeerConnection();
    clearChat();
    queueing = false;
    activeNickname = "";
    opponentNickname = "";
    setQueueControls(false);
    setTopbarStatus("offline");
  }

  function cancelMatchSearch() {
    intentionallyLeaving = true;
    if (signalingSocket) {
      if (queueing && !roomId && signalingSocket.readyState === WebSocket.OPEN) {
        signalingSocket.send(JSON.stringify({ type: "cancel-queue" }));
      }
      if (signalingSocket.readyState < WebSocket.CLOSING) signalingSocket.close();
    }
    signalingSocket = null;
    closePeerConnection();
    clearChat();
    setQueueControls(false);
    setStatus("Busca cancelada.");
    setTopbarStatus("offline");
  }

  document.querySelector("#online-button").addEventListener("click", () => {
    setStatus("A conexão usa o servidor de sinalização do jogo e WebRTC P2P.");
    onlineDialog.showModal();
    nicknameInput.focus();
  });
  document.querySelector("#offline-button").addEventListener("click", () => {
    leaveSession();
    window.BlefeGame.startOffline();
  });
  document.querySelector("#menu-rules-button").addEventListener("click", () => {
    document.querySelector("#rules-dialog").showModal();
  });
  document.querySelector("#close-online").addEventListener("click", () => {
    if (queueing) cancelMatchSearch();
    onlineDialog.close();
  });
  document.querySelector("#close-connection-log").addEventListener("click", () => connectionDialog.close());
  document.querySelector("#close-chat").addEventListener("click", () => chatDialog.close());
  chatOpenButton.addEventListener("click", () => {
    chatDialog.showModal();
    chatInput.focus();
  });
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput.value.trim().replace(/\s+/g, " ");
    if (!text) return;
    if (text.length > 500) {
      chatStatus.textContent = "A mensagem não pode passar de 500 caracteres.";
      return;
    }
    if (sendData({ kind: "chat-message", text })) {
      appendChatMessage(activeNickname, text, true);
      chatInput.value = "";
      chatStatus.textContent = `Conectado diretamente com ${opponentNickname}.`;
    } else {
      chatStatus.textContent = "Não foi possível enviar. Verifique a conexão P2P.";
    }
  });
  connectionStatusButton.addEventListener("click", () => connectionDialog.showModal());
  leaveGameButton.addEventListener("click", () => {
    logConnection("Jogador saiu da partida.");
    leaveSession();
    onlineDialog.close();
    connectionDialog.close();
    chatDialog.close();
    window.BlefeGame.leaveToMenu();
  });
  cancelMatchButton.addEventListener("click", cancelMatchSearch);

  onlineForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const nickname = nicknameInput.value.trim().replace(/\s+/g, " ");
    if (nickname.length < 2 || nickname.length > 18 || /[\u0000-\u001f\u007f]/.test(nickname)) {
      setStatus("Use um nickname de 2 a 18 caracteres.");
      return;
    }
    if (signalingSocket) leaveSession();
    activeNickname = nickname;
    setQueueControls(true);
    logConnection(`Busca iniciada para ${activeNickname}.`);
    openSignalingSocket();
  });

  updateOnlinePlayerCount();
  window.setInterval(updateOnlinePlayerCount, 15_000);

  window.BlefeOnline = Object.freeze({
    leaveSession,
    logConnection
  });
})();
