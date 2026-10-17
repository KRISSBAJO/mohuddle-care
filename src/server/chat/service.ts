import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { canManage, type SessionUser } from "@/server/auth";
import { db, schema } from "@/server/db";
import { agencyKey, storage } from "@/server/docs/storage";
import { env } from "@/server/env";
import { pushToPhones } from "@/server/phone-push";
import { pushTo } from "@/server/push";
import { getSettings } from "@/server/settings";

/*
 * Chat inside one agency, shared by the website and the phone app. Messages are saved here; the live
 * connection (src/realtime/gateway.ts) only tells open apps that something changed, so nothing is lost
 * when a connection drops. A deleted message is hidden from everyone but kept for audits and exports.
 */

export type ChatKind = "direct" | "group" | "home" | "announcements";
type Result<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const ONLINE_MS = 70_000;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif" };
const VOICE_TYPES: Record<string, string> = { "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav" };
const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  ...IMAGE_TYPES,
};

/* ---------- Telling open apps ---------- */

export type ChatEvent =
  | { t: "message"; c: string; m: string }
  | { t: "update"; c: string; m: string }
  | { t: "receipt"; c: string; u: string }
  | { t: "typing"; c: string; u: string; n: string }
  | { t: "chat"; c: string }
  | { t: "members"; c: string; users: string[] };

/* Tells every live connection, on every server, through Postgres. Only ids travel; apps fetch the rest. */
export async function announce(agencyId: string, event: ChatEvent) {
  await db.execute(sql`select pg_notify('mohuddle_chat', ${JSON.stringify({ a: agencyId, ...event })})`);
}

/* ---------- Home groups and Announcements, kept in step with who works where ---------- */

const synced = ((globalThis as { mohuddleChatSynced?: Map<string, number> }).mohuddleChatSynced ??= new Map());

export async function syncAutoChats(agencyId: string, force = false) {
  if (!force && Date.now() - (synced.get(agencyId) ?? 0) < 60_000) return;
  synced.set(agencyId, Date.now());
  const people = await db
    .select({ id: schema.users.id, role: schema.users.role, homeId: schema.staff.homeId })
    .from(schema.users)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.users.staffId))
    .where(and(eq(schema.users.active, true), isNull(schema.users.supportUntil)));
  const managers = people.filter(person => person.role === "admin" || person.role === "coordinator");

  await db.insert(schema.chats).values({ kind: "announcements", title: "Announcements", about: "News from the office. Only coordinators and administrators post here." }).onConflictDoNothing();
  const homes = await db.select({ id: schema.homes.id, name: schema.homes.name }).from(schema.homes).where(eq(schema.homes.active, true));
  if (homes.length) await db.insert(schema.chats).values(homes.map(home => ({ kind: "home" as const, homeId: home.id, title: home.name, about: `Everyone who works at ${home.name}.` }))).onConflictDoNothing();
  const autoChats = await db.select({ id: schema.chats.id, kind: schema.chats.kind, homeId: schema.chats.homeId, title: schema.chats.title }).from(schema.chats).where(inArray(schema.chats.kind, ["home", "announcements"]));
  // A renamed home renames its group.
  for (const chat of autoChats) {
    const home = homes.find(item => item.id === chat.homeId);
    if (chat.kind === "home" && home && home.name !== chat.title) await db.update(schema.chats).set({ title: home.name }).where(eq(schema.chats.id, chat.id));
  }
  const members = autoChats.length ? await db.select().from(schema.chatMembers).where(inArray(schema.chatMembers.chatId, autoChats.map(chat => chat.id))) : [];
  for (const chat of autoChats) {
    // A closed home's group keeps its history but gains no one.
    if (chat.kind === "home" && !homes.some(home => home.id === chat.homeId)) continue;
    const wanted = chat.kind === "announcements" ? people : [...people.filter(person => person.homeId === chat.homeId), ...managers];
    const wantedIds = new Set(wanted.map(person => person.id));
    const current = members.filter(member => member.chatId === chat.id);
    const missing = [...wantedIds].filter(id => !current.some(member => member.userId === id));
    if (missing.length) {
      await db
        .insert(schema.chatMembers)
        .values(missing.map(userId => ({ chatId: chat.id, userId, auto: true, role: managers.some(person => person.id === userId) ? ("admin" as const) : ("member" as const) })))
        .onConflictDoNothing();
    }
    const gone = current.filter(member => member.auto && !wantedIds.has(member.userId)).map(member => member.id);
    if (gone.length) await db.delete(schema.chatMembers).where(inArray(schema.chatMembers.id, gone));
  }
}

/* ---------- Membership and permissions ---------- */

async function membership(user: SessionUser, chatId: string) {
  if (!/^[0-9a-f-]{36}$/.test(chatId)) return null;
  const [row] = await db
    .select({ chat: schema.chats, member: schema.chatMembers })
    .from(schema.chatMembers)
    .innerJoin(schema.chats, eq(schema.chats.id, schema.chatMembers.chatId))
    .where(and(eq(schema.chatMembers.chatId, chatId), eq(schema.chatMembers.userId, user.id)))
    .limit(1);
  return row ?? null;
}

const mayPost = (user: SessionUser, kind: ChatKind) => kind !== "announcements" || canManage(user);
const mayManageMembers = (user: SessionUser, kind: ChatKind, role: string) => kind === "group" ? role === "admin" || canManage(user) : kind === "home" && canManage(user);
// @everyone and polls follow the agency's settings: anyone in the group, its admins and managers, or no one.
const groupRule = (rule: "anyone" | "admins" | "off", user: SessionUser, kind: ChatKind, role: string) => kind !== "direct" && mayPost(user, kind) && (rule === "anyone" || (rule === "admins" && (role === "admin" || canManage(user))));

/* ---------- The chat list ---------- */

export type ChatListItem = {
  id: string;
  kind: ChatKind;
  title: string;
  other: { id: string; name: string; online: boolean; lastSeenAt: string | null } | null;
  members: number;
  lastMessage: { id: string; kind: string; body: string; senderId: string | null; senderName: string | null; deleted: boolean; at: string } | null;
  unread: number;
  mentioned: boolean;
  muted: boolean;
  archived: boolean;
  pinned: boolean;
  lastMessageAt: string | null;
};

