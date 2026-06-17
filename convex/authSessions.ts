// @ts-nocheck
import { makeId } from "./ids";

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const hashText = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const hashPassword = async (email: string, password: string) =>
  hashText(`hyperchat:v1:${String(email || "").toLowerCase()}:${String(password || "")}`);

export const generateSessionToken = () => {
  const data = new Uint8Array(48);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const getUserByPublicId = async (ctx: any, publicId?: string) => {
  const id = String(publicId || "").trim();
  if (!id) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_publicId", (q: any) => q.eq("publicId", id))
    .first();
};

export const getUserByEmail = async (ctx: any, email?: string) => {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q: any) => q.eq("email", normalized))
    .first();
};

export const issueAuthSession = async (
  ctx: any,
  userId: string,
  options?: { source?: string; ttlMs?: number; tokenVersion?: number }
) => {
  const now = Date.now();
  const token = generateSessionToken();
  await ctx.db.insert("authsessions", {
    sessionId: makeId("sess"),
    userId,
    tokenHash: await hashText(token),
    tokenVersion: Number(options?.tokenVersion || 0),
    source: options?.source,
    expiresAt: now + Math.max(5 * 60 * 1000, Number(options?.ttlMs || DEFAULT_SESSION_TTL_MS)),
    lastUsedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return token;
};

export const resolveAuthSession = async (ctx: any, token?: string) => {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const tokenHash = await hashText(raw);
  const session = await ctx.db
    .query("authsessions")
    .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session || session.revokedAt || Number(session.expiresAt || 0) < Date.now()) return null;
  return session;
};

export const requireUserByToken = async (ctx: any, token?: string) => {
  const session = await resolveAuthSession(ctx, token);
  if (!session?.userId) throw new Error("Authentication required");
  const user = await getUserByPublicId(ctx, session.userId);
  if (!user) throw new Error("Authentication required");
  if (Number(session.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
    throw new Error("Session expired");
  }
  return user;
};

export const maybeUserByToken = async (ctx: any, token?: string) => {
  try {
    return await requireUserByToken(ctx, token);
  } catch {
    return null;
  }
};

export const revokeAuthSession = async (ctx: any, token?: string) => {
  const raw = String(token || "").trim();
  if (!raw) return { revoked: false };
  const tokenHash = await hashText(raw);
  const session = await ctx.db
    .query("authsessions")
    .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session || session.revokedAt) return { revoked: false };
  await ctx.db.patch(session._id, { revokedAt: Date.now(), updatedAt: Date.now() });
  return { revoked: true };
};

