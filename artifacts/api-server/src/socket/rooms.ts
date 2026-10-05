import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { logger } from "../lib/logger";

interface Participant {
  socketId: string;
  name: string;
  isAdmin: boolean;
  hasVideoPermission: boolean;
  hasAudioPermission: boolean;
  joinedAt: number;
}

interface WaitingEntry {
  socketId: string;
  name: string;
  requestedAt: number;
}

type Payload = Record<string, unknown>;

const rooms = new Map<string, Map<string, Participant>>();
const lobbies = new Map<string, Map<string, WaitingEntry>>();

function asPayload(value: unknown): Payload | null {
  return value !== null && typeof value === "object"
    ? (value as Payload)
    : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (!result || result.length > maxLength || /[\u0000-\u001f\u007f]/u.test(result)) {
    return null;
  }
  return result;
}

function validRoomCode(value: unknown): string | null {
  return boundedText(value, 160);
}

function getRoomForSocket(socketId: string): string | null {
  for (const [roomCode, participants] of rooms) {
    if (participants.has(socketId)) return roomCode;
  }
  return null;
}

function pruneRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  const lobby = lobbies.get(roomCode);
  if (room?.size === 0) rooms.delete(roomCode);
  if ((!room || room.size === 0) && (!lobby || lobby.size === 0)) {
    lobbies.delete(roomCode);
  }
}

function listParticipants(roomCode: string): Participant[] {
  return Array.from(rooms.get(roomCode)?.values() ?? []);
}

function listWaiting(roomCode: string): WaitingEntry[] {
  return Array.from(lobbies.get(roomCode)?.values() ?? []);
}