export async function listChats(user: SessionUser): Promise<ChatListItem[]> {
  await syncAutoChats(user.agencyId);
  const result = await db.execute(sql`
    select c.id, c.kind, c.title, c.last_message_at, c.created_at, m.muted_until, m.archived, m.pinned,
      (select count(*)::int from chat_members x where x.chat_id = c.id) as members,
      (select count(*)::int from chat_messages q
        where q.chat_id = c.id and q.created_at > coalesce(m.last_read_at, m.created_at) and q.sender_id is distinct from ${user.id}
          and q.deleted_at is null and q.kind <> 'system') as unread,
      exists (select 1 from chat_messages q where q.chat_id = c.id and q.created_at > coalesce(m.last_read_at, m.created_at)
          and q.mentions ? ${user.id} and q.deleted_at is null) as mentioned,
      lm.id as lm_id, lm.kind as lm_kind, lm.body as lm_body, lm.sender_id as lm_sender, lm.deleted_at as lm_deleted, lm.created_at as lm_at, su.name as lm_sender_name,
      ou.id as other_id, ou.name as other_name, ou.last_seen_at as other_seen
    from chat_members m
    join chats c on c.id = m.chat_id
    left join lateral (select * from chat_messages q where q.chat_id = c.id order by q.created_at desc limit 1) lm on true
    left join users su on su.id = lm.sender_id
    left join lateral (select u.* from chat_members o join users u on u.id = o.user_id where c.kind = 'direct' and o.chat_id = c.id and o.user_id <> ${user.id} limit 1) ou on true
    where m.user_id = ${user.id}
    order by m.pinned desc, coalesce(c.last_message_at, c.created_at) desc`);
  const rows = result.rows as Record<string, unknown>[];
  const now = Date.now();
  const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
  return rows.map(row => ({
    id: row.id as string,
    kind: row.kind as ChatKind,
    title: row.kind === "direct" ? ((row.other_name as string | null) ?? "Former colleague") : (row.title as string),
    other: row.other_id
      ? { id: row.other_id as string, name: row.other_name as string, online: Boolean(row.other_seen) && now - new Date(row.other_seen as string).getTime() < ONLINE_MS, lastSeenAt: iso(row.other_seen) }
      : null,
    members: Number(row.members),
    lastMessage: row.lm_id
      ? { id: row.lm_id as string, kind: row.lm_kind as string, body: row.lm_deleted ? "" : (row.lm_body as string), senderId: row.lm_sender as string | null, senderName: row.lm_sender_name as string | null, deleted: Boolean(row.lm_deleted), at: iso(row.lm_at)! }
      : null,
    unread: Number(row.unread),
    mentioned: Boolean(row.mentioned),
    muted: Boolean(row.muted_until) && new Date(row.muted_until as string).getTime() > now,
    archived: Boolean(row.archived),
    pinned: Boolean(row.pinned),
    lastMessageAt: iso(row.last_message_at),
  }));
}

export async function unreadTotal(user: SessionUser) {
  const result = await db.execute(sql`
    select coalesce(sum((select count(*) from chat_messages q where q.chat_id = m.chat_id and q.created_at > coalesce(m.last_read_at, m.created_at)
      and q.sender_id is distinct from ${user.id} and q.deleted_at is null and q.kind <> 'system')), 0)::int as n
    from chat_members m where m.user_id = ${user.id} and not m.archived and (m.muted_until is null or m.muted_until < now())`);
  return Number((result.rows[0] as { n: number }).n);
}

/* ---------- People to chat with ---------- */

export async function chatPeople(user: SessionUser) {
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, home: schema.homes.name, lastSeenAt: schema.users.lastSeenAt })
    .from(schema.users)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.users.staffId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.staff.homeId))
    .where(and(eq(schema.users.active, true), isNull(schema.users.supportUntil)))
    .orderBy(asc(schema.users.name));
  const now = Date.now();
  return rows.filter(row => row.id !== user.id).map(row => ({ ...row, online: Boolean(row.lastSeenAt) && now - row.lastSeenAt!.getTime() < ONLINE_MS }));
}

/* People supported, to tag in a message. Everyone in the agency can see who is supported, as on the People page. */
export async function chatPersons() {
  return db
    .select({ id: schema.individuals.id, name: sql<string>`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`, home: schema.homes.name })
    .from(schema.individuals)
    .leftJoin(schema.homes, eq(schema.homes.id, schema.individuals.homeId))
    .where(eq(schema.individuals.active, true))
    .orderBy(asc(schema.individuals.firstName));
}

/* ---------- Starting chats ---------- */

export async function startDirect(user: SessionUser, otherId: string): Promise<Result<{ chatId: string }>> {
  const settings = await getSettings();
  if (settings.chat_direct === "managers" && !canManage(user)) return fail(403, "One-to-one chats are started by coordinators and administrators here.");
  if (otherId === user.id) return fail(400, "Choose someone else.");
  const [other] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.id, otherId), eq(schema.users.active, true), isNull(schema.users.supportUntil))).limit(1);
  if (!other) return fail(404, "That person is not in this agency.");
  const directKey = [user.id, otherId].sort().join(":");
  await db.insert(schema.chats).values({ kind: "direct", directKey, createdBy: user.id }).onConflictDoNothing();
  const [chat] = await db.select({ id: schema.chats.id }).from(schema.chats).where(eq(schema.chats.directKey, directKey)).limit(1);
  const added = await db.insert(schema.chatMembers).values([user.id, otherId].map(userId => ({ chatId: chat.id, userId, role: "admin" as const }))).onConflictDoNothing().returning({ userId: schema.chatMembers.userId });
  // A new chat: both people's open apps start listening to it, so the first message arrives live.
  if (added.length) await announce(user.agencyId, { t: "members", c: chat.id, users: added.map(row => row.userId) });
  return { ok: true, chatId: chat.id };
}

export async function createGroup(user: SessionUser, title: string, memberIds: string[]): Promise<Result<{ chatId: string }>> {
  const settings = await getSettings();
  if (settings.chat_groups === "managers" && !canManage(user)) return fail(403, "Groups are created by coordinators and administrators here.");
  const name = title.trim().slice(0, 80);
  if (name.length < 2) return fail(400, "Give the group a name.");
  const ids = [...new Set(memberIds.filter(id => id !== user.id))];
  const valid = ids.length ? await db.select({ id: schema.users.id }).from(schema.users).where(and(inArray(schema.users.id, ids), eq(schema.users.active, true))) : [];
  const [chat] = await db.insert(schema.chats).values({ kind: "group", title: name, createdBy: user.id }).returning({ id: schema.chats.id });
  await db.insert(schema.chatMembers).values([{ chatId: chat.id, userId: user.id, role: "admin" as const }, ...valid.map(row => ({ chatId: chat.id, userId: row.id, role: "member" as const }))]);
  await systemLine(user, chat.id, `${user.name} created the group "${name}".`);
  await announce(user.agencyId, { t: "members", c: chat.id, users: [user.id, ...valid.map(row => row.id)] });
  return { ok: true, chatId: chat.id };
}

/* ---------- One chat ---------- */

