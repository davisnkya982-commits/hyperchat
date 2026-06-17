// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { compactUser, defaultUserSettings, makeId, normalizeEmail, normalizeText } from "./ids";
import {
  getUserByEmail,
  getUserByPublicId,
  hashPassword,
  issueAuthSession,
  requireUserByToken,
  revokeAuthSession,
} from "./authSessions";

const avatarColors = ["#0f766e", "#1d4ed8", "#7c3aed", "#be123c", "#a16207", "#475569"];

const normalizeUsername = (value?: string) =>
  normalizeText(value).toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9_.-]/g, "").slice(0, 32);

const requirePassword = (password?: string) => {
  const next = String(password || "");
  if (next.length < 8) throw new Error("Password must be at least 8 characters");
  return next;
};

const userPayload = (user: any, token?: string) => ({
  user: compactUser(user),
  token,
});

export const me = query({
  args: { authToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.authToken) return null;
    const user = await requireUserByToken(ctx, args.authToken);
    return compactUser(user);
  },
});

export const signUp = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    password: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const fullName = normalizeText(args.fullName);
    const password = requirePassword(args.password);
    if (!email || !email.includes("@")) throw new Error("Enter a valid email");
    if (fullName.length < 2) throw new Error("Name must be at least 2 characters");
    const existingEmail = await getUserByEmail(ctx, email);
    if (existingEmail) throw new Error("Email already registered");

    const username = normalizeUsername(args.username || email.split("@")[0]);
    if (username) {
      const existingUsername = await ctx.db
        .query("users")
        .withIndex("by_username", (q: any) => q.eq("username", username))
        .first();
      if (existingUsername) throw new Error("Username already taken");
    }

    const now = Date.now();
    const publicId = makeId("user");
    const docId = await ctx.db.insert("users", {
      publicId,
      email,
      passwordHash: await hashPassword(email, password),
      fullName,
      username,
      avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)],
      role: "user",
      blockedUserIds: [],
      settings: defaultUserSettings(),
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    const user = await ctx.db.get(docId);
    const token = await issueAuthSession(ctx, user.publicId, { source: "signup" });
    return userPayload(user, token);
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await getUserByEmail(ctx, email);
    if (!user) throw new Error("Invalid email or password");
    const passwordHash = await hashPassword(email, args.password);
    if (passwordHash !== user.passwordHash) throw new Error("Invalid email or password");
    const token = await issueAuthSession(ctx, user.publicId, {
      source: "login",
      tokenVersion: Number(user.tokenVersion || 0),
    });
    return userPayload(user, token);
  },
});

export const logout = mutation({
  args: { authToken: v.string() },
  handler: async (ctx, args) => revokeAuthSession(ctx, args.authToken),
});

export const createDemoWorkspace = mutation({
  args: { authToken: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireUserByToken(ctx, args.authToken);
    const now = Date.now();
    const demoSpecs = [
      { fullName: "Mira Chen", username: "mira", email: "mira@hyperchat.local", color: "#0f766e" },
      { fullName: "Jones Nkya", username: "jones", email: "jones@hyperchat.local", color: "#7c3aed" },
    ];
    const users = [];
    for (const spec of demoSpecs) {
      let user = await getUserByEmail(ctx, spec.email);
      if (!user) {
        const docId = await ctx.db.insert("users", {
          publicId: makeId("user"),
          email: spec.email,
          passwordHash: await hashPassword(spec.email, "password123"),
          fullName: spec.fullName,
          username: spec.username,
          avatarColor: spec.color,
          role: "user",
          blockedUserIds: [],
          settings: defaultUserSettings(),
          tokenVersion: 0,
          createdAt: now,
          updatedAt: now,
        });
        user = await ctx.db.get(docId);
      }
      users.push(user);
    }
    return { users: users.map(compactUser) };
  },
});

