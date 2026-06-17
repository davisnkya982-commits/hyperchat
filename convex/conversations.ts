// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { compactUser, directConversationId } from "./ids";
import { getUserByPublicId, requireUserByToken } from "./authSessions";
import { ensureConversationSummary, getRoomById, hydrateRoom, parseDirectConversation } from "./chatHelpers";

const hydrateSummary = async (ctx: any, summary: any, viewerId: string) => {
  const preference = await ctx.db
    .query("conversationpreferences")
    .withIndex("by_user_conversation", (q: any) => q.eq("userId", viewerId).eq("conversationId", summary.conversationId))
    .first();

  if (summary.type === "direct") {
    const otherId = parseDirectConversation(summary.conversationId).find((id) => id !== viewerId);
    const other = await getUserByPublicId(ctx, otherId);
    return {
      ...summary,
      _id: summary.conversationId,
      id: summary.conversationId,
      title: other?.fullName || "Unknown",
      directUserId: other?.publicId || otherId,
      user: compactUser(other),
      pinned: Boolean(preference?.pinned),
      muted: Boolean(preference?.muted),
      archived: Boolean(preference?.archived),
    };
  }

  const room = await getRoomById(ctx, summary.conversationId);
  return {
    ...summary,
    _id: summary.conversationId,
    id: summary.conversationId,
    title: room?.name || "Room",
    room: await hydrateRoom(ctx, room, viewerId),
    pinned: Boolean(preference?.pinned),
    muted: Boolean(preference?.muted),
    archived: Boolean(preference?.archived),
  };
};

export const list = query({
  args: {
    authToken: v.string(),
    includeArchived: v.optional(v.boolean()),
    type: v.optional(v.union(v.literal("direct"), v.literal("room"))),
  },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const summaries = await ctx.db
      .query("conversationsummaries")
      .withIndex("by_user", (q: any) => q.eq("userId", viewer.publicId))
      .collect();
    const hydrated = await Promise.all(summaries.map((summary: any) => hydrateSummary(ctx, summary, viewer.publicId)));
    return hydrated
      .filter((summary: any) => (args.type ? summary.type === args.type : true))
      .filter((summary: any) => (args.includeArchived ? true : !summary.archived))
      .sort((a: any, b: any) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return Number(b.lastMessageAt || b.updatedAt || 0) - Number(a.lastMessageAt || a.updatedAt || 0);
      });
  },
});

export const getDirect = query({
  args: { authToken: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const other = await getUserByPublicId(ctx, args.userId);
    if (!other) return null;
    const conversationId = directConversationId(viewer.publicId, other.publicId);
    const summary = await ensureConversationSummary(ctx, viewer.publicId, conversationId, "direct");
    return await hydrateSummary(ctx, summary, viewer.publicId);
  },
});

export const setPreference = mutation({
  args: {
    authToken: v.string(),
    conversationId: v.string(),
    pinned: v.optional(v.boolean()),
    muted: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const existing = await ctx.db
      .query("conversationpreferences")
      .withIndex("by_user_conversation", (q: any) => q.eq("userId", viewer.publicId).eq("conversationId", args.conversationId))
      .first();
    const at = Date.now();
    const patch: any = { updatedAt: at };
    if (args.pinned !== undefined) {
      patch.pinned = args.pinned;
      patch.pinnedAt = args.pinned ? at : undefined;
    }
    if (args.muted !== undefined) {
      patch.muted = args.muted;
      patch.mutedUntil = undefined;
    }
    if (args.archived !== undefined) {
      patch.archived = args.archived;
      patch.archivedAt = args.archived ? at : undefined;
    }
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("conversationpreferences", {
        preferenceId: `pref_${at}_${Math.random().toString(36).slice(2, 8)}`,
        userId: viewer.publicId,
        conversationId: args.conversationId,
        pinned: Boolean(args.pinned),
        muted: Boolean(args.muted),
        archived: Boolean(args.archived),
        pinnedAt: args.pinned ? at : undefined,
        archivedAt: args.archived ? at : undefined,
        createdAt: at,
        updatedAt: at,
      });
    }
    return { ok: true };
  },
});