export async function chatDetail(user: SessionUser, chatId: string) {
  const found = await membership(user, chatId);
  if (!found) return null;
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, home: schema.homes.name, chatRole: schema.chatMembers.role, auto: schema.chatMembers.auto, lastSeenAt: schema.users.lastSeenAt, lastReadAt: schema.chatMembers.lastReadAt })
    .from(schema.chatMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatMembers.userId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.users.staffId))
    .leftJoin(schema.homes, eq(schema.homes.id, schema.staff.homeId))
    .where(eq(schema.chatMembers.chatId, chatId))
    .orderBy(asc(schema.users.name));
  const pinned = await db
    .select({ id: schema.chatMessages.id, body: schema.chatMessages.body, kind: schema.chatMessages.kind, at: schema.chatMessages.createdAt })
    .from(schema.chatMessages)
    .where(and(eq(schema.chatMessages.chatId, chatId), sql`${schema.chatMessages.pinnedAt} is not null`, isNull(schema.chatMessages.deletedAt)))
    .orderBy(desc(schema.chatMessages.pinnedAt))
    .limit(3);
  const settings = await getSettings();
  const now = Date.now();
  const { chat, member } = found;
  const other = chat.kind === "direct" ? members.find(item => item.id !== user.id) : null;
  return {
    id: chat.id,
    kind: chat.kind,
    title: chat.kind === "direct" ? (other?.name ?? "Former colleague") : chat.title,
    about: chat.about,
    homeId: chat.homeId,
    members: members.map(item => ({ id: item.id, name: item.name, role: item.role, home: item.home, admin: item.chatRole === "admin", auto: item.auto, online: Boolean(item.lastSeenAt) && now - item.lastSeenAt!.getTime() < ONLINE_MS, lastSeenAt: item.lastSeenAt })),
    pinned,
    // readUpTo: messages after it are new to this person, for the "unread messages" line.
    me: { muted: Boolean(member.mutedUntil) && member.mutedUntil!.getTime() > now, mutedUntil: member.mutedUntil, archived: member.archived, pinned: member.pinned, admin: member.role === "admin", readUpTo: member.lastReadAt ?? member.joinedAt },
    can: {
      post: mayPost(user, chat.kind),
      manageMembers: mayManageMembers(user, chat.kind, member.role),
      rename: chat.kind === "group" && (member.role === "admin" || canManage(user)),
      leave: chat.kind === "group",
      export: user.role === "admin",
      attach: settings.chat_attachments === "on",
      moderate: canManage(user),
      mentionAll: groupRule(settings.chat_mention_all, user, chat.kind, member.role),
      poll: groupRule(settings.chat_polls, user, chat.kind, member.role),
    },
    rules: { editMinutes: settings.chat_edit_minutes, deleteHours: settings.chat_delete_hours },
  };
}

/* ---------- Messages ---------- */

export type ChatMessageView = {
  id: string;
  chatId: string;
  kind: string;
  body: string;
  sender: { id: string; name: string } | null;
  at: string;
  editedAt: string | null;
  deleted: boolean;
  forwarded: boolean;
  pinned: boolean;
  starred: boolean;
  mentions: string[];
  person: { id: string; name: string } | null;
  attachment: { name: string; contentType: string; size: number; durationMs?: number; width?: number; height?: number } | null;
  // chat is set when the quoted message is in another chat: a group message answered privately.
  replyTo: { id: string; kind: string; body: string; senderName: string | null; deleted: boolean; chat: { id: string; title: string } | null } | null;
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[];
  status: "sent" | "delivered" | "read" | null;
  poll: PollView | null;
};
export type PollView = { options: { id: string; text: string; votes: number; mine: boolean; voters: string[] }[]; multiple: boolean; closed: boolean; voters: number };

export async function listMessages(user: SessionUser, chatId: string, options: { before?: string; after?: string; around?: string; limit?: number }) {
  const found = await membership(user, chatId);
  if (!found) return null;
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const m = schema.chatMessages;
  const reply = alias(schema.chatMessages, "reply");
  const replySender = alias(schema.users, "reply_sender");
  const replyChat = alias(schema.chats, "reply_chat");
  const sender = alias(schema.users, "sender");
  const at = (value?: string) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null);
  const before = at(options.before);
  const after = at(options.after);
  const rows = await db
    .select({
      message: m,
      senderName: sender.name,
      person: sql<string | null>`${schema.individuals.firstName} || ' ' || ${schema.individuals.lastName}`,
      reply: { id: reply.id, chatId: reply.chatId, chatTitle: replyChat.title, kind: reply.kind, body: reply.body, deletedAt: reply.deletedAt, senderName: replySender.name },
    })
    .from(m)
    .leftJoin(sender, eq(sender.id, m.senderId))
    .leftJoin(schema.individuals, eq(schema.individuals.id, m.personId))
    .leftJoin(reply, eq(reply.id, m.replyToId))
    .leftJoin(replySender, eq(replySender.id, reply.senderId))
    .leftJoin(replyChat, eq(replyChat.id, reply.chatId))
    .where(
      and(
        eq(m.chatId, chatId),
        before ? lt(m.createdAt, before) : undefined,
        after ? gt(m.createdAt, after) : undefined,
        sql`not exists (select 1 from chat_message_marks h where h.message_id = ${m.id} and h.user_id = ${user.id} and h.mark = 'hidden')`,
      ),
    )
    .orderBy(after ? asc(m.createdAt) : desc(m.createdAt))
    .limit(limit);
  const ordered = after ? rows : rows.reverse();
  return { messages: await present(user, chatId, ordered), hasMore: rows.length === limit };
}

