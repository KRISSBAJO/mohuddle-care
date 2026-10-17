/*
 * Mohuddle chat's live connection: a small WebSocket server beside the website.
 *
 * Phones and browsers connect with a one-minute pass from /api/chat/ticket (or /api/v1/chat/ticket).
 * Messages are always saved through the website's API; Postgres then announces each change
 * (pg_notify on "mohuddle_chat") and every gateway passes it to the open connections of that chat's
 * members. Only ids travel this way; apps fetch the message itself. Apps send "typing" here, and the
 * gateway keeps "online" and "last seen" up to date. Several gateways can run side by side.
 *
 *   pnpm chat:gateway      (listens on PORT when the host sets it, else CHAT_SOCKET_PORT, 3401 by default)
 */
import { createServer } from "node:http";

process.loadEnvFile?.(".env");

type Event = { a: string; t: string; c?: string; m?: string; u?: string; n?: string; users?: string[]; online?: boolean };
type Client = { userId: string; agencyId: string; name: string; chats: Set<string>; alive: boolean; typedAt: number };

async function main() {
  const { WebSocketServer, WebSocket } = await import("ws");
  const pg = await import("pg");
  const { env } = await import("@/server/env");
  const { readChatTicket } = await import("@/server/chat/ticket");
  const { systemPool } = await import("@/server/db");

  const clients = new Map<import("ws").WebSocket, Client>();
  const send = (socket: import("ws").WebSocket, payload: object) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  const chatsOf = async (userId: string) => new Set((await systemPool.query<{ chat_id: string }>("select chat_id from chat_members where user_id = $1", [userId])).rows.map(row => row.chat_id));
  const notify = (event: Event) => systemPool.query("select pg_notify('mohuddle_chat', $1)", [JSON.stringify(event)]).catch(error => console.error("Chat notify failed", error));
  const seen = (userIds: string[]) => (userIds.length ? systemPool.query("update users set last_seen_at = now() where id = any($1::uuid[])", [userIds]).catch(() => undefined) : undefined);
  const onlineHere = (userId: string) => [...clients.values()].some(client => client.userId === userId);

  /* ---------- Changes from Postgres, passed to the right connections ---------- */

  async function deliver(event: Event) {
    if (event.t === "members") {
      // People added to or removed from a chat: refresh what their open connections listen to.
      for (const [socket, client] of clients) {
        if (client.agencyId !== event.a || !event.users?.includes(client.userId)) continue;
        client.chats = await chatsOf(client.userId);
        send(socket, { t: "chats" });
      }
    }
    if (event.t === "presence") {
      for (const [socket, client] of clients) if (client.agencyId === event.a && client.userId !== event.u) send(socket, { t: "presence", u: event.u, online: event.online });
      return;
    }
    if (!event.c) return;
    for (const [socket, client] of clients) {
      if (client.agencyId !== event.a || !client.chats.has(event.c)) continue;
      if (event.t === "typing" && event.u === client.userId) continue;
      send(socket, { t: event.t, c: event.c, ...(event.m ? { m: event.m } : {}), ...(event.u ? { u: event.u } : {}), ...(event.n ? { n: event.n } : {}) });
    }
  }

  let listener: import("pg").Client | null = null;
  async function listen() {
    try {
      listener = new pg.default.Client({ connectionString: env.DATABASE_URL });
      listener.on("notification", message => {
        try {
          void deliver(JSON.parse(message.payload ?? "{}") as Event);
        } catch {
          // A malformed announcement is ignored.
        }
      });
      listener.on("error", () => restart());
      listener.on("end", () => restart());
      await listener.connect();
      await listener.query("listen mohuddle_chat");
      console.log("Chat gateway: listening to Postgres");
    } catch (error) {
      console.error("Chat gateway: Postgres unavailable, retrying", (error as Error).message);
      restart();
    }
  }
  let restarting = false;
  function restart() {
    if (restarting) return;
    restarting = true;
    listener?.removeAllListeners();
    listener?.end().catch(() => undefined);
    listener = null;
    setTimeout(() => {
      restarting = false;
      void listen();
    }, 3000);
  }
  await listen();

  /* ---------- Connections ---------- */

  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, connections: clients.size, postgres: Boolean(listener) }));
      return;
    }
    response.writeHead(404).end();
  });
  const sockets = new WebSocketServer({ server, path: "/chat", maxPayload: 4096 });

  sockets.on("connection", async (socket, request) => {
    const ticket = new URL(request.url ?? "", "http://gateway").searchParams.get("ticket") ?? "";
    const who = readChatTicket(ticket);
    if (!who) {
      socket.close(4001, "Sign in again");
      return;
    }
    const [user] = (await systemPool.query<{ name: string; active: boolean }>("select name, active from users where id = $1 and agency_id = $2", [who.userId, who.agencyId])).rows;
    if (!user?.active) {
      socket.close(4001, "Sign in again");
      return;
    }
    const wasOnline = onlineHere(who.userId);
    const client: Client = { ...who, name: user.name.split(" ")[0], chats: await chatsOf(who.userId), alive: true, typedAt: 0 };
    clients.set(socket, client);
    await seen([who.userId]);
    if (!wasOnline) void notify({ a: who.agencyId, t: "presence", u: who.userId, online: true });
    send(socket, { t: "hello" });

    socket.on("pong", () => {
      client.alive = true;
    });
    socket.on("message", raw => {
      let message: { t?: string; c?: string };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      // "Typing…", at most once a second per person, and only into their own chats.
      if (message.t === "typing" && message.c && client.chats.has(message.c) && Date.now() - client.typedAt > 1000) {
        client.typedAt = Date.now();
        void notify({ a: client.agencyId, t: "typing", c: message.c, u: client.userId, n: client.name });
      }
      if (message.t === "ping") send(socket, { t: "pong" });
    });
    socket.on("close", () => {
      clients.delete(socket);
      void seen([client.userId]);
      if (!onlineHere(client.userId)) void notify({ a: client.agencyId, t: "presence", u: client.userId, online: false });
    });
  });

  // Drops connections that stopped answering, and keeps "last seen" fresh for the ones that answer.
  setInterval(() => {
    for (const [socket, client] of clients) {
      if (!client.alive) {
        socket.terminate();
        continue;
      }
      client.alive = false;
      socket.ping();
    }
    void seen([...new Set([...clients.values()].map(client => client.userId))]);
  }, 30_000);

  // A host such as Render gives the service its port in PORT; locally it is CHAT_SOCKET_PORT (3401).
  const port = Number(process.env.PORT) || env.CHAT_SOCKET_PORT;
  server.listen(port, () => console.log(`Chat gateway: ws://localhost:${port}/chat`));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