export function setupSocketIO(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    path: "/api/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("room:join-admin", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      const name = boundedText(payload?.name, 100);
      if (!roomCode || !name) return;

      const currentRoomCode = getRoomForSocket(socket.id);
      if (currentRoomCode && currentRoomCode !== roomCode) return;

      socket.join(roomCode);
      if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
      if (!lobbies.has(roomCode)) lobbies.set(roomCode, new Map());

      const room = rooms.get(roomCode)!;
      const participant: Participant = {
        socketId: socket.id,
        name,
        isAdmin: true,
        hasVideoPermission: true,
        hasAudioPermission: true,
        joinedAt: Date.now(),
      };
      room.set(socket.id, participant);

      socket.emit("room:joined", { participants: listParticipants(roomCode) });
      socket.emit("lobby:list", listWaiting(roomCode));
      socket.to(roomCode).emit("room:user-joined", participant);

      // If the admin reconnects while approved students are still present,
      // let the admin establish their WebRTC connections again.
      for (const existing of room.values()) {
        if (existing.socketId !== socket.id && !existing.isAdmin) {
          socket.emit("room:user-joined", existing);
        }
      }

      logger.info({ roomCode, name }, "Admin joined room");
    });

    socket.on("room:request-entry", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      const name = boundedText(payload?.name, 100);
      if (!roomCode || !name) return;

      if (rooms.get(roomCode)?.has(socket.id)) {
        socket.emit("room:joined", { participants: listParticipants(roomCode) });
        return;
      }

      if (!lobbies.has(roomCode)) lobbies.set(roomCode, new Map());
      const lobby = lobbies.get(roomCode)!;
      const entry: WaitingEntry = {
        socketId: socket.id,
        name,
        requestedAt: Date.now(),
      };
      lobby.set(socket.id, entry);
      socket.emit("lobby:waiting");

      for (const participant of rooms.get(roomCode)?.values() ?? []) {
        if (participant.isAdmin) {
          io.to(participant.socketId).emit("lobby:knock", entry);
        }
      }
      logger.info({ roomCode, name }, "Participant requesting entry");
    });

    socket.on("lobby:approve", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      const targetSocketId = boundedText(payload?.targetSocketId, 128);
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (!roomCode || !targetSocketId || !room?.get(socket.id)?.isAdmin) return;

      const lobby = lobbies.get(roomCode);
      const entry = lobby?.get(targetSocketId);
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!entry || !targetSocket) {
        lobby?.delete(targetSocketId);
        io.to(socket.id).emit("lobby:list", listWaiting(roomCode));
        pruneRoom(roomCode);
        return;
      }

      lobby!.delete(targetSocketId);
      targetSocket.join(roomCode);
      const participant: Participant = {
        socketId: targetSocketId,
        name: entry.name,
        isAdmin: false,
        hasVideoPermission: false,
        hasAudioPermission: false,
        joinedAt: Date.now(),
      };
      room.set(targetSocketId, participant);

      io.to(targetSocketId).emit("room:joined", {
        participants: listParticipants(roomCode),
      });
      io.to(roomCode).emit("room:user-joined", participant);
      io.to(socket.id).emit("lobby:list", listWaiting(roomCode));
      logger.info({ roomCode, name: entry.name }, "Participant approved");
    });

    socket.on("lobby:reject", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      const targetSocketId = boundedText(payload?.targetSocketId, 128);
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (!roomCode || !targetSocketId || !room?.get(socket.id)?.isAdmin) return;

      lobbies.get(roomCode)?.delete(targetSocketId);
      io.to(targetSocketId).emit("room:rejected");
      io.to(socket.id).emit("lobby:list", listWaiting(roomCode));
      pruneRoom(roomCode);
    });

    socket.on("room:kick", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      const targetSocketId = boundedText(payload?.targetSocketId, 128);
      const room = roomCode ? rooms.get(roomCode) : undefined;
      const target = targetSocketId ? room?.get(targetSocketId) : undefined;
      if (!roomCode || !targetSocketId || !room?.get(socket.id)?.isAdmin || !target || target.isAdmin) {
        return;
      }

      io.to(targetSocketId).emit("room:kicked");
      io.sockets.sockets.get(targetSocketId)?.leave(roomCode);
      room.delete(targetSocketId);
      io.to(roomCode).emit("room:user-left", { socketId: targetSocketId });
      pruneRoom(roomCode);
    });

    for (const [event, permission] of [
      ["room:grant-video", "hasVideoPermission"],
      ["room:grant-audio", "hasAudioPermission"],
    ] as const) {
      socket.on(event, (raw: unknown) => {
        const payload = asPayload(raw);
        const roomCode = validRoomCode(payload?.roomCode);
        const targetSocketId = boundedText(payload?.targetSocketId, 128);
        const allow = payload?.allow;
        const room = roomCode ? rooms.get(roomCode) : undefined;
        const target = targetSocketId ? room?.get(targetSocketId) : undefined;
        if (!roomCode || !targetSocketId || typeof allow !== "boolean" ||
            !room?.get(socket.id)?.isAdmin || !target || target.isAdmin) {
          return;
        }

        target[permission] = allow;
        io.to(targetSocketId).emit(
          permission === "hasVideoPermission" ? "room:video-permission" : "room:audio-permission",
          { allow },
        );
        io.to(roomCode).emit("room:participants", listParticipants(roomCode));
      });
    }

    socket.on("room:raise-hand", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      const room = roomCode ? rooms.get(roomCode) : undefined;
      const user = room?.get(socket.id);
      if (!roomCode || !room || !user || user.isAdmin) return;

      for (const participant of room.values()) {
        if (participant.isAdmin) {
          io.to(participant.socketId).emit("room:hand-raised", {
            socketId: socket.id,
            name: user.name,
          });
        }
      }
    });

    socket.on("chat:message", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      const text = boundedText(payload?.text, 1000);
      const user = roomCode ? rooms.get(roomCode)?.get(socket.id) : undefined;
      if (!roomCode || !text || !user) return;

      io.to(roomCode).emit("chat:message", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: user.name,
        isAdmin: user.isAdmin,
        text,
        time: new Date().toLocaleTimeString("ar-TN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    for (const event of ["rtc:offer", "rtc:answer", "rtc:ice"] as const) {
      socket.on(event, (raw: unknown) => {
        const payload = asPayload(raw);
        const targetSocketId = boundedText(payload?.targetSocketId, 128);
        const roomCode = getRoomForSocket(socket.id);
        if (!targetSocketId || !roomCode || getRoomForSocket(targetSocketId) !== roomCode) {
          return;
        }

        const dataKey = event === "rtc:offer"
          ? "offer"
          : event === "rtc:answer"
            ? "answer"
            : "candidate";
        const data = payload?.[dataKey];
        if (!data || typeof data !== "object") return;
        const forwardedEvent = event === "rtc:offer" ? "rtc:offer"
          : event === "rtc:answer" ? "rtc:answer"
            : "rtc:ice";
        io.to(targetSocketId).emit(forwardedEvent, {
          from: socket.id,
          [dataKey]: data,
        });
      });
    }

    socket.on("wb:stroke", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode || !rooms.get(roomCode)?.has(socket.id) || !payload?.stroke) return;
      socket.to(roomCode).emit("wb:stroke", payload.stroke);
    });

    socket.on("wb:clear", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode || !rooms.get(roomCode)?.get(socket.id)?.isAdmin) return;
      socket.to(roomCode).emit("wb:clear");
    });

    socket.on("wb:undo", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode || !rooms.get(roomCode)?.has(socket.id)) return;
      socket.to(roomCode).emit("wb:undo");
    });

    socket.on("room:leave", (raw: unknown) => {
      const payload = asPayload(raw);
      const roomCode = validRoomCode(payload?.roomCode);
      if (!roomCode) return;

      const room = rooms.get(roomCode);
      if (room?.has(socket.id)) {
        room.delete(socket.id);
        socket.leave(roomCode);
        io.to(roomCode).emit("room:user-left", { socketId: socket.id });
      }

      const lobby = lobbies.get(roomCode);
      if (lobby?.delete(socket.id)) {
        for (const participant of rooms.get(roomCode)?.values() ?? []) {
          if (participant.isAdmin) {
            io.to(participant.socketId).emit("lobby:list", listWaiting(roomCode));
          }
        }
      }
      pruneRoom(roomCode);
    });

    socket.on("disconnect", () => {
      for (const [roomCode, room] of [...rooms.entries()]) {
        if (!room.delete(socket.id)) continue;
        io.to(roomCode).emit("room:user-left", { socketId: socket.id });
        pruneRoom(roomCode);
      }

      for (const [roomCode, lobby] of [...lobbies.entries()]) {
        if (!lobby.delete(socket.id)) continue;
        for (const participant of rooms.get(roomCode)?.values() ?? []) {
          if (participant.isAdmin) {
            io.to(participant.socketId).emit("lobby:list", listWaiting(roomCode));
          }
        }
        pruneRoom(roomCode);
      }

      logger.info({ socketId: socket.id }, "Socket disconnected");
    });
  });

  return io;
}