async function present(
  user: SessionUser,
  chatId: string,
  rows: { message: typeof schema.chatMessages.$inferSelect; senderName: string | null; person: string | null; reply: { id: string | null; chatId: string | null; chatTitle: string | null; kind: string | null; body: string | null; deletedAt: Date | null; senderName: string | null } | null }[],
): Promise<ChatMessageView[]> {
  const ids = rows.map(row => row.message.id);
  const pollIds = rows.filter(row => row.message.kind === "poll").map(row => row.message.id);
  const [reactions, marks, others, votes] = await Promise.all([
    ids.length
      ? db.select({ messageId: schema.chatReactions.messageId, emoji: schema.chatReactions.emoji, userId: schema.chatReactions.userId, name: schema.users.name }).from(schema.chatReactions).innerJoin(schema.users, eq(schema.users.id, schema.chatReactions.userId)).where(inArray(schema.chatReactions.messageId, ids))
      : [],
    ids.length ? db.select({ messageId: schema.chatMessageMarks.messageId }).from(schema.chatMessageMarks).where(and(inArray(schema.chatMessageMarks.messageId, ids), eq(schema.chatMessageMarks.userId, user.id), eq(schema.chatMessageMarks.mark, "starred"))) : [],
    db.select({ read: schema.chatMembers.lastReadAt, delivered: schema.chatMembers.lastDeliveredAt }).from(schema.chatMembers).where(and(eq(schema.chatMembers.chatId, chatId), sql`${schema.chatMembers.userId} <> ${user.id}`)),
    pollIds.length
      ? db.select({ messageId: schema.chatPollVotes.messageId, optionId: schema.chatPollVotes.optionId, userId: schema.chatPollVotes.userId, name: schema.users.name }).from(schema.chatPollVotes).innerJoin(schema.users, eq(schema.users.id, schema.chatPollVotes.userId)).where(inArray(schema.chatPollVotes.messageId, pollIds)).orderBy(asc(schema.chatPollVotes.createdAt))
      : [],
  ]);
  const starred = new Set(marks.map(mark => mark.messageId));
  // Ticks: read once everyone else has read up to it, delivered once it reached every other phone or browser.
  const everyone = (at: Date, pick: (row: (typeof others)[number]) => Date | null) => others.length > 0 && others.every(row => (pick(row)?.getTime() ?? 0) >= at.getTime());
  return rows.map(({ message, senderName, person, reply }) => {
    const deleted = Boolean(message.deletedAt);
    const mine = reactions.filter(item => item.messageId === message.id);
    const grouped = [...new Set(mine.map(item => item.emoji))].map(emoji => {
      const who = mine.filter(item => item.emoji === emoji);
      return { emoji, count: who.length, mine: who.some(item => item.userId === user.id), names: who.map(item => item.name) };
    });
    const own = message.senderId === user.id && message.kind !== "system";
    return {
      id: message.id,
      chatId: message.chatId,
      kind: message.kind,
      body: deleted ? "" : message.body,
      sender: message.senderId ? { id: message.senderId, name: senderName ?? "Former colleague" } : null,
      at: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      deleted,
      forwarded: message.forwarded,
      pinned: Boolean(message.pinnedAt),
      starred: starred.has(message.id),
      mentions: message.mentions,
      person: message.personId && person && !deleted ? { id: message.personId, name: person } : null,
      attachment: message.attachment && !deleted ? { name: message.attachment.name, contentType: message.attachment.contentType, size: message.attachment.size, durationMs: message.attachment.durationMs, width: message.attachment.width, height: message.attachment.height } : null,
      replyTo: reply?.id
        ? { id: reply.id, kind: reply.kind ?? "text", body: reply.deletedAt ? "" : (reply.body ?? ""), senderName: reply.senderName, deleted: Boolean(reply.deletedAt), chat: reply.chatId && reply.chatId !== message.chatId ? { id: reply.chatId, title: reply.chatTitle ?? "" } : null }
        : null,
      reactions: deleted ? [] : grouped,
      status: own ? (everyone(message.createdAt, row => row.read) ? "read" : everyone(message.createdAt, row => row.delivered) ? "delivered" : "sent") : null,
      poll: message.poll && !deleted ? pollView(message.poll, votes.filter(vote => vote.messageId === message.id), user.id) : null,
    };
  });
}

function pollView(poll: NonNullable<typeof schema.chatMessages.$inferSelect.poll>, votes: { optionId: string; userId: string; name: string }[], userId: string): PollView {
  return {
    options: poll.options.map(option => {
      const chose = votes.filter(vote => vote.optionId === option.id);
      return { id: option.id, text: option.text, votes: chose.length, mine: chose.some(vote => vote.userId === userId), voters: chose.map(vote => vote.name) };
    }),
    multiple: poll.multiple,
    closed: Boolean(poll.closedAt),
    voters: new Set(votes.map(vote => vote.userId)).size,
  };
}

async function oneMessage(user: SessionUser, messageId: string) {
  if (!/^[0-9a-f-]{36}$/.test(messageId)) return null;
  const [message] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, messageId)).limit(1);
  if (!message) return null;
  const found = await membership(user, message.chatId);
  return found ? { message, ...found } : null;
}

export type SendInput = { body?: string; replyToId?: string | null; mentions?: string[]; mentionAll?: boolean; personId?: string | null; forwardOf?: string | null };

export async function sendMessage(user: SessionUser, chatId: string, input: SendInput, attachment?: { kind: "image" | "file" | "voice"; data: schema_ChatAttachment }, poll?: NonNullable<typeof schema.chatMessages.$inferSelect.poll>): Promise<Result<{ message: ChatMessageView }>> {
  const found = await membership(user, chatId);
  if (!found) return fail(404, "That chat is not yours.");
  if (!mayPost(user, found.chat.kind)) return fail(403, "Only coordinators and administrators post in Announcements.");
  let body = (input.body ?? "").trim().slice(0, 4000);
  let kind: "text" | "image" | "file" | "voice" | "poll" = poll ? "poll" : (attachment?.kind ?? "text");
  let stored = attachment?.data ?? null;
  let forwarded = false;
  if (input.forwardOf) {
    const original = await oneMessage(user, input.forwardOf);
    if (!original || original.message.deletedAt) return fail(404, "That message can no longer be forwarded.");
    if (original.message.kind === "poll") return fail(400, "Polls can't be forwarded. Start a new poll instead.");
    body = original.message.body;
    kind = original.message.kind === "system" ? "text" : original.message.kind;
    stored = original.message.attachment;
    forwarded = true;
  }
  if (!body && !stored) return fail(400, "Write a message first.");
  const memberIds = (await db.select({ userId: schema.chatMembers.userId }).from(schema.chatMembers).where(eq(schema.chatMembers.chatId, chatId))).map(row => row.userId);
  const replyTo = input.replyToId && /^[0-9a-f-]{36}$/.test(input.replyToId) ? input.replyToId : null;
  if (replyTo) {
    const [target] = await db.select({ chatId: schema.chatMessages.chatId, senderId: schema.chatMessages.senderId, kind: schema.chatMessages.kind, deletedAt: schema.chatMessages.deletedAt }).from(schema.chatMessages).where(eq(schema.chatMessages.id, replyTo)).limit(1);
    if (!target) return fail(400, "That message is no longer there.");
    if (target.chatId !== chatId) {
      // Replying privately: a group message answered in the one-to-one chat with the person who wrote it,
      // by someone who is in that group. Nothing else crosses from one chat to another.
      const privately = found.chat.kind === "direct" && target.senderId !== null && target.senderId !== user.id && memberIds.includes(target.senderId) && target.kind !== "system" && !target.deletedAt && Boolean(await membership(user, target.chatId));
      if (!privately) return fail(400, "You can only reply to a message in this chat.");
    }
  }
  let mentions = [...new Set((input.mentions ?? []).filter(id => memberIds.includes(id) && id !== user.id))];
  if (input.mentionAll) {
    if (!groupRule((await getSettings()).chat_mention_all, user, found.chat.kind, found.member.role)) return fail(403, "You can't mention everyone in this chat.");
    mentions = memberIds.filter(id => id !== user.id);
  }
  let personId: string | null = null;
  if (input.personId && /^[0-9a-f-]{36}$/.test(input.personId)) {
    const [person] = await db.select({ id: schema.individuals.id }).from(schema.individuals).where(eq(schema.individuals.id, input.personId)).limit(1);
    personId = person?.id ?? null;
  }
  const now = new Date();
  const [message] = await db
    .insert(schema.chatMessages)
    .values({ chatId, senderId: user.id, kind, body, replyToId: replyTo, forwarded, mentions, personId, attachment: stored, poll: poll ?? null, createdAt: now })
    .returning();
  await db.update(schema.chats).set({ lastMessageAt: now }).where(eq(schema.chats.id, chatId));
  await db.update(schema.chatMembers).set({ lastReadAt: now, lastDeliveredAt: now }).where(and(eq(schema.chatMembers.chatId, chatId), eq(schema.chatMembers.userId, user.id)));
  await announce(user.agencyId, { t: "message", c: chatId, m: message.id });
  await tellMembers(user, found.chat, message, mentions).catch(error => console.error("Chat push failed", error));
  const [view] = (await listMessages(user, chatId, { after: new Date(now.getTime() - 1).toISOString(), limit: 5 }))!.messages.filter(item => item.id === message.id);
  return { ok: true, message: view };
}

