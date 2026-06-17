// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { defaultRoomSettings, makeId, normalizeText } from "./ids";
import { getUserByPublicId, requireUserByToken } from "./authSessions";
import {
  ensureConversationSummary,
  getRoomById,
  getRoomMembership,
  getRoomMemberships,
  hydrateRoom,
  requireRoomMembership,
} from "./chatHelpers";

const roomColors = ["#0f766e", "#1d4ed8", "#7c3aed", "#be123c", "#a16207", "#475569"];

const requireRoomAdmin = async (ctx: any, roomId: string, userId: string) => {
  const membership = await requireRoomMembership(ctx, roomId, userId);
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Only room admins can do that");
  return membership;
};

const addMembership = async (ctx: any, roomId: string, userId: string, role = "member") => {
  if (!(await getUserByPublicId(ctx, userId))) throw new Error("User not found");
  const existing = await getRoomMembership(ctx, roomId, userId);
  if (existing) return existing;
  const at = Date.now();
  const id = await ctx.db.insert("groupmemberships", {
    membershipId: makeId("member"),
    roomId,
    userId,
    role,
    joinedAt: at,
    createdAt: at,
    updatedAt: at,
  });
  await ensureConversationSummary(ctx, userId, roomId, "room");
  return await ctx.db.get(id);
};

export const list = query({
  args: { authToken: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    const memberships = await ctx.db
      .query("groupmemberships")
      .withIndex("by_user", (q: any) => q.eq("userId", viewer.publicId))
      .collect();
    const rooms = await Promise.all(
      memberships.map(async (membership: any) => await hydrateRoom(ctx, await getRoomById(ctx, membership.roomId), viewer.publicId))
    );
    return rooms.filter(Boolean).sort((a: any, b: any) => Number(b.lastMessageAt || b.updatedAt) - Number(a.lastMessageAt || a.updatedAt));
  },
});

export const get = query({
  args: { authToken: v.string(), roomId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUserByToken(ctx, args.authToken);
    await requireRoomMembership(ctx, args.roomId, viewer.publicId);
    return await hydrateRoom(ctx, await getRoomById(ctx, args.roomId), viewer.publicId);
  },
});

export const create = mutation({
  args: {
    authToken: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    memberIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const owner = await requireUserByToken(ctx, args.authToken);
    const name = normalizeText(args.name);
    if (name.length < 2) throw new Error("Room name must be at least 2 characters");
    const at = Date.now();
    const roomId = makeId("room");
    const memberIds = Array.from(new Set([owner.publicId, ...(args.memberIds || [])])).filter(Boolean);
    const docId = await ctx.db.insert("groups", {
      roomId,
      name,
      description: normalizeText(args.description).slice(0, 240),
      ownerId: owner.publicId,
      adminIds: [owner.publicId],
      memberIds,
      avatarColor: roomColors[Math.floor(Math.random() * roomColors.length)],
      settings: defaultRoomSettings(),
      createdAt: at,
      updatedAt: at,
    });
    for (const userId of memberIds) {
      await addMembership(ctx, roomId, userId, userId === owner.publicId ? "owner" : "member");
    }
    return await hydrateRoom(ctx, await ctx.db.get(docId), owner.publicId);
  },
});

export const addMembers = mutation({
  args: { authToken: v.string(), roomId: v.string(), memberIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const room = await getRoomById(ctx, args.roomId);
    if (!room) throw new Error("Room not found");
    const actorMembership = await requireRoomMembership(ctx, args.roomId, actor.publicId);
    if (room.settings?.allowMemberInvites === false && !["owner", "admin"].includes(actorMembership.role)) {
      throw new Error("Only admins can invite members");
    }
    const nextIds = Array.from(new Set(args.memberIds || [])).filter(Boolean);
    for (const userId of nextIds) await addMembership(ctx, args.roomId, userId, "member");
    const memberships = await getRoomMemberships(ctx, args.roomId);
    await ctx.db.patch(room._id, {
      memberIds: memberships.map((entry: any) => entry.userId),
      updatedAt: Date.now(),
    });
    return await hydrateRoom(ctx, await getRoomById(ctx, args.roomId), actor.publicId);
  },
});

export const update = mutation({
  args: {
    authToken: v.string(),
    roomId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    settings: v.optional(v.object({
      onlyAdminsCanMessage: v.optional(v.boolean()),
      allowMemberInvites: v.optional(v.boolean()),
      allowLinks: v.optional(v.boolean()),
      allowFiles: v.optional(v.boolean()),
      slowModeSeconds: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const room = await getRoomById(ctx, args.roomId);
    if (!room) throw new Error("Room not found");
    await requireRoomAdmin(ctx, args.roomId, actor.publicId);
    const patch: any = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = normalizeText(args.name);
      if (name.length < 2) throw new Error("Room name must be at least 2 characters");
      patch.name = name;
    }
    if (args.description !== undefined) patch.description = normalizeText(args.description).slice(0, 240);
    if (args.settings) patch.settings = { ...defaultRoomSettings(), ...(room.settings || {}), ...args.settings };
    await ctx.db.patch(room._id, patch);
    return await hydrateRoom(ctx, await getRoomById(ctx, args.roomId), actor.publicId);
  },
});

export const leave = mutation({
  args: { authToken: v.string(), roomId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUserByToken(ctx, args.authToken);
    const room = await getRoomById(ctx, args.roomId);
    if (!room) throw new Error("Room not found");
    if (room.ownerId === actor.publicId) throw new Error("Transfer ownership before leaving");
    const membership = await getRoomMembership(ctx, args.roomId, actor.publicId);
    if (membership) await ctx.db.delete(membership._id);
    const memberships = await getRoomMemberships(ctx, args.roomId);
    await ctx.db.patch(room._id, { memberIds: memberships.map((entry: any) => entry.userId), updatedAt: Date.now() });
    return { ok: true };
  },
});
