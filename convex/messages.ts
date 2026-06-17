// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { makeId, messagePreview, normalizeText } from "./ids";
import { requireUserByToken } from "./authSessions";
import {
  buildDirectConversationId,
  createNotification,
  getMessageById,
  getRoomById,
  getRoomMemberships,
  hydrateMessage,
  markConversationReadForUser,
  requireConversationAccess,
  updateConversationSummary,
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

const forwardedFromValidator = v.object({
  messageId: v.optional(v.string()),
  senderId: v.optional(v.string()),
  conversationType: v.optional(v.union(v.literal("direct"), v.literal("room"))),
  conversationId: v.optional(v.string()),
  text: v.optional(v.string()),
  createdAt: v.optional(v.number()),
});

const assertMessageBody = (text?: string, attachments?: any[]) => {
  const trimmed = normalizeText(text);
  if (!trimmed && (!Array.isArray(attachments) || attachments.length === 0)) {
    throw new Error("Type a message first");
  }
  return trimmed;
};

const insertMessage = async (
  ctx: any,
  actor: any,
  conversationType: "direct" | "room",
  conversationId: string,
  participantIds: string[],
  payload: any = {}
) => {
  const text = assertMessageBody(payload.text, payload.attachments);
  const at = Date.now();
  const messageId = makeId("msg");
  const id = await ctx.db.insert("messages", {
    messageId,
    conversationType,
    conversationId,
    senderId: actor.publicId,
    receiverId: conversationType === "direct" ? participantIds.find((id: string) => id !== actor.publicId) : undefined,
    roomId: conversationType === "room" ? conversationId : undefined,
    text,
    attachments: payload.attachments || [],
    quotedMessage: payload.quotedMessage,
    forwardedFrom: payload.forwardedFrom,
    reactions: [],
    deliveredBy: participantIds
      .filter((id: string) => id !== actor.publicId)
      .map((userId: string) => ({ userId, deliveredAt: at })),
    readBy: [{ userId: actor.publicId, readAt: at, hiddenByPrivacy: actor.settings?.readReceipts === false }],
    createdAt: at,
    updatedAt: at,
  });
  const message = await ctx.db.get(id);

  for (const userId of participantIds) {
    await updateConversationSummary(
      ctx,
      userId,
      conversationId,
      conversationType,
      message,
      userId !== actor.publicId
    );
  }
  await markConversationReadForUser(ctx, actor.publicId, conversationId, conversationType, message.messageId);

  if (conversationType === "room") {
    const room = await getRoomById(ctx, conversationId);
    if (room) await ctx.db.patch(room._id, { lastMessageAt: at, updatedAt: at });
  }

  for (const userId of participantIds) {
    await createNotification(ctx, userId, actor.publicId, conversationType === "room" ? "room_message" : "message", {
      messageId,
      conversationId,
      roomId: conversationType === "room" ? conversationId : undefined,
    }, { preview: messagePreview(message) });
  }

  return await hydrateMessage(ctx, message, actor.publicId);
};

export const list = query({
  args: {
    authToken: v.string(),
    conversationType: v.union(v.literal("direct"), v.literal("room")),
    conversationId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    await requireConversationAccess(ctx, actor, args.conversationType, args.conversationId);
    const limit = Math.max(1, Math.min(200, Number(args.limit || 80)));
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q: any) => q.eq("conversationId", args.conversationId))
      .collect();
    const window = messages
      .sort((a: any, b: any) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .slice(-limit);
    return await Promise.all(window.map((message: any) => hydrateMessage(ctx, message, actor.publicId)));
  },
});