type schema_ChatAttachment = NonNullable<typeof schema.chatMessages.$inferSelect.attachment>;

/* A phone or browser notification for everyone else in the chat who has not muted it. */
async function tellMembers(user: SessionUser, chat: typeof schema.chats.$inferSelect, message: typeof schema.chatMessages.$inferSelect, mentions: string[]) {
  const now = new Date();
  const members = await db
    .select({ userId: schema.chatMembers.userId, mutedUntil: schema.chatMembers.mutedUntil })
    .from(schema.chatMembers)
    .where(and(eq(schema.chatMembers.chatId, chat.id), sql`${schema.chatMembers.userId} <> ${user.id}`));
  // Muted chats still notify someone who was @mentioned.
  const told = members.filter(member => !member.mutedUntil || member.mutedUntil < now || mentions.includes(member.userId)).map(member => member.userId);
  if (!told.length) return;
  const where = chat.kind === "direct" ? user.name : `${user.name} in ${chat.title}`;
  const what = message.kind === "image" ? "Sent a photo" : message.kind === "voice" ? "Sent a voice note" : message.kind === "file" ? "Sent a file" : message.kind === "poll" ? `📊 Poll: ${message.body.slice(0, 130)}` : message.body.slice(0, 140);
  const push = { title: where, body: what, href: `/app/chat?c=${chat.id}`, tone: "info", tag: `chat:${chat.id}` };
  await Promise.all([pushTo(told, push), pushToPhones(told, push)]);
}

async function systemLine(user: SessionUser, chatId: string, body: string) {
  const now = new Date();
  await db.insert(schema.chatMessages).values({ chatId, senderId: null, kind: "system", body, createdAt: now });
  await db.update(schema.chats).set({ lastMessageAt: now }).where(eq(schema.chats.id, chatId));
  await announce(user.agencyId, { t: "chat", c: chatId });
}

export async function editMessage(user: SessionUser, messageId: string, rawBody: string): Promise<Result> {
  const found = await oneMessage(user, messageId);
  if (!found || found.message.senderId !== user.id) return fail(404, "You can only edit your own messages.");
  if (found.message.deletedAt || found.message.kind === "system" || found.message.kind === "poll") return fail(400, "This message cannot be edited.");
  const minutes = (await getSettings()).chat_edit_minutes;
  if (Date.now() - found.message.createdAt.getTime() > minutes * 60_000) return fail(400, minutes ? `Messages can be edited for ${minutes} minutes after sending.` : "Messages cannot be edited here.");
  const body = rawBody.trim().slice(0, 4000);
  if (!body && !found.message.attachment) return fail(400, "Write the message, or delete it instead.");
  await db.update(schema.chatMessages).set({ body, editedAt: new Date() }).where(eq(schema.chatMessages.id, messageId));
  // The first wording is kept for audits.
  await db.insert(schema.auditLog).values({ userId: user.id, action: "chat:edit", entity: "chat_message", entityId: `${messageId}:${found.message.body.slice(0, 200)}` });
  await announce(user.agencyId, { t: "update", c: found.message.chatId, m: messageId });
  return { ok: true };
}

/* "For me" hides it from this person only. "For everyone" hides it from all; the text stays for audits. */
export async function deleteMessage(user: SessionUser, messageId: string, scope: "me" | "everyone"): Promise<Result> {
  const found = await oneMessage(user, messageId);
  if (!found) return fail(404, "That message is not in your chats.");
  if (scope === "me") {
    await db.insert(schema.chatMessageMarks).values({ messageId, userId: user.id, mark: "hidden" }).onConflictDoNothing();
    return { ok: true };
  }
  const own = found.message.senderId === user.id;
  const hours = (await getSettings()).chat_delete_hours;
  const inTime = Date.now() - found.message.createdAt.getTime() <= hours * 3_600_000;
  if (!canManage(user) && !(own && inTime)) return fail(403, own ? `Messages can be deleted for everyone for ${hours} hours after sending.` : "You can only delete your own messages.");
  await db.update(schema.chatMessages).set({ deletedAt: new Date(), pinnedAt: null, pinnedBy: null }).where(and(eq(schema.chatMessages.id, messageId), isNull(schema.chatMessages.deletedAt)));
  await db.insert(schema.auditLog).values({ userId: user.id, action: own ? "chat:delete" : "chat:remove", entity: "chat_message", entityId: messageId });
  await announce(user.agencyId, { t: "update", c: found.message.chatId, m: messageId });
  return { ok: true };
}

export async function reactTo(user: SessionUser, messageId: string, emoji: string | null): Promise<Result> {
  const found = await oneMessage(user, messageId);
  if (!found || found.message.deletedAt) return fail(404, "That message is not in your chats.");
  if (emoji === null) await db.delete(schema.chatReactions).where(and(eq(schema.chatReactions.messageId, messageId), eq(schema.chatReactions.userId, user.id)));
  else {
    const value = [...emoji].slice(0, 2).join("").slice(0, 16);
    if (!value.trim()) return fail(400, "Choose a reaction.");
    await db.insert(schema.chatReactions).values({ messageId, userId: user.id, emoji: value }).onConflictDoUpdate({ target: [schema.chatReactions.messageId, schema.chatReactions.userId], set: { emoji: value, createdAt: new Date() } });
  }
  await announce(user.agencyId, { t: "update", c: found.message.chatId, m: messageId });
  return { ok: true };
}

