// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { compactUser } from "./ids";
import { getUserByPublicId, requireUserByToken } from "./authSessions";

const hydrateNotification = async (ctx: any, notification: any) => ({
  ...notification,
  _id: notification.notificationId,
  id: notification.notificationId,
  actor: compactUser(await getUserByPublicId(ctx, notification.actorId)),
});

export const list = query({
  args: { authToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const limit = Math.max(1, Math.min(80, Number(args.limit || 30)));
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", viewer.publicId))
      .collect();
    const window = rows.sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, limit);
    return await Promise.all(window.map((row: any) => hydrateNotification(ctx, row)));
  },
});

export const unreadCount = query({
  args: { authToken: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", viewer.publicId))
      .collect();
    return rows.filter((row: any) => row.isRead !== true).length;
  },
});

export const markRead = mutation({
  args: { authToken: v.string(), notificationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q: any) => q.eq("userId", viewer.publicId))
      .collect();
    const at = Date.now();
    for (const row of rows) {
      if (!args.notificationId || row.notificationId === args.notificationId) {
        await ctx.db.patch(row._id, { isRead: true, updatedAt: at });
      }
    }
    return { ok: true };
  },
});
