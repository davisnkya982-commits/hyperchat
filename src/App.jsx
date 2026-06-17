import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Copy,
  Edit3,
  File,
  Hash,
  Info,
  LogOut,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Pin,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api } from "../convex/_generated/api";

const TOKEN_KEY = "hyperchat:token";
const REACTIONS = ["👍", "❤️", "😂", "🔥", "👏"];

const directConversationId = (a, b) => `direct:${[String(a), String(b)].sort().join(":")}`;

const getName = (user) => user?.fullName || user?.name || user?.username || "Unknown";

const initials = (name = "") =>
  String(name || "H")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "H";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatDay = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};

const sortMessages = (messages = []) =>
  [...messages].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

const groupWithDates = (messages = []) => {
  const rows = [];
  let lastDay = "";
  for (const message of sortMessages(messages)) {
    const day = new Date(message.createdAt || 0).toDateString();
    if (day !== lastDay) {
      rows.push({ type: "date", id: `date-${day}`, label: formatDay(message.createdAt) });
      lastDay = day;
    }
    rows.push({ type: "message", id: message._id || message.messageId, message });
  }
  return rows;
};

function Avatar({ entity, size = "md", online = false }) {
  const name = getName(entity);
  return (
    <span className={`avatar avatar-${size}`} style={{ "--avatar": entity?.avatarColor || "#4f90e6" }}>
      {entity?.profilePic ? <img src={entity.profilePic} alt="" /> : initials(name)}
      {online && <span className="avatar-presence" />}
    </span>
  );
}

function IconButton({ title, children, className = "", ...props }) {
  return (
    <button type="button" className={`icon-button ${className}`} title={title} aria-label={title} {...props}>
      {children}
    </button>
  );
}

function AuthScreen({ onToken }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useMutation(api.auth.login);
  const signUp = useMutation(api.auth.signUp);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = mode === "login"
        ? await login({ email: form.email, password: form.password })
        : await signUp({
          fullName: form.fullName,
          username: form.username || undefined,
          email: form.email,
          password: form.password,
        });
      localStorage.setItem(TOKEN_KEY, result.token);
      onToken(result.token);
    } catch (err) {
      setError(err?.message || "Could not continue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-copy">
          <div className="brand-lockup">
            <span className="brand-mark">H</span>
            <div>
              <h1>Hyperchat</h1>
              <p>Focused Monax-style direct and room chat.</p>
            </div>
          </div>
          <div className="auth-proof">
            <span>Direct chats</span>
            <span>Room groups</span>
            <span>Threads</span>
            <span>Read state</span>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="auth-tabs">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create</button>
          </div>
          {mode === "signup" && (
            <>
              <label>
                <span>Name</span>
                <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" />
              </label>
              <label>
                <span>Username</span>
                <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" />
              </label>
            </>
          )}
          <label>
            <span>Email</span>
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" autoComplete="email" />
          </label>
          <label>
            <span>Password</span>
            <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
      </section>
    </main>
  );
}