export async function pinMessage(user: SessionUser, messageId: string, pinned: boolean): Promise<Result> {
  const found = await oneMessage(user, messageId);
  if (!found || found.message.deletedAt) return fail(404, "That message is not in your chats.");
  if (found.chat.kind !== "direct" && found.member.role !== "admin" && !canManage(user)) return fail(403, "Group admins pin messages.");
  await db.update(schema.chatMessages).set(pinned ? { pinnedAt: new Date(), pinnedBy: user.id } : { pinnedAt: null, pinnedBy: null }).where(eq(schema.chatMessages.id, messageId));
  await announce(user.agencyId, { t: "update", c: found.message.chatId, m: messageId });
  return { ok: true };
}

export async function starMessage(user: SessionUser, messageId: string, starred: boolean): Promise<Result> {
  const found = await oneMessage(user, messageId);
  if (!found) return fail(404, "That message is not in your chats.");
  if (starred) await db.insert(schema.chatMessageMarks).values({ messageId, userId: user.id, mark: "starred" }).onConflictDoNothing();
  else await db.delete(schema.chatMessageMarks).where(and(eq(schema.chatMessageMarks.messageId, messageId), eq(schema.chatMessageMarks.userId, user.id), eq(schema.chatMessageMarks.mark, "starred")));
  return { ok: true };
}

/* Who has read and received one of your messages, for "Message info". */
export async function messageInfo(user: SessionUser, messageId: string) {
  const found = await oneMessage(user, messageId);
  if (!found) return null;
  const at = found.message.createdAt.getTime();
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, read: schema.chatMembers.lastReadAt, delivered: schema.chatMembers.lastDeliveredAt })
    .from(schema.chatMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatMembers.userId))
    .where(and(eq(schema.chatMembers.chatId, found.message.chatId), sql`${schema.chatMembers.userId} <> ${found.message.senderId ?? user.id}`))
    .orderBy(asc(schema.users.name));
  return {
    readBy: rows.filter(row => (row.read?.getTime() ?? 0) >= at).map(row => ({ id: row.id, name: row.name, at: row.read })),
    deliveredTo: rows.filter(row => (row.read?.getTime() ?? 0) < at && (row.delivered?.getTime() ?? 0) >= at).map(row => ({ id: row.id, name: row.name, at: row.delivered })),
    waiting: rows.filter(row => (row.delivered?.getTime() ?? 0) < at).map(row => ({ id: row.id, name: row.name })),
  };
}

/* ---------- Your own view of a chat ---------- */

export async function markRead(user: SessionUser, chatId: string): Promise<Result> {
  const found = await membership(user, chatId);
  if (!found) return fail(404, "That chat is not yours.");
  const now = new Date();
  await db.update(schema.chatMembers).set({ lastReadAt: now, lastDeliveredAt: now }).where(eq(schema.chatMembers.id, found.member.id));
  await announce(user.agencyId, { t: "receipt", c: chatId, u: user.id });
  return { ok: true };
}

/* Everything sent to this person so far has reached a phone or browser of theirs. */
export async function markDelivered(user: SessionUser) {
  const changed = await db
    .update(schema.chatMembers)
    .set({ lastDeliveredAt: new Date() })
    .where(and(eq(schema.chatMembers.userId, user.id), sql`exists (select 1 from chats c where c.id = ${schema.chatMembers.chatId} and c.last_message_at > coalesce(${schema.chatMembers.lastDeliveredAt}, 'epoch'))`))
    .returning({ chatId: schema.chatMembers.chatId });
  for (const row of changed) await announce(user.agencyId, { t: "receipt", c: row.chatId, u: user.id });
  return { ok: true as const };
}

export async function chatPreferences(user: SessionUser, chatId: string, input: { mutedHours?: number | null; archived?: boolean; pinned?: boolean }): Promise<Result> {
  const found = await membership(user, chatId);
  if (!found) return fail(404, "That chat is not yours.");
  const set: Partial<typeof schema.chatMembers.$inferInsert> = {};
  if (input.mutedHours !== undefined) set.mutedUntil = input.mutedHours === null ? null : new Date(Date.now() + Math.min(Math.max(input.mutedHours, 0), 24 * 365 * 10) * 3_600_000);
  if (input.archived !== undefined) set.archived = input.archived;
  if (input.pinned !== undefined) set.pinned = input.pinned;
  if (Object.keys(set).length) await db.update(schema.chatMembers).set(set).where(eq(schema.chatMembers.id, found.member.id));
  return { ok: true };
}

export async function typing(user: SessionUser, chatId: string) {
  const found = await membership(user, chatId);
  if (found) await announce(user.agencyId, { t: "typing", c: chatId, u: user.id, n: user.name.split(" ")[0] });
}

/* ---------- Groups ---------- */

export async function updateGroup(user: SessionUser, chatId: string, input: { title?: string; about?: string }): Promise<Result> {
  const found = await membership(user, chatId);
  if (!found || found.chat.kind !== "group") return fail(404, "That group is not yours.");
  if (found.member.role !== "admin" && !canManage(user)) return fail(403, "Group admins change the name and description.");
  const set: Partial<typeof schema.chats.$inferInsert> = {};
  if (input.title !== undefined) {
    const title = input.title.trim().slice(0, 80);
    if (title.length < 2) return fail(400, "Give the group a name.");
    set.title = title;
  }
  if (input.about !== undefined) set.about = input.about.trim().slice(0, 500);
  if (!Object.keys(set).length) return { ok: true };
  await db.update(schema.chats).set(set).where(eq(schema.chats.id, chatId));
  if (set.title && set.title !== found.chat.title) await systemLine(user, chatId, `${user.name} renamed the group to "${set.title}".`);
  await announce(user.agencyId, { t: "chat", c: chatId });
  return { ok: true };
}