export const sendDirect = mutation({
  args: {
    authToken: v.string(),
    receiverId: v.string(),
    text: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
    quotedMessage: v.optional(quoteValidator),
    forwardedFrom: v.optional(forwardedFromValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const { conversationId, receiver } = await buildDirectConversationId(ctx, actor.publicId, args.receiverId);
    return await insertMessage(ctx, actor, "direct", conversationId, [actor.publicId, receiver.publicId], args);
  },
});

export const sendRoom = mutation({
  args: {
    authToken: v.string(),
    roomId: v.string(),
    text: v.optional(v.string()),
    attachments: v.optional(v.array(attachmentValidator)),
    quotedMessage: v.optional(quoteValidator),
    forwardedFrom: v.optional(forwardedFromValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const access = await requireConversationAccess(ctx, actor, "room", args.roomId);
    const room = access.room;
    if (room.settings?.onlyAdminsCanMessage && !["owner", "admin"].includes(access.membership.role)) {
      throw new Error("Only admins can message in this room");
    }
    const memberships = await getRoomMemberships(ctx, args.roomId);
    return await insertMessage(ctx, actor, "room", args.roomId, memberships.map((entry: any) => entry.userId), args);
  },
});

export const forwardMessage = mutation({
  args: {
    authToken: v.string(),
    messageId: v.string(),
    targetType: v.union(v.literal("direct"), v.literal("room")),
    targetUserId: v.optional(v.string()),
    targetRoomId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const source = await getMessageById(ctx, args.messageId);
    if (!source) throw new Error("Message not found");
    await requireConversationAccess(ctx, actor, source.conversationType, source.conversationId);
    const forwardedFrom = {
      messageId: source.messageId,
      senderId: source.senderId,
      conversationType: source.conversationType,
      conversationId: source.conversationId,
      text: messagePreview(source),
      createdAt: source.createdAt,
    };
    if (args.targetType === "direct") {
      const { conversationId, receiver } = await buildDirectConversationId(ctx, actor.publicId, args.targetUserId);
      return await insertMessage(ctx, actor, "direct", conversationId, [actor.publicId, receiver.publicId], {
        text: source.text || "Forwarded message",
        attachments: source.attachments || [],
        forwardedFrom,
      });
    }
    const access = await requireConversationAccess(ctx, actor, "room", args.targetRoomId);
    return await insertMessage(ctx, actor, "room", args.targetRoomId, access.participantIds, {
      text: source.text || "Forwarded message",
      attachments: source.attachments || [],
      forwardedFrom,
    });
  },
});

export const markConversationRead = mutation({
  args: {
    authToken: v.string(),
    conversationType: v.union(v.literal("direct"), v.literal("room")),
    conversationId: v.string(),
    lastReadMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    await requireConversationAccess(ctx, actor, args.conversationType, args.conversationId);
    await markConversationReadForUser(ctx, actor.publicId, args.conversationId, args.conversationType, args.lastReadMessageId);
    if (args.lastReadMessageId) {
      const message = await getMessageById(ctx, args.lastReadMessageId);
      if (message && !message.readBy?.some((entry: any) => entry.userId === actor.publicId)) {
        await ctx.db.patch(message._id, {
          readBy: [...(message.readBy || []), {
            userId: actor.publicId,
            readAt: Date.now(),
            hiddenByPrivacy: actor.settings?.readReceipts === false,
          }],
          updatedAt: Date.now(),
        });
      }
    }
    return { ok: true };
  },
});

export const edit = mutation({
  args: { authToken: v.string(), messageId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const message = await getMessageById(ctx, args.messageId);
    if (!message) throw new Error("Message not found");
    await requireConversationAccess(ctx, actor, message.conversationType, message.conversationId);
    if (message.senderId !== actor.publicId) throw new Error("You can only edit your own messages");
    const text = assertMessageBody(args.text, message.attachments);
    await ctx.db.patch(message._id, { text, edited: true, editedAt: Date.now(), updatedAt: Date.now() });
    return await hydrateMessage(ctx, await ctx.db.get(message._id), actor.publicId);
  },
});

export const remove = mutation({
  args: { authToken: v.string(), messageId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const message = await getMessageById(ctx, args.messageId);
    if (!message) throw new Error("Message not found");
    await requireConversationAccess(ctx, actor, message.conversationType, message.conversationId);
    if (message.senderId !== actor.publicId) throw new Error("You can only delete your own messages");
    await ctx.db.patch(message._id, {
      text: "",
      attachments: [],
      senderDeleted: true,
      senderDeletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const toggleReaction = mutation({
  args: { authToken: v.string(), messageId: v.string(), emoji: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const message = await getMessageById(ctx, args.messageId);
    if (!message) throw new Error("Message not found");
    await requireConversationAccess(ctx, actor, message.conversationType, message.conversationId);
    const emoji = normalizeText(args.emoji).slice(0, 8);
    if (!emoji) throw new Error("Pick a reaction");
    const existing = (message.reactions || []).filter((entry: any) => !(entry.userId === actor.publicId && entry.emoji === emoji));
    const hadReaction = existing.length !== (message.reactions || []).length;
    const next = hadReaction ? existing : [...existing, { emoji, userId: actor.publicId, createdAt: Date.now() }];
    await ctx.db.patch(message._id, { reactions: next, updatedAt: Date.now() });
    return await hydrateMessage(ctx, await ctx.db.get(message._id), actor.publicId);
  },
});
