// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { compactUser, defaultUserSettings, normalizeText } from "./ids";
import { getUserByPublicId, requireUserByToken } from "./authSessions";

export const current = query({
  args: { authToken: v.string() },
  handler: async (ctx, args) => compactUser(await requireUserByToken(ctx, args.authToken)),
});

export const list = query({
  args: {
    authToken: v.string(),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const search = normalizeText(args.search).toLowerCase();
    const users = await ctx.db.query("users").collect();
    return users
      .filter((user: any) => user.publicId !== viewer.publicId)
      .filter((user: any) => {
        if (!search) return true;
        return [user.fullName, user.username, user.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .slice(0, 50)
      .map(compactUser);
  },
});

export const getByPublicId = query({
  args: { authToken: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    await requireUserByToken(ctx, args.authToken);
    const user = await getUserByPublicId(ctx, args.userId);
    if (!user) return null;
    return compactUser(user);
  },
});

export const updateProfile = mutation({
  args: {
    authToken: v.string(),
    updates: v.object({
      fullName: v.optional(v.string()),
      username: v.optional(v.string()),
      bio: v.optional(v.string()),
      status: v.optional(v.string()),
      avatarColor: v.optional(v.string()),
      profilePic: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireUserByToken(ctx, args.authToken);
    const patch: any = { updatedAt: Date.now() };
    if (args.updates.fullName !== undefined) {
      const fullName = normalizeText(args.updates.fullName);
      if (fullName.length < 2) throw new Error("Name must be at least 2 characters");
      patch.fullName = fullName;
    }
    if (args.updates.username !== undefined) {
      const username = normalizeText(args.updates.username)
        .toLowerCase()
        .replace(/^@+/, "")
        .replace(/[^a-z0-9_.-]/g, "")
        .slice(0, 32);
      if (username) {
        const existing = await ctx.db
          .query("users")
          .withIndex("by_username", (q: any) => q.eq("username", username))
          .first();
        if (existing && existing.publicId !== user.publicId) throw new Error("Username already taken");
      }
      patch.username = username;
    }
    ["bio", "status", "avatarColor", "profilePic"].forEach((field) => {
      if (args.updates[field] !== undefined) patch[field] = normalizeText(args.updates[field]).slice(0, 240);
    });
    await ctx.db.patch(user._id, patch);
    return compactUser(await ctx.db.get(user._id));
  },
});

export const updateSettings = mutation({
  args: {
    authToken: v.string(),
    settings: v.object({
      readReceipts: v.optional(v.boolean()),
      typingIndicator: v.optional(v.boolean()),
      notifications: v.optional(v.boolean()),
      lastSeen: v.optional(v.boolean()),
      profilePhoto: v.optional(v.boolean()),
      theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
      density: v.optional(v.union(v.literal("compact"), v.literal("comfortable"))),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireUserByToken(ctx, args.authToken);
    const nextSettings = {
      ...defaultUserSettings(),
      ...(user.settings || {}),
      ...args.settings,
    };
    await ctx.db.patch(user._id, { settings: nextSettings, updatedAt: Date.now() });
    return compactUser(await ctx.db.get(user._id));
  },
});