export async function changeMembers(user: SessionUser, chatId: string, input: { add?: string[]; remove?: string[]; admin?: string[]; dismiss?: string[]; leave?: boolean }): Promise<Result> {
  const found = await membership(user, chatId);
  if (!found) return fail(404, "That chat is not yours.");
  const { chat } = found;
  if (input.leave) {
    if (chat.kind !== "group") return fail(400, "You stay in home groups and Announcements while you work here.");
    await db.delete(schema.chatMembers).where(eq(schema.chatMembers.id, found.member.id));
    // A group is never left without an admin.
    const admins = await db.select({ id: schema.chatMembers.id }).from(schema.chatMembers).where(and(eq(schema.chatMembers.chatId, chatId), eq(schema.chatMembers.role, "admin"))).limit(1);
    if (!admins.length) {
      const [next] = await db.select({ id: schema.chatMembers.id }).from(schema.chatMembers).where(eq(schema.chatMembers.chatId, chatId)).orderBy(asc(schema.chatMembers.joinedAt)).limit(1);
      if (next) await db.update(schema.chatMembers).set({ role: "admin" }).where(eq(schema.chatMembers.id, next.id));
    }
    await systemLine(user, chatId, `${user.name} left.`);
    await announce(user.agencyId, { t: "members", c: chatId, users: [user.id] });
    return { ok: true };
  }
  if (!mayManageMembers(user, chat.kind, found.member.role)) return fail(403, "Group admins add and remove people.");
  const add = [...new Set(input.add ?? [])];
  const valid = add.length ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(and(inArray(schema.users.id, add), eq(schema.users.active, true))) : [];
  if (valid.length) {
    await db.insert(schema.chatMembers).values(valid.map(row => ({ chatId, userId: row.id }))).onConflictDoNothing();
    await systemLine(user, chatId, `${user.name} added ${valid.map(row => row.name).join(", ")}.`);
  }
  const remove = (input.remove ?? []).filter(id => id !== user.id);
  if (remove.length) {
    const names = await db.select({ name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, remove));
    await db.delete(schema.chatMembers).where(and(eq(schema.chatMembers.chatId, chatId), inArray(schema.chatMembers.userId, remove)));
    if (names.length) await systemLine(user, chatId, `${user.name} removed ${names.map(row => row.name).join(", ")}.`);
  }
  if (input.admin?.length && chat.kind === "group") {
    const promoted = await db.update(schema.chatMembers).set({ role: "admin" }).where(and(eq(schema.chatMembers.chatId, chatId), inArray(schema.chatMembers.userId, input.admin), eq(schema.chatMembers.role, "member"))).returning({ userId: schema.chatMembers.userId });
    const names = promoted.length ? await db.select({ name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, promoted.map(row => row.userId))) : [];
    if (names.length) await systemLine(user, chatId, `${user.name} made ${names.map(row => row.name).join(", ")} a group admin.`);
  }
  // Dismissing an admin never leaves a group without one.
  if (input.dismiss?.length && chat.kind === "group") {
    const admins = await db.select({ userId: schema.chatMembers.userId }).from(schema.chatMembers).where(and(eq(schema.chatMembers.chatId, chatId), eq(schema.chatMembers.role, "admin")));
    const dismiss = input.dismiss.filter(id => admins.some(row => row.userId === id));
    if (dismiss.length >= admins.length) return fail(400, "A group needs at least one admin. Make someone else an admin first.");
    if (dismiss.length) await db.update(schema.chatMembers).set({ role: "member" }).where(and(eq(schema.chatMembers.chatId, chatId), inArray(schema.chatMembers.userId, dismiss)));
  }
  await announce(user.agencyId, { t: "members", c: chatId, users: [...valid.map(row => row.id), ...remove, ...(input.admin ?? []), ...(input.dismiss ?? [])] });
  return { ok: true };
}

/* ---------- Polls ---------- */

/* A question with 2 to 12 choices, in a group. The agency decides who may start one. */
export async function createPoll(user: SessionUser, chatId: string, input: { question: string; options: string[]; multiple: boolean }): Promise<Result<{ message: ChatMessageView }>> {
  const found = await membership(user, chatId);
  if (!found) return fail(404, "That chat is not yours.");
  if (!groupRule((await getSettings()).chat_polls, user, found.chat.kind, found.member.role)) return fail(403, found.chat.kind === "direct" ? "Polls are for groups." : "You can't start a poll in this chat.");
  const question = input.question.trim().slice(0, 300);
  if (!question) return fail(400, "Write the question.");
  const texts = [...new Set(input.options.map(option => option.trim().slice(0, 100)).filter(Boolean))];
  if (texts.length < 2) return fail(400, "Give at least two different choices.");
  if (texts.length > 12) return fail(400, "A poll can have up to 12 choices.");
  return sendMessage(user, chatId, { body: question }, undefined, { options: texts.map((text, index) => ({ id: `o${index + 1}`, text })), multiple: input.multiple });
}

/* Your choices in a poll replace any you made before. No choices takes your vote back. */
export async function votePoll(user: SessionUser, messageId: string, optionIds: string[]): Promise<Result> {
  const found = await oneMessage(user, messageId);
  const poll = found?.message.poll;
  if (!found || !poll || found.message.deletedAt) return fail(404, "That poll is not in your chats.");
  if (poll.closedAt) return fail(400, "This poll is closed.");
  const chosen = [...new Set(optionIds)].filter(option => poll.options.some(item => item.id === option)).slice(0, poll.multiple ? poll.options.length : 1);
  await db.delete(schema.chatPollVotes).where(and(eq(schema.chatPollVotes.messageId, messageId), eq(schema.chatPollVotes.userId, user.id)));
  if (chosen.length) await db.insert(schema.chatPollVotes).values(chosen.map(optionId => ({ messageId, userId: user.id, optionId }))).onConflictDoNothing();
  await announce(user.agencyId, { t: "update", c: found.message.chatId, m: messageId });
  return { ok: true };
}

/* The person who started the poll, or a manager, closes it; the results stay. */
export async function closePoll(user: SessionUser, messageId: string): Promise<Result> {
  const found = await oneMessage(user, messageId);
  const poll = found?.message.poll;
  if (!found || !poll || found.message.deletedAt) return fail(404, "That poll is not in your chats.");
  if (found.message.senderId !== user.id && !canManage(user)) return fail(403, "The person who started the poll closes it.");
  if (!poll.closedAt) {
    await db.update(schema.chatMessages).set({ poll: { ...poll, closedAt: new Date().toISOString(), closedBy: user.id } }).where(eq(schema.chatMessages.id, messageId));
    await announce(user.agencyId, { t: "update", c: found.message.chatId, m: messageId });
  }
  return { ok: true };
}

/* ---------- Photos, files and voice notes ---------- */