function ConversationRail({
  currentUser,
  selected,
  summaries,
  users,
  rooms,
  presence,
  search,
  onSearch,
  onSelectSummary,
  onStartDirect,
  onCreateRoom,
  onOpenSettings,
  onLogout,
}) {
  const [showPeople, setShowPeople] = useState(false);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [roomMembers, setRoomMembers] = useState([]);
  const presenceById = useMemo(() => new Map((presence || []).map((entry) => [entry.userId, entry])), [presence]);
  const visibleSummaries = (summaries || []).filter((summary) =>
    [summary.title, summary.lastMessage?.text].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const submitRoom = async (event) => {
    event.preventDefault();
    if (!roomName.trim()) return;
    await onCreateRoom({ name: roomName.trim(), description: roomDescription.trim(), memberIds: roomMembers });
    setRoomName("");
    setRoomDescription("");
    setRoomMembers([]);
    setShowRoomForm(false);
  };

  return (
    <aside className="conversation-rail">
      <header className="rail-header">
        <div className="rail-user">
          <Avatar entity={currentUser} online />
          <div>
            <strong>{getName(currentUser)}</strong>
            <span>{currentUser?.status || "Available"}</span>
          </div>
        </div>
        <div className="rail-actions">
          <IconButton title="Settings" onClick={onOpenSettings}><Settings size={18} /></IconButton>
          <IconButton title="Sign out" onClick={onLogout}><LogOut size={18} /></IconButton>
        </div>
      </header>

      <div className="rail-search">
        <Search size={16} />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search" />
      </div>

      <div className="rail-command-row">
        <button type="button" onClick={() => setShowPeople((value) => !value)}><Plus size={15} /> New chat</button>
        <button type="button" onClick={() => setShowRoomForm((value) => !value)}><Users size={15} /> Room</button>
      </div>

      {showPeople && (
        <section className="rail-drawer">
          <div className="drawer-title">People</div>
          <div className="drawer-list">
            {(users || []).map((user) => (
              <button key={user.publicId} type="button" onClick={() => { onStartDirect(user); setShowPeople(false); }}>
                <Avatar entity={user} size="sm" online={presenceById.get(user.publicId)?.isOnline} />
                <span>{getName(user)}</span>
              </button>
            ))}
            {(!users || users.length === 0) && <p className="empty-copy">No other users yet.</p>}
          </div>
        </section>
      )}

      {showRoomForm && (
        <form className="rail-drawer room-form" onSubmit={submitRoom}>
          <div className="drawer-title">New room</div>
          <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" />
          <input value={roomDescription} onChange={(event) => setRoomDescription(event.target.value)} placeholder="Description" />
          <div className="member-picker">
            {(users || []).map((user) => {
              const picked = roomMembers.includes(user.publicId);
              return (
                <button key={user.publicId} type="button" className={picked ? "picked" : ""} onClick={() => {
                  setRoomMembers((current) => picked ? current.filter((id) => id !== user.publicId) : [...current, user.publicId]);
                }}>
                  <Avatar entity={user} size="xs" />
                  {getName(user)}
                </button>
              );
            })}
          </div>
          <button className="primary-button small">Create room</button>
        </form>
      )}

      <div className="conversation-list">
        {visibleSummaries.map((summary) => {
          const isSelected = selected?.conversationId === summary.conversationId;
          const entity = summary.type === "room" ? summary.room : summary.user;
          return (
            <button
              key={summary.conversationId}
              type="button"
              className={`conversation-item ${isSelected ? "selected" : ""}`}
              onClick={() => onSelectSummary(summary)}
            >
              <Avatar entity={entity} online={summary.type === "direct" && presenceById.get(summary.directUserId)?.isOnline} />
              <span className="conversation-main">
                <span className="conversation-title">
                  <strong>{summary.title}</strong>
                  <small>{formatTime(summary.lastMessageAt)}</small>
                </span>
                <span className="conversation-preview">
                  {summary.pinned && <Pin size={11} />}
                  {summary.muted && <BellOff size={11} />}
                  {summary.lastMessage?.text || (summary.type === "room" ? `${summary.room?.memberCount || 0} members` : "No messages yet")}
                </span>
              </span>
              {Number(summary.unreadCount || 0) > 0 && <span className="unread-badge">{summary.unreadCount}</span>}
            </button>
          );
        })}

        {visibleSummaries.length === 0 && (
          <div className="rail-empty">
            <MessageSquare size={26} />
            <p>No chats yet</p>
            <span>Start a direct chat or create a room.</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function ChatHeader({
  selected,
  currentSummary,
  room,
  presence,
  typingUsers,
  onBack,
  onInfo,
  onSearch,
  onTogglePin,
  onToggleMute,
}) {
  if (!selected) {
    return <header className="chat-header empty-header" />;
  }
  const entity = selected.type === "room" ? (room || currentSummary?.room || selected.room) : (currentSummary?.user || selected.user);
  const typingLabel = typingUsers?.length ? `${typingUsers.map((entry) => getName(entry.user)).join(", ")} typing...` : "";
  const presenceLabel = selected.type === "room"
    ? `${room?.memberCount || currentSummary?.room?.memberCount || 0} members`
    : presence?.isOnline ? "online" : presence?.lastSeen ? `Last seen ${formatTime(presence.lastSeen)}` : "offline";

  return (
    <header className="chat-header">
      <button type="button" className="mobile-back" onClick={onBack}><ArrowLeft size={21} /></button>
      <button type="button" className="chat-identity" onClick={onInfo}>
        <Avatar entity={entity} online={selected.type === "direct" && presence?.isOnline} />
        <span>
          <strong>{currentSummary?.title || selected.title || getName(entity)}</strong>
          <small className={typingLabel ? "typing" : ""}>{typingLabel || presenceLabel}</small>
        </span>
      </button>
      <div className="chat-header-actions">
        <IconButton title="Search messages" onClick={onSearch}><Search size={18} /></IconButton>
        <IconButton title={currentSummary?.pinned ? "Unpin" : "Pin"} onClick={onTogglePin}><Pin size={18} /></IconButton>
        <IconButton title={currentSummary?.muted ? "Unmute" : "Mute"} onClick={onToggleMute}>{currentSummary?.muted ? <BellOff size={18} /> : <Bell size={18} />}</IconButton>
        <IconButton title="Details" onClick={onInfo}><Info size={18} /></IconButton>
      </div>
    </header>
  );
}

function MessageActions({ message, isOwn, onReply, onThread, onForward, onEdit, onDelete, onReaction }) {
  return (
    <div className="message-actions">
      <IconButton title="Reply" onClick={() => onReply(message)}><Reply size={14} /></IconButton>
      <IconButton title="Thread" onClick={() => onThread(message)}><MessageSquare size={14} /></IconButton>
      <IconButton title="Forward" onClick={() => onForward(message)}><Send size={14} /></IconButton>
      {REACTIONS.slice(0, 3).map((emoji) => (
        <button key={emoji} type="button" className="emoji-button" title={`React ${emoji}`} onClick={() => onReaction(message, emoji)}>{emoji}</button>
      ))}
      {isOwn && <IconButton title="Edit" onClick={() => onEdit(message)}><Edit3 size={14} /></IconButton>}
      {isOwn && <IconButton title="Delete" onClick={() => onDelete(message)}><Trash2 size={14} /></IconButton>}
    </div>
  );
}

function AttachmentList({ attachments = [] }) {
  if (!attachments.length) return null;
  return (
    <div className="attachment-list">
      {attachments.map((file, index) => {
        const isImage = String(file.type || "").startsWith("image/") && file.url;
        return (
          <a key={`${file.name}-${index}`} className="attachment-chip" href={file.url || "#"} target="_blank" rel="noreferrer">
            {isImage ? <img src={file.url} alt="" /> : <File size={15} />}
            <span>{file.name}</span>
          </a>
        );
      })}
    </div>
  );
}

function ReactionPills({ reactions = [], onReaction, message }) {
  const grouped = reactions.reduce((acc, entry) => {
    if (!entry?.emoji) return acc;
    acc[entry.emoji] = (acc[entry.emoji] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(grouped);
  if (!entries.length) return null;
  return (
    <div className="reaction-pills">
      {entries.map(([emoji, count]) => (
        <button key={emoji} type="button" onClick={() => onReaction(message, emoji)}>
          {emoji}{count > 1 ? <span>{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  previous,
  next,
  currentUser,
  isThreadMessage = false,
  onReply,
  onThread,
  onForward,
  onEdit,
  onDelete,
  onReaction,
}) {
  const isOwn = message.senderId === currentUser?.publicId || message.isOwn;
  const previousSame = previous && previous.type !== "date" && previous.message?.senderId === message.senderId && Math.abs(Number(message.createdAt || 0) - Number(previous.message?.createdAt || 0)) < 10 * 60 * 1000;
  const nextSame = next && next.type !== "date" && next.message?.senderId === message.senderId && Math.abs(Number(next.message?.createdAt || 0) - Number(message.createdAt || 0)) < 10 * 60 * 1000;
  const sender = isOwn ? currentUser : message.senderProfile;
  const text = message.senderDeleted ? "Message deleted" : message.text;

  return (
    <div className={`message-row ${isOwn ? "own" : "other"} ${previousSame ? "grouped-prev" : ""} ${nextSame ? "grouped-next" : ""}`}>
      {!isOwn && <div className="bubble-avatar-slot">{!nextSame && <Avatar entity={sender} size="sm" />}</div>}
      <div className="bubble-stack">
        {!isOwn && !previousSame && <span className="bubble-sender">{getName(sender)}</span>}
        <div className={`message-bubble ${message.senderDeleted ? "deleted" : ""}`}>
          {message.quotedMessage?.text && (
            <button type="button" className="quote-preview" onClick={() => onThread(message)}>
              <Reply size={12} />
              <span>{message.quotedMessage.text}</span>
            </button>
          )}
          {message.forwardedFrom && (
            <div className="forwarded-line">
              <Send size={12} />
              Forwarded
            </div>
          )}
          {text && <p>{text}</p>}
          <AttachmentList attachments={message.attachments} />
          <div className="bubble-meta">
            {message.edited && <span>edited</span>}
            <span>{formatTime(message.createdAt)}</span>
            {isOwn && <CheckCheck size={13} />}
          </div>
          <MessageActions
            message={message}
            isOwn={isOwn}
            onReply={onReply}
            onThread={onThread}
            onForward={onForward}
            onEdit={onEdit}
            onDelete={onDelete}
            onReaction={onReaction}
          />
        </div>
        <div className={`bubble-pills ${isOwn ? "own" : ""}`}>
          <ReactionPills reactions={message.reactions} onReaction={onReaction} message={message} />
          {!isThreadMessage && Number(message.threadReplyCount || 0) > 0 && (
            <button type="button" className="thread-pill" onClick={() => onThread(message)}>
              <MessageSquare size={10} /> {message.threadReplyCount}
              {Number(message.threadUnreadCount || 0) > 0 && <span className="thread-dot" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageList({ messages = [], currentUser, onReply, onThread, onForward, onEdit, onDelete, onReaction, typingUsers }) {
  const rows = useMemo(() => groupWithDates(messages), [messages]);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="message-scroll" ref={listRef}>
      <div className="message-column">
        {rows.map((row, index) => row.type === "date" ? (
          <div key={row.id} className="date-separator"><span>{row.label}</span></div>
        ) : (
          <MessageBubble
            key={row.id}
            message={row.message}
            previous={rows[index - 1]}
            next={rows[index + 1]}
            currentUser={currentUser}
            onReply={onReply}
            onThread={onThread}
            onForward={onForward}
            onEdit={onEdit}
            onDelete={onDelete}
            onReaction={onReaction}
          />
        ))}
        {typingUsers?.length > 0 && (
          <div className="typing-indicator">
            <span />
            <span />
            <span />
            {typingUsers.map((entry) => getName(entry.user)).join(", ")} typing
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  replyTo,
  editing,
  onCancelContext,
  onTyping,
  uploadFiles,
  disabled = false,
}) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (replyTo || editing) inputRef.current?.focus();
  }, [replyTo, editing]);

  const submit = async () => {
    if (disabled || busy) return;
    if (!value.trim() && files.length === 0) return;
    setBusy(true);
    try {
      const attachments = files.length ? await uploadFiles(files) : [];
      await onSend(value, attachments);
      setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer-wrap">
      {(replyTo || editing) && (
        <div className={`composer-context ${editing ? "editing" : ""}`}>
          <Reply size={15} />
          <span>
            <strong>{editing ? "Editing message" : "Replying"}</strong>
            <small>{editing?.text || replyTo?.text || "Attachment"}</small>
          </span>
          <IconButton title="Cancel" onClick={onCancelContext}><X size={16} /></IconButton>
        </div>
      )}
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((file) => (
            <span key={`${file.name}-${file.size}`}>
              <File size={14} /> {file.name}
              <button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="composer">
        <label className="composer-tool" title="Attach files">
          <Paperclip size={19} />
          <input type="file" multiple onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files || [])])} />
        </label>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onTyping?.();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") onCancelContext();
          }}
          placeholder={editing ? "Edit message..." : "Type a message..."}
          disabled={disabled || busy}
          rows={1}
        />
        <IconButton title="Emoji"><Smile size={19} /></IconButton>
        <button type="button" className="send-button" onClick={submit} disabled={disabled || busy}>
          {busy ? <Check size={18} /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}

function ThreadPanel({ token, currentUser, threadRoot, onClose, uploadFiles }) {
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const threadData = useQuery(api.messageThreads.listThreadReplies, token && threadRoot ? {
    authToken: token,
    rootMessageId: threadRoot.messageId || threadRoot._id,
    threadId: threadRoot.threadId || undefined,
  } : "skip");
  const sendReply = useMutation(api.messageThreads.sendThreadReply);
  const markRead = useMutation(api.messageThreads.markThreadRead);
  const editReply = useMutation(api.messageThreads.editThreadReply);
  const deleteReply = useMutation(api.messageThreads.deleteThreadReply);
  const reactReply = useMutation(api.messageThreads.toggleThreadReaction);

  const threadId = threadData?.thread?.threadId || threadRoot?.threadId;

  useEffect(() => {
    if (threadId && token) markRead({ authToken: token, threadId }).catch(() => {});
  }, [markRead, threadId, token, threadData?.replies?.length]);

  const handleSend = async (text, attachments) => {
    if (editing && threadId) {
      await editReply({ authToken: token, threadId, messageId: editing.messageId || editing._id, text });
      setEditing(null);
      setReplyText("");
      return;
    }
    await sendReply({
      authToken: token,
      rootMessageId: threadRoot.messageId || threadRoot._id,
      text,
      attachments,
      quotedMessage: replyTo ? {
        messageId: replyTo.messageId || replyTo._id,
        text: replyTo.text,
        senderId: replyTo.senderId,
        createdAt: replyTo.createdAt,
      } : undefined,
    });
    setReplyTo(null);
    setReplyText("");
  };

  return (
    <aside className="thread-panel">
      <header>
        <div>
          <strong>Thread</strong>
          <small>{threadData?.thread?.replyCount || 0} replies</small>
        </div>
        <IconButton title="Close thread" onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className="thread-root">
        <span>Thread from {getName(threadData?.rootMessage?.senderProfile || threadRoot?.senderProfile)}</span>
        <p>{threadData?.rootMessage?.text || threadRoot?.text || "Attachment"}</p>
      </div>
      <div className="thread-scroll">
        {(threadData?.replies || []).map((reply, index, list) => (
          <MessageBubble
            key={reply._id || reply.messageId}
            message={reply}
            previous={list[index - 1] ? { type: "message", message: list[index - 1] } : null}
            next={list[index + 1] ? { type: "message", message: list[index + 1] } : null}
            currentUser={currentUser}
            isThreadMessage
            onReply={setReplyTo}
            onThread={() => {}}
            onForward={() => {}}
            onEdit={setEditing}
            onDelete={(message) => threadId && deleteReply({ authToken: token, threadId, messageId: message.messageId || message._id })}
            onReaction={(message, emoji) => threadId && reactReply({ authToken: token, threadId, messageId: message.messageId || message._id, emoji })}
          />
        ))}
        {threadData && threadData.replies?.length === 0 && <p className="thread-empty">Start a focused side conversation.</p>}
      </div>
      <Composer
        value={replyText}
        onChange={setReplyText}
        onSend={handleSend}
        replyTo={replyTo}
        editing={editing}
        onCancelContext={() => { setReplyTo(null); setEditing(null); setReplyText(""); }}
        uploadFiles={uploadFiles}
      />
    </aside>
  );
}

function InfoPanel({ selected, summary, room, currentUser, users, onClose, onAddMembers, onUpdateRoom, onUpdateSettings }) {
  const [memberIds, setMemberIds] = useState([]);
  const [roomDraft, setRoomDraft] = useState({ name: room?.name || "", description: room?.description || "" });
  const [settingsDraft, setSettingsDraft] = useState(currentUser?.settings || {});

  useEffect(() => {
    setRoomDraft({ name: room?.name || "", description: room?.description || "" });
  }, [room?.name, room?.description]);

  if (!selected) return null;
  const directUser = summary?.user || selected.user;

  return (
    <aside className="info-panel">
      <header>
        <strong>{selected.type === "room" ? "Room details" : "Contact"}</strong>
        <IconButton title="Close details" onClick={onClose}><X size={18} /></IconButton>
      </header>

      {selected.type === "direct" ? (
        <section className="info-hero">
          <Avatar entity={directUser} size="lg" />
          <h2>{getName(directUser)}</h2>
          <p>{directUser?.bio || directUser?.status || "No status set."}</p>
        </section>
      ) : (
        <>
          <section className="info-hero">
            <Avatar entity={room} size="lg" />
            <h2>{room?.name}</h2>
            <p>{room?.description || `${room?.memberCount || 0} members`}</p>
          </section>
          {["owner", "admin"].includes(room?.viewerRole) && (
            <form className="settings-stack" onSubmit={(event) => {
              event.preventDefault();
              onUpdateRoom({ name: roomDraft.name, description: roomDraft.description });
            }}>
              <label><span>Name</span><input value={roomDraft.name} onChange={(event) => setRoomDraft({ ...roomDraft, name: event.target.value })} /></label>
              <label><span>Description</span><input value={roomDraft.description} onChange={(event) => setRoomDraft({ ...roomDraft, description: event.target.value })} /></label>
              <label className="check-row"><input type="checkbox" checked={Boolean(room?.settings?.onlyAdminsCanMessage)} onChange={(event) => onUpdateRoom({ settings: { onlyAdminsCanMessage: event.target.checked } })} /> Only admins can message</label>
              <button className="primary-button small">Save room</button>
            </form>
          )}
          <section className="member-section">
            <h3>Members</h3>
            {(room?.members || []).map((member) => (
              <div key={member.membershipId} className="member-row">
                <Avatar entity={member.user} size="sm" />
                <span>{getName(member.user)}</span>
                <small>{member.role}</small>
              </div>
            ))}
          </section>
          <section className="member-section">
            <h3>Add members</h3>
            <div className="member-picker">
              {(users || []).map((user) => {
                const already = room?.members?.some((member) => member.userId === user.publicId);
                const picked = memberIds.includes(user.publicId);
                if (already) return null;
                return (
                  <button key={user.publicId} type="button" className={picked ? "picked" : ""} onClick={() => {
                    setMemberIds((current) => picked ? current.filter((id) => id !== user.publicId) : [...current, user.publicId]);
                  }}>
                    <Avatar entity={user} size="xs" /> {getName(user)}
                  </button>
                );
              })}
            </div>
            <button type="button" className="secondary-button" disabled={!memberIds.length} onClick={async () => {
              await onAddMembers(memberIds);
              setMemberIds([]);
            }}>Add selected</button>
          </section>
        </>
      )}

      <section className="member-section">
        <h3>Your settings</h3>
        <label className="check-row"><input type="checkbox" checked={settingsDraft.readReceipts !== false} onChange={(event) => setSettingsDraft({ ...settingsDraft, readReceipts: event.target.checked })} /> Read receipts</label>
        <label className="check-row"><input type="checkbox" checked={settingsDraft.typingIndicator !== false} onChange={(event) => setSettingsDraft({ ...settingsDraft, typingIndicator: event.target.checked })} /> Typing indicators</label>
        <label className="check-row"><input type="checkbox" checked={settingsDraft.notifications !== false} onChange={(event) => setSettingsDraft({ ...settingsDraft, notifications: event.target.checked })} /> Notifications</label>
        <button type="button" className="secondary-button" onClick={() => onUpdateSettings(settingsDraft)}>Save settings</button>
      </section>
    </aside>
  );
}

function ForwardDialog({ token, source, summaries, users, onClose }) {
  const forwardMessage = useMutation(api.messages.forwardMessage);
  if (!source) return null;
  const forwardToSummary = async (summary) => {
    await forwardMessage({
      authToken: token,
      messageId: source.messageId || source._id,
      targetType: summary.type,
      targetUserId: summary.type === "direct" ? summary.directUserId : undefined,
      targetRoomId: summary.type === "room" ? summary.conversationId : undefined,
    });
    onClose();
  };
  const forwardToUser = async (user) => {
    await forwardMessage({
      authToken: token,
      messageId: source.messageId || source._id,
      targetType: "direct",
      targetUserId: user.publicId,
    });
    onClose();
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="forward-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <strong>Forward message</strong>
          <IconButton title="Close" onClick={onClose}><X size={18} /></IconButton>
        </header>
        <div className="forward-preview">{source.text || "Attachment"}</div>
        <div className="forward-list">
          {(summaries || []).map((summary) => (
            <button key={summary.conversationId} type="button" onClick={() => forwardToSummary(summary)}>
              <Avatar entity={summary.type === "room" ? summary.room : summary.user} size="sm" />
              {summary.title}
            </button>
          ))}
          {(users || []).map((user) => (
            <button key={user.publicId} type="button" onClick={() => forwardToUser(user)}>
              <Avatar entity={user} size="sm" />
              {getName(user)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChatApp({ token, onLogout }) {
  const currentUser = useQuery(api.auth.me, token ? { authToken: token } : "skip");
  const summaries = useQuery(api.conversations.list, token ? { authToken: token } : "skip") || [];
  const rooms = useQuery(api.rooms.list, token ? { authToken: token } : "skip") || [];
  const users = useQuery(api.users.list, token ? { authToken: token } : "skip") || [];
  const createDemoWorkspace = useMutation(api.auth.createDemoWorkspace);
  const createRoom = useMutation(api.rooms.create);
  const addMembers = useMutation(api.rooms.addMembers);
  const updateRoom = useMutation(api.rooms.update);
  const updateSettings = useMutation(api.users.updateSettings);
  const sendDirect = useMutation(api.messages.sendDirect);
  const sendRoom = useMutation(api.messages.sendRoom);
  const editMessage = useMutation(api.messages.edit);
  const deleteMessage = useMutation(api.messages.remove);
  const reactMessage = useMutation(api.messages.toggleReaction);
  const markRead = useMutation(api.messages.markConversationRead);
  const setPreference = useMutation(api.conversations.setPreference);
  const heartbeat = useMutation(api.presence.heartbeat);
  const setTyping = useMutation(api.presence.setTyping);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [threadRoot, setThreadRoot] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [forwardSource, setForwardSource] = useState(null);
  const typingTimerRef = useRef(null);

  const currentSummary = summaries.find((summary) => summary.conversationId === selected?.conversationId);
  const room = useQuery(api.rooms.get, token && selected?.type === "room" ? { authToken: token, roomId: selected.conversationId } : "skip");
  const messages = useQuery(api.messages.list, token && selected ? {
    authToken: token,
    conversationType: selected.type,
    conversationId: selected.conversationId,
    limit: 120,
  } : "skip") || [];
  const typingUsers = useQuery(api.presence.listTyping, token && selected ? {
    authToken: token,
    conversationType: selected.type,
    conversationId: selected.conversationId,
  } : "skip") || [];

  const presenceIds = useMemo(() => {
    const ids = new Set(users.map((user) => user.publicId));
    summaries.forEach((summary) => {
      if (summary.directUserId) ids.add(summary.directUserId);
    });
    return [...ids];
  }, [summaries, users]);
  const presence = useQuery(api.presence.getUsersPresence, token ? { authToken: token, userIds: presenceIds } : "skip") || [];
  const presenceById = useMemo(() => new Map(presence.map((entry) => [entry.userId, entry])), [presence]);

  useEffect(() => {
    if (!selected && summaries.length > 0) {
      const first = summaries[0];
      setSelected({ type: first.type, conversationId: first.conversationId, directUserId: first.directUserId, title: first.title, user: first.user, room: first.room });
    }
  }, [selected, summaries]);

  useEffect(() => {
    if (!token) return undefined;
    heartbeat({ authToken: token }).catch(() => {});
    const id = setInterval(() => heartbeat({ authToken: token }).catch(() => {}), 45_000);
    return () => clearInterval(id);
  }, [heartbeat, token]);

  useEffect(() => {
    if (!selected || !messages.length) return;
    const last = messages[messages.length - 1];
    markRead({
      authToken: token,
      conversationType: selected.type,
      conversationId: selected.conversationId,
      lastReadMessageId: last.messageId || last._id,
    }).catch(() => {});
  }, [markRead, messages.length, selected?.conversationId, selected?.type, token]);

  const uploadFiles = useCallback(async (files) => {
    const uploaded = [];
    for (const file of files) {
      const uploadUrl = await generateUploadUrl({ authToken: token });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed for ${file.name}`);
      const { storageId } = await response.json();
      uploaded.push({ storageId, name: file.name, type: file.type || "application/octet-stream", size: file.size });
    }
    return uploaded;
  }, [generateUploadUrl, token]);

  const startTyping = useCallback(() => {
    if (!selected || currentUser?.settings?.typingIndicator === false) return;
    setTyping({ authToken: token, conversationType: selected.type, conversationId: selected.conversationId, isTyping: true }).catch(() => {});
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setTyping({ authToken: token, conversationType: selected.type, conversationId: selected.conversationId, isTyping: false }).catch(() => {});
    }, 1600);
  }, [currentUser?.settings?.typingIndicator, selected, setTyping, token]);

  const clearComposerContext = () => {
    setReplyTo(null);
    setEditing(null);
    if (editing) setComposerText("");
  };

  const sendCurrentMessage = async (text, attachments = []) => {
    if (!selected) return;
    if (editing) {
      await editMessage({ authToken: token, messageId: editing.messageId || editing._id, text });
      setEditing(null);
      setComposerText("");
      return;
    }
    const quotedMessage = replyTo ? {
      messageId: replyTo.messageId || replyTo._id,
      text: replyTo.text,
      senderId: replyTo.senderId,
      createdAt: replyTo.createdAt,
    } : undefined;
    if (selected.type === "room") {
      await sendRoom({ authToken: token, roomId: selected.conversationId, text, attachments, quotedMessage });
    } else {
      await sendDirect({ authToken: token, receiverId: selected.directUserId, text, attachments, quotedMessage });
    }
    setComposerText("");
    setReplyTo(null);
  };

  const selectSummary = (summary) => {
    setSelected({ type: summary.type, conversationId: summary.conversationId, directUserId: summary.directUserId, title: summary.title, user: summary.user, room: summary.room });
    setThreadRoot(null);
    setShowInfo(false);
  };

  const startDirect = (user) => {
    setSelected({
      type: "direct",
      conversationId: directConversationId(currentUser.publicId, user.publicId),
      directUserId: user.publicId,
      title: getName(user),
      user,
    });
    setThreadRoot(null);
  };

  const filteredMessages = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();
    if (!query) return messages;
    return messages.filter((message) => [message.text, message.senderProfile?.fullName].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [messageSearch, messages]);

  if (currentUser === undefined) {
    return <main className="loading-screen">Loading Hyperchat...</main>;
  }

  if (!currentUser) {
    localStorage.removeItem(TOKEN_KEY);
    onLogout();
    return null;
  }

  return (
    <main className={`app-shell ${selected ? "has-selection" : ""}`}>
      <ConversationRail
        currentUser={currentUser}
        selected={selected}
        summaries={summaries}
        rooms={rooms}
        users={users}
        presence={presence}
        search={search}
        onSearch={setSearch}
        onSelectSummary={selectSummary}
        onStartDirect={startDirect}
        onCreateRoom={async (payload) => {
          const nextRoom = await createRoom({ authToken: token, ...payload });
          setSelected({ type: "room", conversationId: nextRoom.roomId, title: nextRoom.name, room: nextRoom });
        }}
        onOpenSettings={() => setShowInfo(true)}
        onLogout={() => {
          localStorage.removeItem(TOKEN_KEY);
          onLogout();
        }}
      />

      <section className="chat-pane">
        <ChatHeader
          selected={selected}
          currentSummary={currentSummary}
          room={room}
          presence={selected?.type === "direct" ? presenceById.get(selected.directUserId) : null}
          typingUsers={typingUsers}
          onBack={() => setSelected(null)}
          onInfo={() => setShowInfo((value) => !value)}
          onSearch={() => setShowMessageSearch((value) => !value)}
          onTogglePin={() => currentSummary && setPreference({ authToken: token, conversationId: currentSummary.conversationId, pinned: !currentSummary.pinned })}
          onToggleMute={() => currentSummary && setPreference({ authToken: token, conversationId: currentSummary.conversationId, muted: !currentSummary.muted })}
        />

        {showMessageSearch && (
          <div className="message-search">
            <Search size={15} />
            <input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search this chat" />
            <IconButton title="Close search" onClick={() => { setShowMessageSearch(false); setMessageSearch(""); }}><X size={16} /></IconButton>
          </div>
        )}

        {!selected ? (
          <div className="empty-chat">
            <Hash size={36} />
            <h2>Select a chat</h2>
            <p>Direct messages and rooms live in one focused Monax-style rail.</p>
            <button type="button" className="secondary-button" onClick={() => createDemoWorkspace({ authToken: token })}>Create demo people</button>
          </div>
        ) : (
          <>
            <MessageList
              messages={filteredMessages}
              currentUser={currentUser}
              typingUsers={typingUsers}
              onReply={(message) => { setReplyTo(message); setEditing(null); }}
              onThread={setThreadRoot}
              onForward={setForwardSource}
              onEdit={(message) => { setEditing(message); setReplyTo(null); setComposerText(message.text || ""); }}
              onDelete={(message) => deleteMessage({ authToken: token, messageId: message.messageId || message._id })}
              onReaction={(message, emoji) => reactMessage({ authToken: token, messageId: message.messageId || message._id, emoji })}
            />
            <Composer
              value={composerText}
              onChange={setComposerText}
              onSend={sendCurrentMessage}
              replyTo={replyTo}
              editing={editing}
              onCancelContext={clearComposerContext}
              onTyping={startTyping}
              uploadFiles={uploadFiles}
            />
          </>
        )}
      </section>

      {threadRoot && (
        <ThreadPanel
          token={token}
          currentUser={currentUser}
          threadRoot={threadRoot}
          onClose={() => setThreadRoot(null)}
          uploadFiles={uploadFiles}
        />
      )}

      {showInfo && (
        <InfoPanel
          selected={selected}
          summary={currentSummary}
          room={room}
          currentUser={currentUser}
          users={users}
          onClose={() => setShowInfo(false)}
          onAddMembers={(memberIds) => selected?.type === "room" && addMembers({ authToken: token, roomId: selected.conversationId, memberIds })}
          onUpdateRoom={(patch) => selected?.type === "room" && updateRoom({ authToken: token, roomId: selected.conversationId, ...patch })}
          onUpdateSettings={(settings) => updateSettings({ authToken: token, settings })}
        />
      )}

      <ForwardDialog
        token={token}
        source={forwardSource}
        summaries={summaries}
        users={users}
        onClose={() => setForwardSource(null)}
      />
    </main>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  if (!token) return <AuthScreen onToken={setToken} />;
  return <ChatApp token={token} onLogout={() => setToken("")} />;
}
