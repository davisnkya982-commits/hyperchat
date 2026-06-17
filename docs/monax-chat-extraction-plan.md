# Monax Chat Extraction Plan

Hyperchat is a focused chat product, not a broad Monax clone. The app keeps the chat contract and pane-led interaction model from Monax while removing calls, statuses, feeds, communities, games, music surfaces, QR/device flows, admin tools, and social discovery tabs.

## Product Lane

- Dense chat workbench: account rail, conversation rail, message timeline, composer, and optional right rail.
- Message-first UI: direct chats and group rooms are the primary objects; settings and details open only on intent.
- Compact Monax-inspired treatment: panes, dividers, subtle fills, avatar rings, unread dividers, reaction/thread pills, and stable composer controls.
- Controls must map to real behavior. No visible call/feed/status/community/game affordances.
- Mobile collapses to one primary pane with slide-over detail/thread surfaces.

## Keep And Adapt

- `users`: lightweight Hyperchat profiles, settings, auth session version, block list, online/last-seen preferences.
- `authsessions`: server-issued session tokens; protected functions derive the actor from the token.
- `messages`: direct and group room messages, quote replies, reactions, edit/delete state, read/delivery metadata, lightweight attachments/link fields.
- `messagethreads`, `threadmessages`, `threadreadstates`: thread replies stay out of the main timeline.
- `conversationsummaries`, `conversationreadstates`, `conversationpreferences`: sidebar recency, unread badges, pin/mute/archive, and read watermarks.
- `groups` + `groupmemberships`: standalone group rooms only, with owner/admin/member roles and room settings.
- `userPresence` + `typingIndicators`: online/last-seen and short-lived typing state.
- `notifications`: in-app unread activity for messages, group messages, and thread replies.

## Simplify

- Use canonical Hyperchat IDs only. Avoid Monax legacy `mongoId`/Convex-ID alias complexity except where the UI needs stable public IDs.
- Use email/password demo auth with SHA-256 password hashing for a local MVP. Production should replace this with a hardened auth provider or stronger password hashing before real user launch.
- Keep file attachments as metadata/link records for now; Convex storage upload can be added after the core chat flow is live.
- Keep link previews as client-rendered URL cards rather than server-side preview fetching.
- Keep notifications in-app only. Browser push/FCM is deferred.

## Exclude

- Calls, LiveKit, call history, call controls.
- Status updates, feed/Cassiciacum, posts, stories, public discovery.
- Communities/channels/batches and their admin/moderation surfaces.
- Games, music picker/activity, QR/device linking, premium/donation/admin surfaces.
- E2EE key backup/device registry. Message fields leave room for encryption metadata, but no encryption UI is shown.

## Backend Contract

1. Every protected Convex query/mutation requires `authToken` and resolves the current user server-side.
2. Direct message access is allowed only to the sender or receiver resolved from the session.
3. Group room access is allowed only to users with a membership row or owner/admin role on the room.
4. Sending updates conversation summaries for all participants and increments unread counts for recipients.
5. Mark-read writes conversation read state and clears the caller's summary unread count.
6. Thread replies update only thread tables and notifications; they do not change the main message timeline.
7. Group role changes are server-checked. Clients cannot pass their own role/admin state.

## Frontend Contract

- First screen is the app shell. If unauthenticated, show the auth panel inside the shell, not a marketing page.
- Conversation rail merges direct chats and rooms, sorted by pin and latest activity.
- Active chat shows loading, empty, blocked, permission, unread, typing, and error states.
- Composer supports text, quote reply, editing, attachments-as-metadata, emoji insert, and send-on-enter.
- Message menu supports reply, thread, edit own message, delete own message, copy, forward/share, and reactions.
- Right rail is exclusive: thread, room details, user details, or settings.
- Settings toggles update real user/conversation/room settings.

## Validation Target

- `npm install`
- `npm run typecheck`
- `npm run build`
- Convex codegen/check where CLI auth allows it.
- Browser verification for signup/login, direct chat send, room create/send, reply/thread, reaction, mark-read/unread, typing indicator, settings toggles, and responsive layout.

