import "server-only";
import type { SessionUser } from "@/server/auth";
import { readOnlyNow } from "@/server/billing";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings";
import * as chat from "./service";
import { chatTicket } from "./ticket";

/*
 * The chat's requests, shared by the website (/api/chat/..., signed in with the browser's cookie) and
 * the phone app (/api/v1/chat/..., signed in with its token). The path after /chat picks the action.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const problem = (status: number, error: string) => json({ code: "refused", error }, status);
const done = (result: { ok: true } | { ok: false; status: number; error: string }, body: object = {}) => (result.ok ? json({ ...body, ...result }) : problem(result.status, result.error));
const id = (value: string | undefined) => (value && /^[0-9a-f-]{36}$/.test(value) ? value : "");
const bool = (value: unknown) => (typeof value === "boolean" ? value : undefined);

// Changes that are allowed even when the agency is read-only: they only record that someone looked.
const HARMLESS = new Set(["read", "typing", "delivered", "star", "preferences"]);

export async function handleChat(user: SessionUser, request: Request, path: string[]): Promise<Response> {
  const settings = await getSettings();
  if (settings.chat_enabled !== "on") return problem(403, "Chat is switched off for this agency.");
  const url = new URL(request.url);
  const [area, target, action] = path;
  const post = request.method === "POST";
  if (post && !HARMLESS.has(action ?? area) && (await readOnlyNow())) return problem(403, "This agency's Mohuddle subscription has lapsed, so nothing can be sent right now. Ask your office.");
  const body = post && !(area === "chats" && action === "attachments") ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};

  // Lists and people.
  if (!post && area === "chats" && !target) return json({ chats: await chat.listChats(user) });
  if (!post && area === "unread") return json({ unread: await chat.unreadTotal(user) });
  if (!post && area === "people") return json({ people: await chat.chatPeople(user) });
  if (!post && area === "search") return json({ results: await chat.searchMessages(user, url.searchParams.get("q") ?? "") });
  if (!post && area === "starred") return json({ messages: await chat.starredMessages(user) });
  if (!post && area === "ticket") return json({ ticket: chatTicket(user.id, user.agencyId), url: env.CHAT_SOCKET_URL });
  if (post && area === "delivered") return json(await chat.markDelivered(user));

  // Starting a chat.
  if (post && area === "chats" && !target) {
    if (body.kind === "direct") return done(await chat.startDirect(user, id(body.userId as string)));
    if (body.kind === "group") return done(await chat.createGroup(user, String(body.title ?? ""), Array.isArray(body.members) ? body.members.map(String) : []));
    return problem(400, "Choose a person or make a group.");
  }

  // One chat.
  if (area === "chats" && target) {
    const chatId = id(target);
    if (!chatId) return problem(404, "That chat is not yours.");
    if (!post && !action) {
      const detail = await chat.chatDetail(user, chatId);
      return detail ? json(detail) : problem(404, "That chat is not yours.");
    }
    if (!post && action === "messages") {
      const list = await chat.listMessages(user, chatId, { before: url.searchParams.get("before") ?? undefined, after: url.searchParams.get("after") ?? undefined, limit: Number(url.searchParams.get("limit")) || undefined });
      return list ? json(list) : problem(404, "That chat is not yours.");
    }
    if (!post && action === "export") {
      const result = await chat.exportChat(user, chatId);
      if (!result.ok) return problem(result.status, result.error);
      return new Response(result.text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${result.name}"`, "Cache-Control": "no-store" } });
    }
    if (post && action === "messages") {
      return done(
        await chat.sendMessage(user, chatId, {
          body: typeof body.body === "string" ? body.body : "",
          replyToId: typeof body.replyToId === "string" ? body.replyToId : null,
          mentions: Array.isArray(body.mentions) ? body.mentions.map(String) : [],
          personId: typeof body.personId === "string" ? body.personId : null,
          forwardOf: typeof body.forwardOf === "string" ? body.forwardOf : null,
        }),
      );
    }
    if (post && action === "attachments") {
      const limit = env.MAX_UPLOAD_MB * 1024 * 1024 + 1024;
      if (Number(request.headers.get("content-length") ?? 0) > limit) return problem(413, `Files can be up to ${env.MAX_UPLOAD_MB} MB.`);
      const data = Buffer.from(await request.arrayBuffer());
      return done(
        await chat.sendAttachment(user, chatId, data, request.headers.get("content-type") ?? "", {
          name: url.searchParams.get("name") ?? undefined,
          durationMs: Number(url.searchParams.get("durationMs")) || undefined,
          caption: url.searchParams.get("caption") ?? undefined,
          replyToId: url.searchParams.get("replyToId"),
          voice: url.searchParams.get("voice") === "1",
        }),
      );
    }
    if (post && action === "read") return done(await chat.markRead(user, chatId));
    if (post && action === "typing") {
      await chat.typing(user, chatId);
      return json({ ok: true });
    }
    if (post && action === "preferences") {
      return done(await chat.chatPreferences(user, chatId, { mutedHours: body.mutedHours === null ? null : typeof body.mutedHours === "number" ? body.mutedHours : undefined, archived: bool(body.archived), pinned: bool(body.pinned) }));
    }
    if (post && action === "group") return done(await chat.updateGroup(user, chatId, { title: typeof body.title === "string" ? body.title : undefined, about: typeof body.about === "string" ? body.about : undefined }));
    if (post && action === "members") {
      const list = (key: string) => (Array.isArray(body[key]) ? (body[key] as unknown[]).map(String) : []);
      return done(await chat.changeMembers(user, chatId, { add: list("add"), remove: list("remove"), admin: list("admin"), leave: body.leave === true }));
    }
  }

  // One message.
  if (area === "messages" && target) {
    const messageId = id(target);
    if (!messageId) return problem(404, "That message is not in your chats.");
    if (!post && action === "file") {
      const file = await chat.attachmentFile(user, messageId);
      if (!file) return problem(404, "That file is not available.");
      return new Response(file.body, { headers: { "Content-Type": file.contentType, "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...(file.size ? { "Content-Length": String(file.size) } : {}) } });
    }
    if (!post && action === "info") {
      const info = await chat.messageInfo(user, messageId);
      return info ? json(info) : problem(404, "That message is not in your chats.");
    }
    if (post && action === "edit") return done(await chat.editMessage(user, messageId, String(body.body ?? "")));
    if (post && action === "delete") return done(await chat.deleteMessage(user, messageId, body.scope === "everyone" ? "everyone" : "me"));
    if (post && action === "react") return done(await chat.reactTo(user, messageId, typeof body.emoji === "string" && body.emoji ? body.emoji : null));
    if (post && action === "pin") return done(await chat.pinMessage(user, messageId, body.pinned !== false));
    if (post && action === "star") return done(await chat.starMessage(user, messageId, body.starred !== false));
  }

  return problem(404, "Unknown chat request.");
}
