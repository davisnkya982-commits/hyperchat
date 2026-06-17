// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { compactUser } from "./ids";
import { getUserByPublicId, requireUserByToken } from "./authSessions";
import { requireConversationAccess } from "./chatHelpers";

const ACTIVE_MS = 90 * 1000;
const TYPING_MS = 12 * 1000;

export const heartbeat = mutation({
  args: { authToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const at = Date.now();
    const existing = await ctx.db
      .query("userPresence")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.publicId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { isOnline: true, lastSeen: at, updatedAt: at });
    } else {
      await ctx.db.insert("userPresence", { userId: actor.publicId, isOnline: true, lastSeen: at, updatedAt: at });
    }
    await ctx.db.patch(actor._id, { lastSeen: at, updatedAt: at });
    return { ok: true, at };
  },
});

export const getUsersPresence = query({
  args: { authToken: v.string(), userIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUserByToken(ctx, args.authToken);
    const at = Date.now();
    const rows = await Promise.all(
      Array.from(new Set(args.userIds || [])).map(async (userId: string) => {
        const presence = await ctx.db
          .query("userPresence")
          .withIndex("by_user", (q: any) => q.eq("userId", userId))
          .first();
        const user = await getUserByPublicId(ctx, userId);
        return {
          userId,
          user: compactUser(user),
          isOnline: Boolean(presence?.isOnline) && at - Number(presence?.updatedAt || 0) <= ACTIVE_MS,
          lastSeen: presence?.lastSeen || user?.lastSeen || null,
        };
      })
    );
    return rows;
  },
});

export const setTyping = mutation({
  args: {
    authToken: v.string(),
    conversationType: v.union(v.literal("direct"), v.literal("room")),
    conversationId: v.string(),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    await requireConversationAccess(ctx, actor, args.conversationType, args.conversationId);
    const rows = await ctx.db
      .query("typingIndicators")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.publicId))
      .collect();
    for (const row of rows) {
      const matches = args.conversationType === "room"
        ? row.roomId === args.conversationId
        : row.conversationId === args.conversationId;
      if (matches) await ctx.db.delete(row._id);
    }
    if (args.isTyping) {
      await ctx.db.insert("typingIndicators", {
        userId: actor.publicId,
        conversationId: args.conversationType === "direct" ? args.conversationId : undefined,
        roomId: args.conversationType === "room" ? args.conversationId : undefined,
        timestamp: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const listTyping = query({
  args: {
    authToken: v.string(),
    conversationType: v.union(v.literal("direct"), v.literal("room")),
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    await requireConversationAccess(ctx, actor, args.conversationType, args.conversationId);
    const rows = args.conversationType === "room"
      ? await ctx.db.query("typingIndicators").withIndex("by_room", (q: any) => q.eq("roomId", args.conversationId)).collect()
      : await ctx.db.query("typingIndicators").withIndex("by_conversation", (q: any) => q.eq("conversationId", args.conversationId)).collect();
    const cutoff = Date.now() - TYPING_MS;
    const active = rows.filter((row: any) => row.userId !== actor.publicId && Number(row.timestamp || 0) >= cutoff);
    return await Promise.all(active.map(async (row: any) => ({
      ...row,
      user: compactUser(await getUserByPublicId(ctx, row.userId)),
    })));
  },
});
