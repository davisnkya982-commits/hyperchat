// @ts-nocheck
import { compactUser, defaultRoomSettings, directConversationId, makeId, messagePreview } from "./ids";
import { getUserByPublicId } from "./authSessions";

export const getMessageById = async (ctx: any, messageId?: string) => {
  const id = String(messageId || "").trim();
  if (!id) return null;
  return await ctx.db
    .query("messages")
    .withIndex("by_messageId", (q: any) => q.eq("messageId", id))
    .first();
};

export const getThreadById = async (ctx: any, threadId?: string) => {
  const id = String(threadId || "").trim();
  if (!id) return null;
  return await ctx.db
    .query("messagethreads")
    .withIndex("by_threadId", (q: any) => q.eq("threadId", id))
    .first();
};

export const getThreadByRootMessage = async (ctx: any, rootMessageId?: string) => {
  const id = String(rootMessageId || "").trim();
  if (!id) return null;
  return await ctx.db
    .query("messagethreads")
    .withIndex("by_rootMessage", (q: any) => q.eq("rootMessageId", id))
    .first();
};

export const getRoomById = async (ctx: any, roomId?: string) => {
  const id = String(roomId || "").trim();
  if (!id) return null;
  return await ctx.db
    .query("groups")
    .withIndex("by_roomId", (q: any) => q.eq("roomId", id))
    .first();
};

export const getRoomMembership = async (ctx: any, roomId?: string, userId?: string) => {
  const room = String(roomId || "").trim();
  const user = String(userId || "").trim();
  if (!room || !user) return null;
  return await ctx.db
    .query("groupmemberships")
    .withIndex("by_room_user", (q: any) => q.eq("roomId", room).eq("userId", user))
    .first();
};

export const requireRoomMembership = async (ctx: any, roomId: string, userId: string) => {
  const membership = await getRoomMembership(ctx, roomId, userId);
  if (!membership) throw new Error("You are not a member of this room");
  return membership;
};

export const getRoomMemberships = async (ctx: any, roomId: string) =>
  await ctx.db
    .query("groupmemberships")
    .withIndex("by_room", (q: any) => q.eq("roomId", roomId))
    .collect();

export const parseDirectConversation = (conversationId?: string) => {
  const value = String(conversationId || "");
  if (!value.startsWith("direct:")) return [];
  return value.slice("direct:".length).split(":").filter(Boolean);
};

export const requireDirectAccess = async (ctx: any, conversationId: string, userId: string) => {
  const participants = parseDirectConversation(conversationId);
  if (participants.length !== 2 || !participants.includes(userId)) {
    throw new Error("You cannot access this conversation");
  }
  const otherId = participants.find((id) => id !== userId);
  const other = await getUserByPublicId(ctx, otherId);
  if (!other) throw new Error("Conversation member no longer exists");
  return { participantIds: participants, other };
};

export const requireConversationAccess = async (
  ctx: any,
  actor: any,
  conversationType: "direct" | "room",
  conversationId: string
) => {
  if (conversationType === "direct") {
    return {
      type: "direct",
      ...(await requireDirectAccess(ctx, conversationId, actor.publicId)),
    };
  }
  const room = await getRoomById(ctx, conversationId);
  if (!room) throw new Error("Room not found");
  const membership = await requireRoomMembership(ctx, conversationId, actor.publicId);
  const memberships = await getRoomMemberships(ctx, conversationId);
  return {
    type: "room",
    room,
    membership,
    participantIds: memberships.map((entry: any) => entry.userId),
    memberships,
  };
};

export const ensureConversationSummary = async (
  ctx: any,
  userId: string,
  conversationId: string,
  type: "direct" | "room"
) => {
  const existing = await ctx.db
    .query("conversationsummaries")
    .withIndex("by_user_conversation", (q: any) => q.eq("userId", userId).eq("conversationId", conversationId))
    .first();
  if (existing) return existing;
  const at = Date.now();
  const id = await ctx.db.insert("conversationsummaries", {
    summaryId: makeId("summary"),
    userId,
    conversationId,
    type,
    unreadCount: 0,
    createdAt: at,
    updatedAt: at,
  });
  return await ctx.db.get(id);
};

export const updateConversationSummary = async (
  ctx: any,
  userId: string,
  conversationId: string,
  type: "direct" | "room",
  message: any,
  incrementUnread = false
) => {
  const summary = await ensureConversationSummary(ctx, userId, conversationId, type);
  await ctx.db.patch(summary._id, {
    lastMessage: {
      messageId: message.messageId,
      senderId: message.senderId,
      text: messagePreview(message),
      createdAt: message.createdAt,
      forwarded: Boolean(message.forwardedFrom),
      attachmentCount: Array.isArray(message.attachments) ? message.attachments.length : 0,
    },
    lastMessageAt: message.createdAt,
    unreadCount: incrementUnread ? Number(summary.unreadCount || 0) + 1 : Number(summary.unreadCount || 0),
    updatedAt: Date.now(),
  });
};

