// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { compactUser, defaultUserSettings, normalizeText } from "./ids";
import { getUserByPublicId, requireUserByToken } from "./authSessions";

const avatarStyles = ["adventurer-neutral", "adventurer", "avataaars", "avataaars-neutral", "open-peeps", "thumbs"];

const normalizeAvatarStyle = (value?: string) => {
  const next = normalizeText(value);
  return avatarStyles.includes(next) ? next : "adventurer-neutral";
};

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
      avatarSeed: v.optional(v.string()),
      avatarStyle: v.optional(v.string()),
      profileBackdrop: v.optional(v.string()),
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
    if (args.updates.bio !== undefined) patch.bio = normalizeText(args.updates.bio).slice(0, 1000);
    if (args.updates.status !== undefined) patch.status = normalizeText(args.updates.status).slice(0, 120);
    if (args.updates.avatarColor !== undefined) patch.avatarColor = normalizeText(args.updates.avatarColor).slice(0, 24);
    if (args.updates.profilePic !== undefined) patch.profilePic = normalizeText(args.updates.profilePic).slice(0, 1000);
    if (args.updates.profileBackdrop !== undefined) patch.profileBackdrop = normalizeText(args.updates.profileBackdrop).slice(0, 80);
    if (args.updates.avatarSeed !== undefined) {
      patch.avatarSeed = normalizeText(args.updates.avatarSeed).slice(0, 80);
      patch.settings = {
        ...defaultUserSettings(),
        ...(user.settings || {}),
        avatarSeed: patch.avatarSeed,
      };
    }
    if (args.updates.avatarStyle !== undefined) {
      patch.avatarStyle = normalizeAvatarStyle(args.updates.avatarStyle);
      patch.settings = {
        ...defaultUserSettings(),
        ...(patch.settings || user.settings || {}),
        avatarStyle: patch.avatarStyle,
      };
    }
    await ctx.db.patch(user._id, patch);
    return compactUser(await ctx.db.get(user._id));
  },
});

export const updateProfilePhoto = mutation({
  args: {
    authToken: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireUserByToken(ctx, args.authToken);
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Uploaded photo is not available");
    await ctx.db.patch(user._id, {
      profilePic: url,
      profilePicStorageId: args.storageId,
      updatedAt: Date.now(),
    });
    return compactUser(await ctx.db.get(user._id));
  },
});

export const clearProfilePhoto = mutation({
  args: { authToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUserByToken(ctx, args.authToken);
    await ctx.db.patch(user._id, {
      profilePic: "",
      profilePicStorageId: undefined,
      updatedAt: Date.now(),
    });
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
      accent: v.optional(v.string()),
      chatWallpaper: v.optional(v.string()),
      authBackground: v.optional(v.string()),
      avatarSeed: v.optional(v.string()),
      avatarStyle: v.optional(v.string()),
      showProfilePhoto: v.optional(v.boolean()),
      showBio: v.optional(v.boolean()),
      showStatus: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireUserByToken(ctx, args.authToken);
    const incoming = { ...args.settings };
    if (incoming.avatarSeed !== undefined) incoming.avatarSeed = normalizeText(incoming.avatarSeed).slice(0, 80);
    if (incoming.avatarStyle !== undefined) incoming.avatarStyle = normalizeAvatarStyle(incoming.avatarStyle);
    if (incoming.accent !== undefined) incoming.accent = normalizeText(incoming.accent).slice(0, 24);
    if (incoming.chatWallpaper !== undefined) incoming.chatWallpaper = normalizeText(incoming.chatWallpaper).slice(0, 80);
    if (incoming.authBackground !== undefined) incoming.authBackground = normalizeText(incoming.authBackground).slice(0, 80);
    const nextSettings = {
      ...defaultUserSettings(),
      ...(user.settings || {}),
      ...incoming,
    };
    const userPatch: any = { settings: nextSettings, updatedAt: Date.now() };
    if (incoming.avatarSeed !== undefined) userPatch.avatarSeed = incoming.avatarSeed;
    if (incoming.avatarStyle !== undefined) userPatch.avatarStyle = incoming.avatarStyle;
    await ctx.db.patch(user._id, userPatch);
    return compactUser(await ctx.db.get(user._id));
  },
});
