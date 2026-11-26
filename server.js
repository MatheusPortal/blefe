import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 10000);
const waitingPeers = [];
const rooms = new Map();
const peers = new Map();
const socketPeers = new WeakMap();
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/online.js", ["online.js", "text/javascript; charset=utf-8"]]
]);

function logEvent(event, details = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...details }));
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function sendError(peer, message) {
  send(peer.socket, { type: "error", message });
}

function otherPeer(room, peer) {
  return room.host === peer ? room.guest : room.host;
}

function normalizeNickname(value) {
  if (typeof value !== "string") return null;
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 18 || /[\u0000-\u001f\u007f]/.test(nickname)) return null;
  return nickname;
}

function leaveQueue(peer) {
  const index = waitingPeers.indexOf(peer);
  if (index >= 0) waitingPeers.splice(index, 1);
  peer.queued = false;
}

function disconnectPeer(peer, reason) {
  if (!peers.has(peer.id)) return;
  leaveQueue(peer);
  peers.delete(peer.id);

  if (peer.room) {
    const room = peer.room;
    const opponent = otherPeer(room, peer);
    rooms.delete(room.id);
    peer.room = null;
    if (opponent) {
      opponent.room = null;
      send(opponent.socket, { type: "peer-left", nickname: peer.nickname || "O adversário" });
    }
    logEvent("room-closed", { roomId: room.id, role: peer.role, reason });
  }

  logEvent("peer-disconnected", { peerId: peer.id, reason });
}

function joinQueue(peer, requestedNickname) {
  if (peer.room || peer.queued) {
    sendError(peer, "Você já está em uma sala ou na fila.");
    return;
  }
  const nickname = normalizeNickname(requestedNickname);
  if (!nickname) {
    sendError(peer, "Use um nickname de 2 a 18 caracteres.");
    return;
  }
  peer.nickname = nickname;

  let host;
  while (waitingPeers.length && !host) {
    const candidateIndex = Math.floor(Math.random() * waitingPeers.length);
    const [candidate] = waitingPeers.splice(candidateIndex, 1);
    candidate.queued = false;
    if (candidate.socket.readyState === WebSocket.OPEN && !candidate.room) host = candidate;
  }

  if (!host) {
    peer.queued = true;
    peer.role = "host";
    waitingPeers.push(peer);
    send(peer.socket, { type: "waiting" });
    logEvent("peer-waiting", { peerId: peer.id });
    return;
  }

  const room = {
    id: randomUUID(),
    host,
    guest: peer,
    createdAt: Date.now()
  };
  host.room = room;
  host.role = "host";
  peer.room = room;
  peer.role = "guest";
  rooms.set(room.id, room);

  send(host.socket, { type: "matched", roomId: room.id, role: "host", opponentNickname: peer.nickname });
  send(peer.socket, { type: "matched", roomId: room.id, role: "guest", opponentNickname: host.nickname });
  logEvent("room-matched", { roomId: room.id });
}

function validSignal(signal) {
  if (!signal || typeof signal !== "object") return false;
  if (signal.type === "offer" || signal.type === "answer") {
    return typeof signal.sdp === "string" && signal.sdp.length <= 48_000;
  }
  if (signal.type === "candidate") {
    const candidate = signal.candidate;
    return candidate === null || (
      candidate
      && typeof candidate === "object"
      && typeof candidate.candidate === "string"
      && candidate.candidate.length <= 2_048
      && (candidate.sdpMid === undefined || candidate.sdpMid === null || typeof candidate.sdpMid === "string")
      && (candidate.sdpMLineIndex === undefined || candidate.sdpMLineIndex === null || Number.isInteger(candidate.sdpMLineIndex))
    );
  }
  return false;
}

function handleMessage(peer, message) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    sendError(peer, "Mensagem inválida.");
    return;
  }

  if (message.type === "queue") {
    joinQueue(peer, message.nickname);
    return;
  }

  if (message.type === "cancel-queue") {
    if (peer.room) {
      sendError(peer, "A partida já foi encontrada.");
      return;
    }
    leaveQueue(peer);
    send(peer.socket, { type: "queue-cancelled" });
    logEvent("queue-cancelled", { peerId: peer.id });
    return;
  }

  if (message.type === "signal") {
    if (!peer.room || !validSignal(message.signal)) {
      sendError(peer, "Sinalização inválida ou sala encerrada.");
      return;
    }
    send(otherPeer(peer.room, peer).socket, { type: "signal", signal: message.signal });
    logEvent("webrtc-signal-forwarded", { roomId: peer.room.id, signalType: message.signal.type });
    return;
  }

  sendError(peer, "Tipo de mensagem desconhecido.");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok", waiting: waitingPeers.length, rooms: rooms.size }));
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const file = staticFiles.get(url.pathname);
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(root, file[0]);
  try {
    const details = await stat(filePath);
    response.writeHead(200, {
      "content-type": file[1],
      "content-length": details.size,
      "cache-control": "no-cache"
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch (error) {
    logEvent("static-file-error", { file: file[0], message: error.message });
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Unable to read application file");
  }
});

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", "http://localhost");
  const origin = request.headers.origin;
  if (url.pathname !== "/matchmaking") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  if (origin && origin !== "null") {
    try {
      if (new URL(origin).host !== request.headers.host) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
  }

  webSocketServer.handleUpgrade(request, socket, head, (client) => {
    webSocketServer.emit("connection", client, request);
  });
});

webSocketServer.on("connection", (socket) => {
  const peer = {
    id: randomUUID(),
    socket,
    nickname: null,
    room: null,
    role: null,
    queued: false,
    messageWindowAt: Date.now(),
    messageCount: 0,
    isAlive: true
  };
  peers.set(peer.id, peer);
  socketPeers.set(socket, peer);
  socket.on("pong", () => { peer.isAlive = true; });
  logEvent("peer-connected", { peerId: peer.id });

  socket.on("message", (raw) => {
    const now = Date.now();
    if (now - peer.messageWindowAt >= 1_000) {
      peer.messageWindowAt = now;
      peer.messageCount = 0;
    }
    peer.messageCount += 1;
    if (peer.messageCount > 40) {
      socket.close(1008, "Rate limit exceeded");
      return;
    }
    try {
      handleMessage(peer, JSON.parse(raw.toString()));
    } catch (error) {
      logEvent("message-error", { peerId: peer.id, message: error.message });
      sendError(peer, "Não foi possível processar a mensagem.");
    }
  });

  socket.on("close", () => disconnectPeer(peer, "socket-closed"));
  socket.on("error", (error) => logEvent("socket-error", { peerId: peer.id, message: error.message }));
});

const heartbeat = setInterval(() => {
  for (const socket of webSocketServer.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const peer = socketPeers.get(socket);
    if (!peer) continue;
    if (!peer.isAlive) {
      socket.terminate();
      continue;
    }
    peer.isAlive = false;
    socket.ping();
  }
}, 25_000);

server.on("close", () => clearInterval(heartbeat));
server.listen(port, "0.0.0.0", () => logEvent("server-ready", { port }));
