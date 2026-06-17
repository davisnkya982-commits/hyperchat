# Hyperchat

Hyperchat is a focused Convex + Vite chat app extracted from Monax's one-to-one chat and standalone group room concepts. It intentionally excludes calls, feeds, statuses, communities, games, music surfaces, and broad social tabs.

## Local Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Connect Convex:

   ```powershell
   npx convex dev
   ```

   The Convex CLI creates `.env.local` with `VITE_CONVEX_URL` after project setup.

3. Run the app:

   ```powershell
   npm run dev
   ```

4. Validate:

   ```powershell
   npm run typecheck
   npm run build
   ```

## Core Features

- Email/password session auth for the MVP.
- Direct chats with read/unread summaries, quote replies, reactions, edits, deletion, forwarding, typing, presence, and preferences.
- Group rooms with memberships, owner/admin/member roles, room settings, unread/read state, typing, and room details.
- Message threads stored separately from the main timeline.
- File attachments through Convex storage upload URLs.
- In-app notifications for messages and thread replies.
- User settings for read receipts, typing, notifications, appearance, and profile basics.

## Production Notes

- The local MVP uses SHA-256 password hashing to keep the scaffold self-contained. Replace it with a hardened auth provider or stronger password hashing before real user launch.
- Browser push, E2EE, server-side rich link fetching, and external identity providers are intentionally deferred.