export async function sendAttachment(user: SessionUser, chatId: string, body: Buffer, contentType: string, meta: { name?: string; durationMs?: number; caption?: string; replyToId?: string | null; voice?: boolean }): Promise<Result<{ message: ChatMessageView }>> {
  if ((await getSettings()).chat_attachments !== "on") return fail(403, "Photos, files and voice notes are switched off in chat.");
  const found = await membership(user, chatId);
  if (!found) return fail(404, "That chat is not yours.");
  const type = contentType.split(";")[0].trim().toLowerCase();
  const kind: "image" | "voice" | "file" = meta.voice ? "voice" : IMAGE_TYPES[type] ? "image" : "file";
  const ext = kind === "voice" ? VOICE_TYPES[type] : FILE_TYPES[type];
  if (!ext) return fail(415, kind === "voice" ? "That recording format is not supported." : "Send a photo, PDF, Word, Excel, PowerPoint or text file.");
  if (!body.length || body.length > env.MAX_UPLOAD_MB * 1024 * 1024) return fail(413, `Files can be up to ${env.MAX_UPLOAD_MB} MB.`);
  const key = await agencyKey(`chat/${chatId}/${randomUUID()}.${ext}`);
  await storage().put(key, body, type);
  const name = (meta.name ?? "").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || (kind === "voice" ? "Voice note" : kind === "image" ? "Photo" : "File");
  const data = { key, contentType: type, size: body.length, name, ...(meta.durationMs ? { durationMs: Math.round(meta.durationMs) } : {}) };
  return sendMessage(user, chatId, { body: meta.caption, replyToId: meta.replyToId }, { kind, data });
}

/* A message's file, for a member of its chat. */
export async function attachmentFile(user: SessionUser, messageId: string) {
  const found = await oneMessage(user, messageId);
  if (!found?.message.attachment || found.message.deletedAt) return null;
  const file = await storage().read(found.message.attachment.key);
  return { ...file, contentType: found.message.attachment.contentType, name: found.message.attachment.name };
}

/* ---------- Search, starred, export ---------- */

export async function searchMessages(user: SessionUser, query: string) {
  const term = query.trim().slice(0, 100);
  if (term.length < 2) return [];
  const m = schema.chatMessages;
  const rows = await db
    .select({ id: m.id, chatId: m.chatId, body: m.body, at: m.createdAt, sender: schema.users.name, chatTitle: schema.chats.title, chatKind: schema.chats.kind })
    .from(m)
    .innerJoin(schema.chatMembers, and(eq(schema.chatMembers.chatId, m.chatId), eq(schema.chatMembers.userId, user.id)))
    .innerJoin(schema.chats, eq(schema.chats.id, m.chatId))
    .leftJoin(schema.users, eq(schema.users.id, m.senderId))
    .where(and(isNull(m.deletedAt), sql`${m.kind} <> 'system'`, or(ilike(m.body, `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`))))
    .orderBy(desc(m.createdAt))
    .limit(50);
  return rows;
}

export async function starredMessages(user: SessionUser) {
  const m = schema.chatMessages;
  return db
    .select({ id: m.id, chatId: m.chatId, body: m.body, kind: m.kind, at: m.createdAt, sender: schema.users.name, chatTitle: schema.chats.title })
    .from(schema.chatMessageMarks)
    .innerJoin(m, eq(m.id, schema.chatMessageMarks.messageId))
    .innerJoin(schema.chats, eq(schema.chats.id, m.chatId))
    .innerJoin(schema.chatMembers, and(eq(schema.chatMembers.chatId, m.chatId), eq(schema.chatMembers.userId, user.id)))
    .leftJoin(schema.users, eq(schema.users.id, m.senderId))
    .where(and(eq(schema.chatMessageMarks.userId, user.id), eq(schema.chatMessageMarks.mark, "starred"), isNull(m.deletedAt)))
    .orderBy(desc(schema.chatMessageMarks.createdAt))
    .limit(100);
}

/* The whole chat as text, deleted messages included, for an audit or an investigation. Administrators only; every export is logged. */
export async function exportChat(user: SessionUser, chatId: string): Promise<Result<{ name: string; text: string }>> {
  if (user.role !== "admin") return fail(403, "Administrators export chats.");
  const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId)).limit(1);
  if (!chat) return fail(404, "That chat is not on record.");
  const members = await db.select({ name: schema.users.name }).from(schema.chatMembers).innerJoin(schema.users, eq(schema.users.id, schema.chatMembers.userId)).where(eq(schema.chatMembers.chatId, chatId)).orderBy(asc(schema.users.name));
  const messages = await db
    .select({ message: schema.chatMessages, sender: schema.users.name })
    .from(schema.chatMessages)
    .leftJoin(schema.users, eq(schema.users.id, schema.chatMessages.senderId))
    .where(eq(schema.chatMessages.chatId, chatId))
    .orderBy(asc(schema.chatMessages.createdAt));
  const pollIds = messages.filter(row => row.message.kind === "poll").map(row => row.message.id);
  const votes = pollIds.length ? await db.select({ messageId: schema.chatPollVotes.messageId, optionId: schema.chatPollVotes.optionId, name: schema.users.name }).from(schema.chatPollVotes).innerJoin(schema.users, eq(schema.users.id, schema.chatPollVotes.userId)).where(inArray(schema.chatPollVotes.messageId, pollIds)) : [];
  // A poll's line ends with each choice, its votes and who chose it.
  const results = (message: typeof schema.chatMessages.$inferSelect) => {
    if (!message.poll) return "";
    const lines = message.poll.options.map(option => {
      const who = votes.filter(vote => vote.messageId === message.id && vote.optionId === option.id).map(vote => vote.name);
      return `${option.text}: ${who.length}${who.length ? ` (${who.join(", ")})` : ""}`;
    });
    return ` | ${lines.join("; ")}${message.poll.closedAt ? " [closed]" : ""}`;
  };
  const title = chat.kind === "direct" ? members.map(member => member.name).join(" and ") : chat.title;
  const lines = [
    `Chat: ${title}`,
    `Members now: ${members.map(member => member.name).join(", ")}`,
    `Exported ${new Date().toISOString()} by ${user.name}. Times are UTC.`,
    "",
    ...messages.map(({ message, sender }) => {
      const when = message.createdAt.toISOString().replace("T", " ").slice(0, 19);
      const what = [message.attachment ? `[${message.kind}: ${message.attachment.name}]` : "", message.kind === "poll" ? "[poll]" : "", message.body].filter(Boolean).join(" ") + results(message);
      const notes = [message.forwarded ? "forwarded" : "", message.editedAt ? `edited ${message.editedAt.toISOString().slice(0, 19)}` : "", message.deletedAt ? `deleted ${message.deletedAt.toISOString().slice(0, 19)}` : ""].filter(Boolean);
      return `[${when}] ${message.kind === "system" ? "*" : (sender ?? "Former colleague")}: ${what}${notes.length ? ` (${notes.join(", ")})` : ""}`;
    }),
  ];
  await db.insert(schema.auditLog).values({ userId: user.id, action: "chat:export", entity: "chat", entityId: chatId });
  return { ok: true, name: `chat-${title.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.txt`, text: lines.join("\n") };
}

/* The live connection reports someone present; "online" lasts a little over a minute without it. */
export async function seen(userIds: string[]) {
  if (userIds.length) await db.update(schema.users).set({ lastSeenAt: new Date() }).where(inArray(schema.users.id, userIds));
}
