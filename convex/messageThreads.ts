// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { makeId, messagePreview, normalizeText } from "./ids";
import { requireUserByToken } from "./authSessions";
import {
  createNotification,
  getMessageById,
  getThreadById,
  getThreadByRootMessage,
  hydrateMessage,
  hydrateThreadReply,
  requireConversationAccess,
} from "./chatHelpers";

const attachmentValidator = v.object({
  storageId: v.optional(v.id("_storage")),
  url: v.optional(v.string()),
  name: v.string(),
  type: v.optional(v.string()),
  size: v.optional(v.number()),
});

const quoteValidator = v.object({
  messageId: v.optional(v.string()),
  text: v.optional(v.string()),
  senderId: v.optional(v.string()),
  createdAt: v.optional(v.number()),
});

const assertReplyBody = (text?: string, attachments?: any[]) => {
  const trimmed = normalizeText(text);
  if (!trimmed && (!Array.isArray(attachments) || attachments.length === 0)) {
    throw new Error("Type a reply first");
  }
  return trimmed;
};

const ensureThread = async (ctx: any, rootMessage: any, actor: any, participantIds: string[]) => {
  const existing = await getThreadByRootMessage(ctx, rootMessage.messageId);
  if (existing) return existing;
  const at = Date.now();
  const id = await ctx.db.insert("messagethreads", {
    threadId: makeId("thread"),
    rootMessageId: rootMessage.messageId,
    conversationType: rootMessage.conversationType,
    conversationId: rootMessage.conversationId,
    rootSenderId: rootMessage.senderId,
    createdBy: actor.publicId,
    replyCount: 0,
    participantIds: Array.from(new Set([actor.publicId, rootMessage.senderId, ...participantIds])).filter(Boolean),
    createdAt: at,
    updatedAt: at,
  });
  return await ctx.db.get(id);
};

const requireThreadAccess = async (ctx: any, actor: any, thread: any) => {
  const access = await requireConversationAccess(ctx, actor, thread.conversationType, thread.conversationId);
  return access;
};

export const listThreadReplies = query({
  args: {
    authToken: v.string(),
    rootMessageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const thread = args.threadId ? await getThreadById(ctx, args.threadId) : await getThreadByRootMessage(ctx, args.rootMessageId);
    const rootMessage = thread
      ? await getMessageById(ctx, thread.rootMessageId)
      : await getMessageById(ctx, args.rootMessageId);
    if (!rootMessage) throw new Error("Root message not found");
    if (thread) await requireThreadAccess(ctx, actor, thread);
    else await requireConversationAccess(ctx, actor, rootMessage.conversationType, rootMessage.conversationId);
    const replies = thread
      ? await ctx.db
        .query("threadmessages")
        .withIndex("by_thread", (q: any) => q.eq("threadId", thread.threadId))
        .collect()
      : [];
    const readState = thread
      ? await ctx.db
        .query("threadreadstates")
        .withIndex("by_user_thread", (q: any) => q.eq("userId", actor.publicId).eq("threadId", thread.threadId))
        .first()
      : null;
    return {
      thread: thread ? {
        ...thread,
        _id: thread.threadId,
        id: thread.threadId,
        threadReplyCount: thread.replyCount,
        threadUnreadCount: Number(thread.lastReplyAt || 0) > Number(readState?.lastReadAt || 0) ? 1 : 0,
      } : null,
      rootMessage: await hydrateMessage(ctx, rootMessage, actor.publicId),
      replies: await Promise.all(
        replies
          .sort((a: any, b: any) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
          .map((reply: any) => hydrateThreadReply(ctx, reply, actor.publicId))
      ),
    };
  },
});

export const sendThreadReply = mutation({
  args: {
    authToken: v.string(),
    rootMessageId: v.string(),
    text: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
    quotedMessage: v.optional(quoteValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const rootMessage = await getMessageById(ctx, args.rootMessageId);
    if (!rootMessage) throw new Error("Root message not found");
    const access = await requireConversationAccess(ctx, actor, rootMessage.conversationType, rootMessage.conversationId);
    const text = assertReplyBody(args.text, args.attachments);
    const participantIds = access.participantIds || [];
    const thread = await ensureThread(ctx, rootMessage, actor, participantIds);
    const at = Date.now();
    const replyId = makeId("reply");
    const docId = await ctx.db.insert("threadmessages", {
      messageId: replyId,
      threadId: thread.threadId,
      rootMessageId: rootMessage.messageId,
      senderId: actor.publicId,
      text,
      attachments: args.attachments || [],
      quotedMessage: args.quotedMessage,
      reactions: [],
      createdAt: at,
      updatedAt: at,
    });
    const reply = await ctx.db.get(docId);
    const nextParticipants = Array.from(new Set([...(thread.participantIds || []), actor.publicId, rootMessage.senderId, ...participantIds])).filter(Boolean);
    await ctx.db.patch(thread._id, {
      replyCount: Number(thread.replyCount || 0) + 1,
      lastReplyId: replyId,
      lastReplyAt: at,
      lastReplyPreview: messagePreview(reply),
      participantIds: nextParticipants,
      updatedAt: at,
    });
    await markThreadReadForUser(ctx, actor.publicId, thread.threadId, replyId);
    for (const userId of nextParticipants) {
      await createNotification(ctx, userId, actor.publicId, "thread_reply", {
        messageId: rootMessage.messageId,
        conversationId: rootMessage.conversationId,
        roomId: rootMessage.conversationType === "room" ? rootMessage.conversationId : undefined,
        threadId: thread.threadId,
        threadReplyId: replyId,
      }, { preview: messagePreview(reply) });
    }
    return {
      thread: await getThreadById(ctx, thread.threadId),
      reply: await hydrateThreadReply(ctx, reply, actor.publicId),
    };
  },
});

export const markThreadReadForUser = async (ctx: any, userId: string, threadId: string, lastReadReplyId?: string) => {
  const existing = await ctx.db
    .query("threadreadstates")
    .withIndex("by_user_thread", (q: any) => q.eq("userId", userId).eq("threadId", threadId))
    .first();
  const at = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { lastReadAt: at, lastReadReplyId, updatedAt: at });
  } else {
    await ctx.db.insert("threadreadstates", {
      readStateId: makeId("threadread"),
      threadId,
      userId,
      lastReadAt: at,
      lastReadReplyId,
      createdAt: at,
      updatedAt: at,
    });
  }
};