export const markConversationReadForUser = async (
  ctx: any,
  userId: string,
  conversationId: string,
  type: "direct" | "room",
  lastReadMessageId?: string
) => {
  const existing = await ctx.db
    .query("conversationreadstates")
    .withIndex("by_user_conversation", (q: any) => q.eq("userId", userId).eq("conversationId", conversationId))
    .first();
  const at = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      lastReadAt: at,
      lastReadMessageId,
      updatedAt: at,
    });
  } else {
    await ctx.db.insert("conversationreadstates", {
      readStateId: makeId("read"),
      userId,
      conversationId,
      type,
      lastReadAt: at,
      lastReadMessageId,
      createdAt: at,
      updatedAt: at,
    });
  }
  const summary = await ensureConversationSummary(ctx, userId, conversationId, type);
  await ctx.db.patch(summary._id, { unreadCount: 0, updatedAt: at });
};

export const createNotification = async (
  ctx: any,
  userId: string,
  actorId: string,
  type: "message" | "room_message" | "thread_reply",
  entity: any = {},
  meta: any = {}
) => {
  if (!userId || userId === actorId) return null;
  const at = Date.now();
  await ctx.db.insert("notifications", {
    notificationId: makeId("notice"),
    userId,
    actorId,
    type,
    entity,
    meta,
    isRead: false,
    createdAt: at,
    updatedAt: at,
  });
};

export const hydrateRoom = async (ctx: any, room: any, viewerId?: string) => {
  if (!room) return null;
  const memberships = await getRoomMemberships(ctx, room.roomId);
  const members = await Promise.all(
    memberships.map(async (membership: any) => ({
      ...membership,
      user: compactUser(await getUserByPublicId(ctx, membership.userId)),
    }))
  );
  const viewerMembership = memberships.find((entry: any) => entry.userId === viewerId) || null;
  return {
    ...room,
    _id: room.roomId,
    id: room.roomId,
    type: "room",
    settings: { ...defaultRoomSettings(), ...(room.settings || {}) },
    memberCount: memberships.length,
    viewerRole: viewerMembership?.role || null,
    members,
  };
};

export const hydrateMessage = async (ctx: any, message: any, viewerId?: string) => {
  if (!message) return null;
  const sender = await getUserByPublicId(ctx, message.senderId);
  const thread = await getThreadByRootMessage(ctx, message.messageId);
  let threadUnreadCount = 0;
  if (thread && viewerId && Number(thread.lastReplyAt || 0) > 0) {
    const readState = await ctx.db
      .query("threadreadstates")
      .withIndex("by_user_thread", (q: any) => q.eq("userId", viewerId).eq("threadId", thread.threadId))
      .first();
    if (Number(thread.lastReplyAt || 0) > Number(readState?.lastReadAt || 0)) {
      threadUnreadCount = 1;
    }
  }
  const attachments = await Promise.all((message.attachments || []).map(async (attachment: any) => ({
    ...attachment,
    url: attachment.url || (attachment.storageId ? await ctx.storage.getUrl(attachment.storageId) : undefined),
  })));
  return {
    ...message,
    attachments,
    _id: message.messageId,
    id: message.messageId,
    senderProfile: compactUser(sender),
    isOwn: viewerId ? message.senderId === viewerId : false,
    threadId: thread?.threadId,
    threadReplyCount: Number(thread?.replyCount || 0),
    threadLastReplyAt: thread?.lastReplyAt,
    threadUnreadCount,
  };
};

export const hydrateThreadReply = async (ctx: any, reply: any, viewerId?: string) => {
  if (!reply) return null;
  const sender = await getUserByPublicId(ctx, reply.senderId);
  const attachments = await Promise.all((reply.attachments || []).map(async (attachment: any) => ({
    ...attachment,
    url: attachment.url || (attachment.storageId ? await ctx.storage.getUrl(attachment.storageId) : undefined),
  })));
  return {
    ...reply,
    attachments,
    _id: reply.messageId,
    id: reply.messageId,
    senderProfile: compactUser(sender),
    isOwn: viewerId ? reply.senderId === viewerId : false,
  };
};

export const buildDirectConversationId = async (ctx: any, actorId: string, receiverId: string) => {
  const receiver = await getUserByPublicId(ctx, receiverId);
  if (!receiver) throw new Error("User not found");
  if (receiver.publicId === actorId) throw new Error("Pick someone else to message");
  return {
    conversationId: directConversationId(actorId, receiver.publicId),
    receiver,
  };
};
