// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserByToken } from "./authSessions";

export const generateUploadUrl = mutation({
  args: { authToken: v.string() },
  handler: async (ctx, args) => {
    await requireUserByToken(ctx, args.authToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { authToken: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireUserByToken(ctx, args.authToken);
    return await ctx.storage.getUrl(args.storageId);
  },
});
