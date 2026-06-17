/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authSessions from "../authSessions.js";
import type * as chatHelpers from "../chatHelpers.js";
import type * as conversations from "../conversations.js";
import type * as files from "../files.js";
import type * as groupMemberships from "../groupMemberships.js";
import type * as ids from "../ids.js";
import type * as messageThreads from "../messageThreads.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as presence from "../presence.js";
import type * as rooms from "../rooms.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authSessions: typeof authSessions;
  chatHelpers: typeof chatHelpers;
  conversations: typeof conversations;
  files: typeof files;
  groupMemberships: typeof groupMemberships;
  ids: typeof ids;
  messageThreads: typeof messageThreads;
  messages: typeof messages;
  notifications: typeof notifications;
  presence: typeof presence;
  rooms: typeof rooms;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
