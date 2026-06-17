import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const settings = v.object({
  readReceipts: v.optional(v.boolean()),
  typingIndicator: v.optional(v.boolean()),
  notifications: v.optional(v.boolean()),
  lastSeen: v.optional(v.boolean()),
  profilePhoto: v.optional(v.boolean()),
  theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
  density: v.optional(v.union(v.literal("compact"), v.literal("comfortable"))),
});

const attachment = v.object({
  storageId: v.optional(v.id("_storage")),
  url: v.optional(v.string()),
  name: v.string(),
  type: v.optional(v.string()),
  size: v.optional(v.number()),
});

const reaction = v.object({
  emoji: v.string(),
  userId: v.string(),
  createdAt: v.number(),
});

const quote = v.object({
  messageId: v.optional(v.string()),
  text: v.optional(v.string()),
  senderId: v.optional(v.string()),
  createdAt: v.optional(v.number()),
});

const forwardedFrom = v.object({
  messageId: v.optional(v.string()),
  senderId: v.optional(v.string()),
  conversationType: v.optional(v.union(v.literal("direct"), v.literal("room"))),
  conversationId: v.optional(v.string()),
  text: v.optional(v.string()),
  createdAt: v.optional(v.number()),
});

export default defineSchema({
  users: defineTable({
    publicId: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    fullName: v.string(),
    username: v.optional(v.string()),
    avatarColor: v.optional(v.string()),
    profilePic: v.optional(v.string()),
    bio: v.optional(v.string()),
    status: v.optional(v.string()),
    role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
    blockedUserIds: v.optional(v.array(v.string())),
    settings: v.optional(settings),
    tokenVersion: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_publicId", ["publicId"])
    .index("by_email", ["email"])
    .index("by_username", ["username"])
    .searchIndex("search_users", {
      searchField: "fullName",
      filterFields: ["email", "username"],
    }),

  authsessions: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    tokenHash: v.string(),
    tokenVersion: v.number(),
    source: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    expiresAt: v.number(),
    lastUsedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_tokenHash", ["tokenHash"])
    .index("by_user", ["userId"]),

  messages: defineTable({
    messageId: v.string(),
    conversationType: v.union(v.literal("direct"), v.literal("room")),
    conversationId: v.string(),
    senderId: v.string(),
    receiverId: v.optional(v.string()),
    roomId: v.optional(v.string()),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    attachments: v.optional(v.array(attachment)),
    quotedMessage: v.optional(quote),
    forwardedFrom: v.optional(forwardedFrom),
    reactions: v.optional(v.array(reaction)),
    deliveredBy: v.optional(v.array(v.object({ userId: v.string(), deliveredAt: v.number() }))),
    readBy: v.optional(v.array(v.object({
      userId: v.string(),
      readAt: v.number(),
      hiddenByPrivacy: v.optional(v.boolean()),
    }))),
    edited: v.optional(v.boolean()),
    editedAt: v.optional(v.number()),
    senderDeleted: v.optional(v.boolean()),
    senderDeletedAt: v.optional(v.number()),
    isEncrypted: v.optional(v.boolean()),
    encryptionKeyVersion: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_sender", ["senderId", "createdAt"])
    .index("by_receiver", ["receiverId", "createdAt"])
    .index("by_room", ["roomId", "createdAt"]),

  messagethreads: defineTable({
    threadId: v.string(),
    rootMessageId: v.string(),
    conversationType: v.union(v.literal("direct"), v.literal("room")),
    conversationId: v.string(),
    rootSenderId: v.optional(v.string()),
    createdBy: v.string(),
    replyCount: v.number(),
    lastReplyId: v.optional(v.string()),
    lastReplyAt: v.optional(v.number()),
    lastReplyPreview: v.optional(v.string()),
    participantIds: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_rootMessage", ["rootMessageId"])
    .index("by_conversation", ["conversationType", "conversationId"]),

  threadmessages: defineTable({
    messageId: v.string(),
    threadId: v.string(),
    rootMessageId: v.string(),
    senderId: v.string(),
    text: v.optional(v.string()),
    html: v.optional(v.string()),
    attachments: v.optional(v.array(attachment)),
    quotedMessage: v.optional(quote),
    reactions: v.optional(v.array(reaction)),
    edited: v.optional(v.boolean()),
    editedAt: v.optional(v.number()),
    senderDeleted: v.optional(v.boolean()),
    senderDeletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_rootMessage", ["rootMessageId"]),

  threadreadstates: defineTable({
    readStateId: v.string(),
    threadId: v.string(),
    userId: v.string(),
    lastReadAt: v.optional(v.number()),
    lastReadReplyId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_user_thread", ["userId", "threadId"]),

  conversationsummaries: defineTable({
    summaryId: v.string(),
    userId: v.string(),
    conversationId: v.string(),
    type: v.union(v.literal("direct"), v.literal("room")),
    lastMessage: v.optional(v.any()),
    lastMessageAt: v.optional(v.number()),
    unreadCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_conversation", ["userId", "conversationId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_user_lastMessageAt", ["userId", "lastMessageAt"]),

  conversationreadstates: defineTable({
    readStateId: v.string(),
    userId: v.string(),
    conversationId: v.string(),
    type: v.union(v.literal("direct"), v.literal("room")),
    lastReadAt: v.optional(v.number()),
    lastReadMessageId: v.optional(v.string()),
    hiddenByPrivacy: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_conversation", ["conversationId"])
    .index("by_user_conversation", ["userId", "conversationId"]),

  conversationpreferences: defineTable({
    preferenceId: v.string(),
    userId: v.string(),
    conversationId: v.string(),
    pinned: v.optional(v.boolean()),
    pinnedAt: v.optional(v.number()),
    muted: v.optional(v.boolean()),
    mutedUntil: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_conversation", ["userId", "conversationId"]),

  groups: defineTable({
    roomId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    ownerId: v.string(),
    adminIds: v.optional(v.array(v.string())),
    memberIds: v.optional(v.array(v.string())),
    avatarColor: v.optional(v.string()),
    settings: v.optional(v.object({
      onlyAdminsCanMessage: v.optional(v.boolean()),
      allowMemberInvites: v.optional(v.boolean()),
      allowLinks: v.optional(v.boolean()),
      allowFiles: v.optional(v.boolean()),
      slowModeSeconds: v.optional(v.number()),
    })),
    lastMessageAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_roomId", ["roomId"])
    .index("by_owner", ["ownerId"])
    .index("by_lastMessageAt", ["lastMessageAt"]),

  groupmemberships: defineTable({
    membershipId: v.string(),
    roomId: v.string(),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["userId"])
    .index("by_room_user", ["roomId", "userId"]),

  userPresence: defineTable({
    userId: v.string(),
    isOnline: v.boolean(),
    lastSeen: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_lastSeen", ["lastSeen"]),

  typingIndicators: defineTable({
    userId: v.string(),
    conversationId: v.optional(v.string()),
    roomId: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_conversation", ["conversationId"])
    .index("by_room", ["roomId"]),

  notifications: defineTable({
    notificationId: v.string(),
    userId: v.string(),
    actorId: v.optional(v.string()),
    type: v.union(v.literal("message"), v.literal("room_message"), v.literal("thread_reply")),
    entity: v.optional(v.object({
      messageId: v.optional(v.string()),
      conversationId: v.optional(v.string()),
      roomId: v.optional(v.string()),
      threadId: v.optional(v.string()),
      threadReplyId: v.optional(v.string()),
    })),
    meta: v.optional(v.any()),
    isRead: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "isRead", "createdAt"])
    .index("by_createdAt", ["createdAt"]),
});