export const markThreadRead = mutation({
  args: { authToken: v.string(), threadId: v.string(), lastReadReplyId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const thread = await getThreadById(ctx, args.threadId);
    if (!thread) throw new Error("Thread not found");
    await requireThreadAccess(ctx, actor, thread);
    await markThreadReadForUser(ctx, actor.publicId, thread.threadId, args.lastReadReplyId);
    return { ok: true };
  },
});

export const editThreadReply = mutation({
  args: { authToken: v.string(), threadId: v.string(), messageId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const thread = await getThreadById(ctx, args.threadId);
    if (!thread) throw new Error("Thread not found");
    await requireThreadAccess(ctx, actor, thread);
    const reply = await ctx.db
      .query("threadmessages")
      .withIndex("by_messageId", (q: any) => q.eq("messageId", args.messageId))
      .first();
    if (!reply) throw new Error("Reply not found");
    if (reply.senderId !== actor.publicId) throw new Error("You can only edit your own replies");
    await ctx.db.patch(reply._id, { text: assertReplyBody(args.text, reply.attachments), edited: true, editedAt: Date.now(), updatedAt: Date.now() });
    return await hydrateThreadReply(ctx, await ctx.db.get(reply._id), actor.publicId);
  },
});

export const deleteThreadReply = mutation({
  args: { authToken: v.string(), threadId: v.string(), messageId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const thread = await getThreadById(ctx, args.threadId);
    if (!thread) throw new Error("Thread not found");
    await requireThreadAccess(ctx, actor, thread);
    const reply = await ctx.db
      .query("threadmessages")
      .withIndex("by_messageId", (q: any) => q.eq("messageId", args.messageId))
      .first();
    if (!reply) throw new Error("Reply not found");
    if (reply.senderId !== actor.publicId) throw new Error("You can only delete your own replies");
    await ctx.db.patch(reply._id, { text: "", attachments: [], senderDeleted: true, senderDeletedAt: Date.now(), updatedAt: Date.now() });
    return { ok: true };
  },
});

export const toggleThreadReaction = mutation({
  args: { authToken: v.string(), threadId: v.string(), messageId: v.string(), emoji: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const thread = await getThreadById(ctx, args.threadId);
    if (!thread) throw new Error("Thread not found");
    await requireThreadAccess(ctx, actor, thread);
    const reply = await ctx.db
      .query("threadmessages")
      .withIndex("by_messageId", (q: any) => q.eq("messageId", args.messageId))
      .first();
    if (!reply) throw new Error("Reply not found");
    const emoji = normalizeText(args.emoji).slice(0, 8);
    const existing = (reply.reactions || []).filter((entry: any) => !(entry.userId === actor.publicId && entry.emoji === emoji));
    const hadReaction = existing.length !== (reply.reactions || []).length;
    await ctx.db.patch(reply._id, {
      reactions: hadReaction ? existing : [...existing, { emoji, userId: actor.publicId, createdAt: Date.now() }],
      updatedAt: Date.now(),
    });
    return await hydrateThreadReply(ctx, await ctx.db.get(reply._id), actor.publicId);
  },
});
