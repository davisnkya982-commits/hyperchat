// @ts-nocheck
export const now = () => Date.now();

export const makeId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const normalizeEmail = (value?: string) => String(value || "").trim().toLowerCase();

export const normalizeText = (value?: string) => String(value || "").trim();

export const directConversationId = (userIdA: string, userIdB: string) =>
  `direct:${[String(userIdA), String(userIdB)].sort().join(":")}`;

export const compactUser = (user: any) => {
  if (!user) return null;
  return {
    _id: user.publicId,
    publicId: user.publicId,
    fullName: user.fullName,
    username: user.username,
    avatarColor: user.avatarColor,
    profilePic: user.profilePic,
    bio: user.bio,
    status: user.status,
    settings: {
      readReceipts: user.settings?.readReceipts,
      typingIndicator: user.settings?.typingIndicator,
      notifications: user.settings?.notifications,
      lastSeen: user.settings?.lastSeen,
      profilePhoto: user.settings?.profilePhoto,
      theme: user.settings?.theme,
      density: user.settings?.density,
    },
    lastSeen: user.settings?.lastSeen === false ? null : user.lastSeen,
    role: user.role || "user",
  };
};

export const defaultUserSettings = () => ({
  readReceipts: true,
  typingIndicator: true,
  notifications: true,
  lastSeen: true,
  profilePhoto: true,
  theme: "system",
  density: "compact",
});

export const defaultRoomSettings = () => ({
  onlyAdminsCanMessage: false,
  allowMemberInvites: true,
  allowLinks: true,
  allowFiles: true,
  slowModeSeconds: 0,
});

export const messagePreview = (message: any = {}) => {
  if (message.senderDeleted) return "Message deleted";
  const text = normalizeText(message.text || message.html?.replace(/<[^>]+>/g, " "));
  if (text) return text.slice(0, 180);
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message.attachments.length === 1 ? "Attachment" : `${message.attachments.length} attachments`;
  }
  return "Message";
};

