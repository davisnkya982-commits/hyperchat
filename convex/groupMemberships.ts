// @ts-nocheck
import { defaultRoomSettings, makeId } from "./ids";
import { getUserByPublicId } from "./authSessions";

export const getRoomById = async (ctx: any, roomId?: string) => {
  const id = String(roomId || "").trim();
  if (!id) return null;
  return await ctx.db
    .query("groups")
    .withIndex("by_roomId", (q: any) => q.eq("roomId", id))
    .first();
};

export const getRoomMembership = async (ctx: any, roomId: string, userId: string) => {
  if (!roomId || !userId) return null;
  return await ctx.db
    .query("groupmemberships")
    .withIndex("by_room_user", (q: any) => q.eq("roomId", roomId).eq("userId", userId))
    .first();
};

export const getRoomMemberships = async (ctx: any, roomId: string) =>
  await ctx.db
    .query("groupmemberships")
    .withIndex("by_room", (q: any) => q.eq("roomId", roomId))
    .collect();

export const getUserRoomMemberships = async (ctx: any, userId: string) =>
  await ctx.db
    .query("groupmemberships")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

export const getRoomMemberIds = async (ctx: any, roomId: string) => {
  const memberships = await getRoomMemberships(ctx, roomId);
  if (memberships.length > 0) return memberships.map((membership: any) => membership.userId);
  const room = await getRoomById(ctx, roomId);
  return Array.from(new Set([room?.ownerId, ...(room?.adminIds || []), ...(room?.memberIds || [])].filter(Boolean)));
};

export const assertRoomMembership = async (ctx: any, roomId: string, userId: string) => {
  const room = await getRoomById(ctx, roomId);
  if (!room) throw new Error("Room not found");
  const membership = await getRoomMembership(ctx, room.roomId, userId);
  const fallbackMember = [room.ownerId, ...(room.adminIds || []), ...(room.memberIds || [])].includes(userId);
  if (!membership && !fallbackMember) throw new Error("Unauthorized room access");
  const role = membership?.role || (room.ownerId === userId ? "owner" : room.adminIds?.includes(userId) ? "admin" : "member");
  const memberIds = await getRoomMemberIds(ctx, room.roomId);
  return { room, membership, role, memberIds };
};

export const isRoomManager = (room: any, userId: string, role?: string) =>
  role === "owner" || role === "admin" || room?.ownerId === userId || room?.adminIds?.includes(userId);

export const normalizeRoom = async (ctx: any, room: any, viewerId?: string) => {
  if (!room) return null;
  const memberships = await getRoomMemberships(ctx, room.roomId);
  const memberIds = memberships.length > 0
    ? memberships.map((membership: any) => membership.userId)
    : Array.from(new Set([room.ownerId, ...(room.adminIds || []), ...(room.memberIds || [])].filter(Boolean)));
  const users = await Promise.all(memberIds.map((id: string) => getUserByPublicId(ctx, id)));
  const viewerMembership = viewerId ? memberships.find((membership: any) => membership.userId === viewerId) : null;
  return {
    _id: room.roomId,
    roomId: room.roomId,
    name: room.name,
    description: room.description,
    ownerId: room.ownerId,
    adminIds: room.adminIds || [room.ownerId],
    memberIds,
    memberCount: memberIds.length,
    members: users.filter(Boolean).map((user: any) => ({
      _id: user.publicId,
      publicId: user.publicId,
      fullName: user.fullName,
      username: user.username,
      avatarColor: user.avatarColor,
      profilePic: user.profilePic,
      status: user.status,
      role: memberships.find((membership: any) => membership.userId === user.publicId)?.role || (room.ownerId === user.publicId ? "owner" : "member"),
    })),
    avatarColor: room.avatarColor,
    settings: { ...defaultRoomSettings(), ...(room.settings || {}) },
    viewerRole: viewerMembership?.role || (room.ownerId === viewerId ? "owner" : room.adminIds?.includes(viewerId) ? "admin" : "member"),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    lastMessageAt: room.lastMessageAt,
  };
};

export const syncRoomMemberships = async (ctx: any, room: any, memberIds: string[] = []) => {
  const now = Date.now();
  const normalizedIds = Array.from(new Set([room.ownerId, ...(room.adminIds || []), ...memberIds].filter(Boolean)));
  const existing = await getRoomMemberships(ctx, room.roomId);
  const existingByUser = new Map(existing.map((membership: any) => [membership.userId, membership]));

  await Promise.all(normalizedIds.map(async (userId) => {
    const role = room.ownerId === userId ? "owner" : room.adminIds?.includes(userId) ? "admin" : "member";
    const current = existingByUser.get(userId);
    if (current) {
      await ctx.db.patch(current._id, { role, updatedAt: now });
      existingByUser.delete(userId);
      return;
    }
    await ctx.db.insert("groupmemberships", {
      membershipId: makeId("membership"),
      roomId: room.roomId,
      userId,
      role,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }));

  await Promise.all(Array.from(existingByUser.values()).map((membership: any) => ctx.db.delete(membership._id)));
};

